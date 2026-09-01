"""Reverse-geocoding proxy (Phase 5.3 — P5.13 Maps integration).

The frontend Leaflet address picker drops a pin, then needs to convert the
lat/lng into a human-readable address. We proxy to OpenStreetMap's
Nominatim service rather than letting the browser hit it directly:

1. **CORS** — Nominatim's CORS rules are tight; proxying side-steps them.
2. **Reliability** — we set a proper User-Agent (Nominatim's usage policy
   requires it; bare browser requests get rate-limited / 403'd).
3. **Throttling** — Nominatim allows only ~1 request/second. We enforce
   that here so the frontend can spam drag-end events without getting
   the shop's IP banned.
4. **Caching** — same lat/lng pair returns the same address for hours.
   We cache in-process for 1 h to keep the external dependency cheap.

Endpoint:
    GET /api/geocode/reverse?lat=24.4&lng=86.7
    -> { lat, lng, display_name, address: {road, suburb, ...} }

SSL notes (Mac / Python 3.12 specific):
    Python 3.12 on macOS (the official python.org installer, NOT brew)
    ships without the curated CA bundle by default. Running
    `urllib.request.urlopen()` against an https:// URL then fails with
    `ssl.SSLCertVerificationError: unable to get local issuer certificate`.
    We use `certifi`'s CA bundle (transitive dep of Flask) to build a
    proper SSL context. As a defensive fallback for the rare case where
    even `certifi` is missing or stale (no `pip install certifi` ever
    ran), we retry once with an unverified context — the only data we
    fetch is a public address string, so no secrets are at risk.
"""
from __future__ import annotations

import json
import logging
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

from flask import Blueprint, jsonify, request

from app.extensions import limiter
from app.utils.ratelimit import limit as rl_limit

log = logging.getLogger("dorito.geocode")

geocode_bp = Blueprint("geocode", __name__, url_prefix="/api/geocode")

# 1 h. Lat/lng → display_name is stable for months unless the area gets
# renamed (rare), so a long TTL is fine — but we want to refresh after
# a rename without requiring a deploy.
_CACHE_TTL_SECONDS = 3600

# Process-local cache: (lat_round, lng_round) → (timestamp, payload).
# Rounding to 5 decimals ≈ 1.1 m at the equator — anything finer is
# noise for street-level addresses.
_CACHE: dict = {}

# Nominatim's usage policy: max 1 request/second. We respect it via a
# class-level throttle on top of the per-IP Flask-Limiter below.
_LAST_REQUEST_AT: float = 0.0
_MIN_INTERVAL_SECONDS = 1.1  # slight buffer over the 1 RPS ceiling

_DEFAULT_BASE = "https://nominatim.openstreetmap.org/reverse"


def _base_url() -> str:
    return os.getenv("NOMINATIM_BASE_URL", _DEFAULT_BASE).rstrip("/")


def _throttle() -> None:
    """Sleep just enough to keep us under Nominatim's 1 RPS limit."""
    global _LAST_REQUEST_AT
    now = time.monotonic()
    wait = _MIN_INTERVAL_SECONDS - (now - _LAST_REQUEST_AT)
    if wait > 0:
        time.sleep(wait)
    _LAST_REQUEST_AT = time.monotonic()


def _build_ssl_context() -> ssl.SSLContext:
    """Build an SSL context that works on every reasonable Python install.

    Preferred path: `certifi`'s CA bundle (curated, kept up to date by
    pip). `certifi` is a transitive dep of Flask so it's almost always
    present. Fallback: the system default trust store. If even that
    fails (rare Mac + python.org install), the caller will catch the
    SSL error and retry with an unverified context.
    """
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:  # noqa: BLE001 — certifi may be missing/stale
        log.warning("certifi_missing_fallback_to_system_trust")
        return ssl.create_default_context()


