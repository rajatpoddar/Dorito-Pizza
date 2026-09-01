"""Integration tests for the geocode proxy + map order fields (Phase 5.3).

Two responsibilities:
- `TestGeocodeReverse`         — /api/geocode/reverse input + happy path (mocked).
- `TestOrderDeliveryLatLng`    — Order.delivery_lat / delivery_lng persist + serialize.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from app.extensions import db
from app.models import Category, MenuItem, User


# ---------- shared fixtures ----------


@pytest.fixture
def customer_token(client, app):
    """Create a customer and return their JWT."""
    with app.app_context():
        user = User(name="Map Tester", phone="9876500000", role="customer")
        user.set_password("Test@123")
        db.session.add(user)
        db.session.commit()

    r = client.post(
        "/api/auth/login", json={"phone": "9876500000", "password": "Test@123"}
    )
    assert r.status_code == 200, r.get_json()
    return r.get_json()["access_token"]


@pytest.fixture
def auth_h(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


@pytest.fixture
def one_menu_item(app):
    """Insert one MenuItem so we can place a test order."""
    with app.app_context():
        cat = Category(name="Test Cat", display_order=1)
        db.session.add(cat)
        db.session.flush()
        item = MenuItem(
            category_id=cat.id,
            name="Test Pizza",
            description="t",
            price=100.0,
            is_available=True,
            is_veg=True,
        )
        db.session.add(item)
        db.session.commit()
        return item.id


def _login_mgr(client):
    r = client.post(
        "/api/auth/login",
        json={"phone": "6202965250", "password": "Manager@123"},
    )
    assert r.status_code == 200, r.get_json()
    return r.get_json()["access_token"]


@pytest.fixture(autouse=True)
def _clear_geocode_cache():
    """Reset the in-process geocode cache between tests.

    The cache lives in module-level state (`app.routes.geocode._CACHE`),
    so without this fixture a later test would silently get a cache hit
    from an earlier one and the upstream mock would never fire.
    """
    from app.routes import geocode as geocode_module

    geocode_module._CACHE.clear()
    yield
    geocode_module._CACHE.clear()


# ===================== /api/geocode/reverse =====================


class TestGeocodeReverse:
    """Reverse-geocoding proxy — input validation + happy path (mocked)."""

    def test_missing_lat_returns_400(self, client):
        r = client.get("/api/geocode/reverse?lng=86.7")
        assert r.status_code == 400

    def test_missing_lng_returns_400(self, client):
        r = client.get("/api/geocode/reverse?lat=24.4")
        assert r.status_code == 400

    def test_non_numeric_returns_400(self, client):
        r = client.get("/api/geocode/reverse?lat=abc&lng=86.7")
        assert r.status_code == 400

    def test_out_of_range_lat_returns_400(self, client):
        r = client.get("/api/geocode/reverse?lat=120&lng=86.7")
        assert r.status_code == 400

    def test_out_of_range_lng_returns_400(self, client):
        r = client.get("/api/geocode/reverse?lat=24.4&lng=200")
        assert r.status_code == 400

    def test_happy_path_with_mock(self, client):
        """Mock the nominatim call so the test is hermetic."""
        fake_payload = {
            "display_name": "Foo Road, Bar, Baz 814146, India",
            "address": {
                "road": "Foo Road",
                "village": "Palojori",
                "state": "Jharkhand",
                "postcode": "814146",
                "country": "India",
            },
        }
        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            # `with urlopen(...) as resp:` — the context manager __enter__
            # returns `resp`, so we wire bytes through resp.read().
            mocked.return_value.__enter__.return_value.read.return_value = (
                json.dumps(fake_payload).encode("utf-8")
            )
            r = client.get("/api/geocode/reverse?lat=24.41&lng=86.71")

        assert r.status_code == 200, r.get_json()
        body = r.get_json()
        assert body["lat"] == 24.41
        assert body["lng"] == 86.71
        assert body["display_name"].startswith("Foo Road")
        assert body["address"]["village"] == "Palojori"

    def test_caches_response(self, client):
        """A second identical request must not hit the upstream again."""
        fake_payload = {"display_name": "X", "address": {"village": "Palojori"}}
        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            mocked.return_value.__enter__.return_value.read.return_value = (
                json.dumps(fake_payload).encode("utf-8")
            )
            client.get("/api/geocode/reverse?lat=24.4&lng=86.7")
            client.get("/api/geocode/reverse?lat=24.4&lng=86.7")  # same coords
        # First call only; second served from cache.
        assert mocked.call_count == 1

    def test_upstream_429_surfaces_as_503(self, client):
        import urllib.error

        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            # The HTTPError is raised by `with urlopen(...) as resp:`
            # because urlopen() itself raises on 4xx/5xx HTTP responses.
            mocked.side_effect = urllib.error.HTTPError(
                url="x", code=429, msg="Too Many Requests", hdrs={}, fp=None
            )
            r = client.get("/api/geocode/reverse?lat=24.4&lng=86.7")
        assert r.status_code == 503, r.get_json()
        assert "busy" in r.get_json()["error"].lower()

    def test_upstream_unreachable_surfaces_as_502(self, client):
        import urllib.error

        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            mocked.side_effect = urllib.error.URLError("connection refused")
            r = client.get("/api/geocode/reverse?lat=24.4&lng=86.7")
        assert r.status_code == 502, r.get_json()

    def test_upstream_500_surfaces_as_502(self, client):
        """A non-429 HTTPError from upstream is a generic 502."""
        import urllib.error

        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            mocked.side_effect = urllib.error.HTTPError(
                url="x", code=500, msg="Server Error", hdrs={}, fp=None
            )
            r = client.get("/api/geocode/reverse?lat=24.4&lng=86.7")
        assert r.status_code == 502, r.get_json()


# ===================== Order lat/lng fields (P5.13) =====================


class TestOrderDeliveryLatLng:
    """`Order.delivery_lat` / `delivery_lng` are stored + returned."""

    def test_order_persists_lat_lng(self, client, auth_h, one_menu_item):
        r = client.post(
            "/api/orders",
            headers=auth_h,
            json={
                "customer_name": "Map Customer",
                "customer_phone": "9876500000",
                "delivery_address": "Some place, Palojori",
                "delivery_lat": 24.4125,
                "delivery_lng": 86.7031,
                "payment_mode": "cod",
                "items": [{"menu_item_id": one_menu_item, "quantity": 1, "name": "Test Pizza"}],
            },
        )
        assert r.status_code == 201, r.get_json()
        body = r.get_json()
        assert body["order"]["delivery_lat"] == 24.4125
        assert body["order"]["delivery_lng"] == 86.7031

    def test_order_without_lat_lng_works(self, client, auth_h, one_menu_item):
        """Backward compatible — guests and old clients without the map
        picker can still place orders; lat/lng default to None."""
        r = client.post(
            "/api/orders",
            headers=auth_h,
            json={
                "customer_name": "No Map",
                "customer_phone": "9876500000",
                "delivery_address": "Just typing it, Palojori",
                "payment_mode": "cod",
                "items": [{"menu_item_id": one_menu_item, "quantity": 1, "name": "Test Pizza"}],
            },
        )
        assert r.status_code == 201, r.get_json()
        order = r.get_json()["order"]
        assert order["delivery_lat"] is None
        assert order["delivery_lng"] is None

    def test_invalid_lat_coerced_to_none(self, client, auth_h, one_menu_item):
        """Garbage lat/lng shouldn't break checkout — we coerce to None."""
        r = client.post(
            "/api/orders",
            headers=auth_h,
            json={
                "customer_name": "Bad Coords",
                "customer_phone": "9876500000",
                "delivery_address": "Some place, Palojori",
                "delivery_lat": "not-a-number",
                "delivery_lng": None,
                "payment_mode": "cod",
                "items": [{"menu_item_id": one_menu_item, "quantity": 1, "name": "Test Pizza"}],
            },
        )
        assert r.status_code == 201, r.get_json()
        order = r.get_json()["order"]
        assert order["delivery_lat"] is None
        assert order["delivery_lng"] is None

    def test_admin_orders_expose_lat_lng(self, client, app, auth_h, one_menu_item):
        """Manager-side: /api/admin/orders returns lat/lng for the pin map."""
        # Place the order as the customer first
        client.post(
            "/api/orders",
            headers=auth_h,
            json={
                "customer_name": "Map Customer",
                "customer_phone": "9876500000",
                "delivery_address": "Pin me, Palojori",
                "delivery_lat": 24.42,
                "delivery_lng": 86.71,
                "payment_mode": "cod",
                "items": [{"menu_item_id": one_menu_item, "quantity": 1, "name": "Test Pizza"}],
            },
        )

        # Manager session
        with app.app_context():
            mgr = User(name="Mgr", phone="6202965250", role="manager")
            mgr.set_password("Manager@123")
            db.session.add(mgr)
            db.session.commit()
        tok = _login_mgr(client)
        h = {"Authorization": f"Bearer {tok}"}

        r = client.get("/api/admin/orders", headers=h)
        assert r.status_code == 200, r.get_json()
        orders = r.get_json()["orders"]
        assert len(orders) >= 1
        target = next(o for o in orders if o["customer_name"] == "Map Customer")
        assert target["delivery_lat"] == 24.42
        assert target["delivery_lng"] == 86.71


