"""Integration tests for the shop settings endpoints.

The shop settings drive the customer-facing shop status banner, the
delivery charge on checkout, and the manager's ability to flip the
"is_shop_open" master switch (P3.x, see MEMORY §3 invariant 8).
"""
import pytest

from app.extensions import db
from app.models import ShopSettings, User


def _login_manager(client, phone="6000000000", password="Manager@123"):
    with client.application.app_context():
        mgr = User(name="Manager", phone=phone, role=User.ROLE_MANAGER)
        mgr.set_password(password)
        db.session.add(mgr)
        db.session.commit()
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.get_json()["access_token"]}


@pytest.mark.integration
class TestPublicSettings:
    def test_get_returns_defaults(self, app, client):
        r = client.get("/api/settings")
        assert r.status_code == 200
        s = r.get_json()["settings"]
        # Sanity-check a few expected fields.
        assert "delivery_charge" in s
        assert "free_delivery_above" in s
        # is_shop_open defaults to True so a fresh DB still accepts orders.
        assert s.get("is_shop_open", True) is True


@pytest.mark.integration
class TestAdminSettings:
    def test_update_requires_manager(self, app, client):
        r = client.put("/api/admin/settings", json={"delivery_charge": 50})
        assert r.status_code == 401

    def test_update_known_fields(self, app, client):
        h = _login_manager(client)
        r = client.put(
            "/api/admin/settings",
            headers=h,
            json={"delivery_charge": 50, "free_delivery_above": 300},
        )
        assert r.status_code in (200, 201)
        body = r.get_json()
        assert float(body["settings"]["delivery_charge"]) == 50.0
        assert "delivery_charge" in body["updated"]
        assert "free_delivery_above" in body["updated"]

    def test_update_rejects_non_numeric_for_numeric_field(self, app, client):
        h = _login_manager(client)
        r = client.put(
            "/api/admin/settings",
            headers=h,
            json={"delivery_charge": "free lol"},
        )
        assert r.status_code == 400

    def test_update_rejects_negative_numeric(self, app, client):
        h = _login_manager(client)
        r = client.put(
            "/api/admin/settings",
            headers=h,
            json={"delivery_charge": -10},
        )
        assert r.status_code == 400

    def test_update_rejects_non_boolean_for_is_shop_open(self, app, client):
        h = _login_manager(client)
        r = client.put(
            "/api/admin/settings",
            headers=h,
            json={"is_shop_open": "yes"},
        )
        assert r.status_code == 400

    def test_update_can_close_shop(self, app, client):
        """The most important setting: is_shop_open=False must be settable."""
        h = _login_manager(client)
        r = client.put(
            "/api/admin/settings",
            headers=h,
            json={"is_shop_open": False, "closed_message": "Bandh hain, kal aana."},
        )
        assert r.status_code in (200, 201)
        # Confirm the public read picks it up.
        r2 = client.get("/api/settings")
        assert r2.get_json()["settings"]["is_shop_open"] is False
        assert r2.get_json()["settings"]["closed_message"] == "Bandh hain, kal aana."

    def test_update_ignores_unknown_fields(self, app, client):
        h = _login_manager(client)
        r = client.put(
            "/api/admin/settings",
            headers=h,
            json={"delivery_charge": 40, "totally_made_up": "value"},
        )
        assert r.status_code in (200, 201)
        assert "delivery_charge" in r.get_json()["updated"]
        assert "totally_made_up" not in r.get_json()["updated"]