@geocode_bp.get("/reverse")
@rl_limit(limiter, "30 per 10 minutes")
def reverse():
    """Reverse-geocode lat/lng → human-readable address.

    Query params:
        lat (required): -90..90
        lng (required): -180..180

    Returns:
        { lat, lng, display_name, address } on success
        { error, detail } on failure
    """
    try:
        lat = float(request.args.get("lat", ""))
        lng = float(request.args.get("lng", ""))
    except (TypeError, ValueError):
        return jsonify(error="lat and lng must be numbers"), 400

    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return jsonify(error="lat must be in [-90, 90], lng in [-180, 180]"), 400

    # Round for cache key (5 decimals ≈ 1.1 m at the equator).
    key = (round(lat, 5), round(lng, 5))
    now = time.time()
    cached = _CACHE.get(key)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return jsonify(cached[1])

    # Throttle to respect Nominatim's 1 RPS ceiling.
    _throttle()

    params = {
        "format": "jsonv2",
        "lat": str(lat),
        "lon": str(lng),
        "zoom": "18",  # house-level detail
        "addressdetails": "1",
        "accept-language": "en",
    }
    url = f"{_base_url()}?{urllib.parse.urlencode(params)}"

    # Nominatim's usage policy requires a descriptive User-Agent and a
    # Referer. TRACK_BASE_URL is the closest match (the shop domain);
    # fall back to the OSM homepage if not configured.
    referer = os.getenv("TRACK_BASE_URL") or "https://www.openstreetmap.org/"
    ua = os.getenv("NOMINATIM_USER_AGENT") or "DoritoPizza/1.0 (contact: shop owner)"

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": ua,
            "Referer": referer,
            "Accept": "application/json",
        },
    )

    # Try the proper CA-verified context first. If that fails on the
    # classic Mac + python.org SSL bug (no `Install Certificates.command`
    # run), retry with an unverified context so the customer-facing
    # feature still works. We only fetch a public address string, so
    # there's no secret at risk of MITM.
    try:
        ctx = _build_ssl_context()
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
    except urllib.error.HTTPError as e:
        # Nominatim returns 429 if you exceed the rate limit. Surface it
        # as a friendly 503 so the frontend can show a fallback message
        # (manual address entry) instead of a hard error.
        log.warning(
            "nominatim_http_error",
            extra={"status": e.code, "lat": lat, "lng": lng},
        )
        return (
            jsonify(
                error="Geocoding service is busy. Please type the address manually.",
                detail=f"nominatim {e.code}",
            ),
            503 if e.code == 429 else 502,
        )
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        # If it's an SSL verification failure, retry once with an
        # unverified context. Anything else (DNS, connection refused,
        # malformed JSON) bubbles up to the 502.
        reason = getattr(e, "reason", None)
        is_ssl_verify = (
            isinstance(reason, ssl.SSLCertVerificationError)
            or "CERTIFICATE_VERIFY_FAILED" in str(e)
        )
        if is_ssl_verify:
            try:
                log.warning(
                    "nominatim_ssl_verify_failed_retrying_unverified",
                    extra={"lat": lat, "lng": lng},
                )
                ctx_unsafe = ssl._create_unverified_context()  # noqa: SLF001
                with urllib.request.urlopen(req, timeout=5, context=ctx_unsafe) as resp:
                    raw = resp.read().decode("utf-8")
                    data = json.loads(raw)
            except Exception as retry_err:  # noqa: BLE001
                log.warning(
                    "nominatim_unreachable_after_ssl_retry",
                    exc_info=True,
                    extra={"lat": lat, "lng": lng},
                )
                return (
                    jsonify(
                        error=(
                            "Geocoding service unreachable. "
                            "Please type the address manually."
                        ),
                        detail=type(retry_err).__name__,
                    ),
                    502,
                )
        else:
            log.warning(
                "nominatim_unreachable",
                exc_info=True,
                extra={"lat": lat, "lng": lng},
            )
            return (
                jsonify(
                    error=(
                        "Geocoding service unavailable. "
                        "Please type the address manually."
                    ),
                    detail=type(e).__name__,
                ),
                502,
            )

    display_name = data.get("display_name") or ""
    address = data.get("address") or {}
    payload = {
        "lat": lat,
        "lng": lng,
        "display_name": display_name,
        "address": address,
    }
    _CACHE[key] = (now, payload)
    return jsonify(payload)
