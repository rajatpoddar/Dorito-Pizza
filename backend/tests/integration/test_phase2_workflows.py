"""Integration tests for the Phase 2 surface — offers, OTP, notifications,
analytics, broadcast, outbox. Hits the Flask test_client + in-memory SQLite.

Formerly `tests/phase2_test.py` (a script with print+sys.exit). Converted
to pytest so `pytest -m integration` runs it as part of the suite.
"""
import pytest

from app.extensions import db
from app.models import Category, MenuItem, Offer, User


# --- helpers ---------------------------------------------------------------

def _seed_minimum(app):
    """One Category, one MenuItem, three test users (manager, cook,
    delivery agent), and one Offer. Returns their ids in a dict.
    """
    with app.app_context():
        cat = Category(name="Pizza", display_order=1, image_url="/images/menu/pizza.svg")
        db.session.add(cat)
        db.session.flush()
        item = MenuItem(category_id=cat.id, name="Paneer Pizza", price=170)
        db.session.add(item)

        mgr = User(name="Mgr", phone="6000000000", role=User.ROLE_MANAGER)
        mgr.set_password("Test@123")
        cook = User(name="Cook", phone="9939794303", role=User.ROLE_COOK)
        cook.set_password("Cook@123")
        agent = User(name="Agent", phone="7000000000", role=User.ROLE_DELIVERY)
        agent.set_password("Agent@123")
        db.session.add_all([mgr, cook, agent])
        db.session.flush()

        offer = Offer(
            code="TEST20",
            title="20% off",
            discount_type=Offer.TYPE_PERCENT,
            value=20.0,
            min_order_amount=0,
            is_active=True,
        )
        db.session.add(offer)
        db.session.commit()

        return {
            "item_id": item.id,
            "manager_id": mgr.id,
            "cook_id": cook.id,
            "agent_id": agent.id,
            "offer_id": offer.id,
        }


def _login(client, phone, password):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.get_json()
    return {"Authorization": "Bearer " + r.get_json()["access_token"]}


def _checkout(client, item_id, phone, offer_code=None):
    payload = {
        "items": [{"menu_item_id": item_id, "quantity": 1}],
        "customer_name": "Test Customer",
        "customer_phone": phone,
        "delivery_address": "Jamatara Road Palojori Deoghar 814146",
        "payment_mode": "cod",
    }
    if offer_code:
        payload["offer_code"] = offer_code
    return client.post("/api/orders", json=payload)


# --- tests -----------------------------------------------------------------

@pytest.mark.integration
class TestOfferValidation:
    def test_valid_offer_accepted(self, app, client):
        ids = _seed_minimum(app)
        r = _checkout(client, ids["item_id"], "9123456780", offer_code="TEST20")
        assert r.status_code in (200, 201), r.get_json()
        order = r.get_json()["order"]
        # 20% of 170 = 34
        assert float(order["discount_amount"]) == 34.0
        assert order["offer_code"] == "TEST20"

    def test_invalid_offer_rejected(self, app, client):
        ids = _seed_minimum(app)
        r = _checkout(client, ids["item_id"], "9123456780", offer_code="NOPE123")
        assert r.status_code == 400
        assert "offer" in r.get_json().get("error", "").lower()

    def test_public_offers_list_includes_active(self, app, client):
        _seed_minimum(app)
        r = client.get("/api/offers")
        assert r.status_code == 200
        codes = {o["code"] for o in r.get_json()["offers"]}
        assert "TEST20" in codes


@pytest.mark.integration
class TestAuthorization:
    def test_cook_cannot_view_admin_dashboard(self, app, client):
        _seed_minimum(app)
        cook_h = _login(client, "9939794303", "Cook@123")
        r = client.get("/api/admin/dashboard", headers=cook_h)
        assert r.status_code == 403

    def test_unauthenticated_admin_call_rejected(self, app, client):
        _seed_minimum(app)
        r = client.get("/api/admin/dashboard")
        assert r.status_code == 401


@pytest.mark.integration
class TestBroadcastAndAnalytics:
    def test_broadcast_queues_messages(self, app, client):
        _seed_minimum(app)
        mgr_h = _login(client, "6000000000", "Test@123")
        r = client.post(
            "/api/admin/broadcast",
            headers=mgr_h,
            json={"title": "Diwali Dhamaka!", "message": "20% off aaj hi"},
        )
        assert r.status_code in (200, 201)
        body = r.get_json()
        # With no opt-in users, sent may be 0 — just ensure no 5xx and a list.
        assert "sent" in body

    def test_analytics_shape(self, app, client):
        _seed_minimum(app)
        mgr_h = _login(client, "6000000000", "Test@123")
        r = client.get("/api/admin/analytics", headers=mgr_h)
        assert r.status_code == 200
        body = r.get_json()
        assert "kpis" in body
        assert "daily" in body
        assert len(body["daily"]) == 7
