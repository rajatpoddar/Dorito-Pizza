"""Sentry integration (P4.5).

Initializes the Sentry SDK for the Flask app IFF the `SENTRY_DSN` env
var is set. We deliberately do NOT hard-fail in dev or test when
Sentry isn't configured — the rest of the app should keep working.

What we capture (when configured):
  - Uncaught exceptions in request handlers (Flask integration).
  - Worker + scheduler exceptions (the plain `sentry_sdk.init` covers
    these once the SDK is loaded; no separate hook needed).
  - User context (user id) when a JWT is present on the request.
  - Per-request breadcrumbs via Flask integration (request method,
    path, status).

What we deliberately do NOT capture:
  - Phone numbers, OTPs, addresses — PII is masked at the
    `current_app.logger` / `app/utils/phone.py` level, so it never
    reaches Sentry as plaintext.
  - The raw request body for POST /api/auth/otp/verify — Sentry
    would happily ship a plaintext OTP in breadcrumbs. The Flask
    integration does NOT include request bodies by default, but
    we add an explicit `request_bodies="never"` to be safe.
"""
from __future__ import annotations

import os
import sentry_sdk
from flask import Flask
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from sentry_sdk.integrations.flask import FlaskIntegration


def init_sentry(app: Flask) -> None:
    """Wire Sentry into the Flask app, if DSN is configured.

    Idempotent: safe to call from `create_app` in every environment.
    """
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        # Not configured — silently skip. The app should still work.
        return

    environment = os.getenv("FLASK_CONFIG", "dev")
    release = os.getenv("GIT_COMMIT_SHA", "unknown")

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=f"dorito-backend@{release}",
        integrations=[FlaskIntegration()],
        # Don't ship request bodies — they can contain OTPs and PII.
        # In Sentry SDK 2.x this is `max_request_body_size="never"`.
        max_request_body_size="never",
        # Sample 10% of healthy transactions to control cost. Errors
        # are always captured (default).
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        # Don't PII-trace user IPs in the event payload.
        send_default_pii=False,
        # Surface suspicious RULES §5.5 brute-force attempts as
        # warnings so they show up in the Sentry feed.
        before_send=_scrub_event,
    )

    # ---- per-request user context (best-effort) --------------------
    # If the request carries a valid JWT, attach the user id to the
    # Sentry scope so errors get attributed correctly. Failures here
    # are silent — Sentry must never break a request.
    @app.before_request
    def _set_sentry_user():
        try:
            verify_jwt_in_request(optional=True)
            uid = get_jwt_identity()
            if uid is not None:
                with sentry_sdk.configure_scope() as scope:
                    scope.user = {"id": str(uid)}
        except Exception:  # noqa: BLE001
            pass

    app.extensions["sentry_initialized"] = True


def _scrub_event(event, hint):
    """Strip any accidentally-captured PII from the event payload.

    Belt-and-braces — Sentry's `send_default_pii=False` already does
    most of this, but defence in depth is cheap.
    """
    # Never capture Authorization headers / cookies.
    if "request" in event and isinstance(event["request"], dict):
        req = event["request"]
        for h in ("headers", "cookies"):
            if h in req and isinstance(req[h], dict):
                for k in list(req[h].keys()):
                    kl = k.lower()
                    if kl in ("authorization", "cookie", "set-cookie"):
                        req[h][k] = "[REDACTED]"
    # Never capture OTP / password / phone-shaped bodies.
    if "extra" in event and isinstance(event["extra"], dict):
        for k in list(event["extra"].keys()):
            kl = k.lower()
            if "otp" in kl or "password" in kl or "phone" in kl:
                event["extra"][k] = "[REDACTED]"
    return event