# ===================== SSL retry (Mac / Python 3.12) =====================


class TestGeocodeSslFallback:
    """When `certifi`/system trust fails, retry once with unverified ctx.

    The Mac + python.org 3.12 default install ships without the curated
    CA bundle, so `urllib.request.urlopen()` against an https URL fails
    with `SSLCertVerificationError`. The route transparently retries
    with an unverified SSL context (the only data fetched is a public
    address string).
    """

    def test_ssl_verify_error_triggers_unverified_retry(self, client):
        import ssl
        import urllib.error

        fake_payload = {
            "display_name": "After SSL fallback, somewhere",
            "address": {"village": "Palojori"},
        }
        body_bytes = json.dumps(fake_payload).encode("utf-8")
        call_count = {"n": 0}

        def fake_urlopen(req, timeout=5, context=None):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First attempt: SSL verify failure wrapped in URLError
                raise urllib.error.URLError(
                    ssl.SSLCertVerificationError(
                        "certificate verify failed: unable to get local issuer certificate"
                    )
                )
            # Second attempt (unverified): success

            class _Resp:
                def __init__(self, body):
                    self._body = body

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

                def read(self):
                    return self._body

            return _Resp(body_bytes)

        with patch("app.routes.geocode.urllib.request.urlopen", side_effect=fake_urlopen):
            r = client.get("/api/geocode/reverse?lat=24.4&lng=86.7")

        assert r.status_code == 200, r.get_json()
        assert call_count["n"] == 2  # verified → unverified
        assert r.get_json()["display_name"].startswith("After SSL fallback")

    def test_non_ssl_urlerror_still_returns_502(self, client):
        """A non-SSL URLError (e.g. DNS failure) does NOT trigger retry."""
        import urllib.error

        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            mocked.side_effect = urllib.error.URLError("Name or service not known")
            r = client.get("/api/geocode/reverse?lat=24.4&lng=86.7")
        assert r.status_code == 502
        assert "unavailable" in r.get_json()["error"].lower()

    def test_ssl_retry_also_fails_returns_502(self, client):
        """If even the unverified retry fails, surface a 502."""
        import ssl
        import urllib.error

        with patch("app.routes.geocode.urllib.request.urlopen") as mocked:
            mocked.side_effect = urllib.error.URLError(
                ssl.SSLCertVerificationError("still broken")
            )
            r = client.get("/api/geocode/reverse?lat=24.4&lng=86.7")
        assert r.status_code == 502
