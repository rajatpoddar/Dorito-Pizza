"""End-to-end happy-path test for one full order lifecycle.

Formerly `tests/lifecycle_test.py` (a print+sys.exit script). Converted
to pytest so it runs in the e2e tier (`pytest -m e2e`) on main only.

The original script baked in hardcoded seed-user credentials
(`Manager@123` / `Cook@123` / `Agent@123`); to stay hermetic we
self-seed the same users here and ignore the prod seed.
"""
import pytest

from app.extensions import db
from app.models import Category, MenuItem, User


@pytest.mark.e2e
def test_full_order_lifecycle_pending_to_delivered(app, client):
    # --- seed: 1 category, 2 items, 3 staff users ----------------------
    with app.app_context():
        cat = Category(name="Pizza", display_order=1, image_url="/images/menu/pizza.svg")
        db.session.add(cat)
        db.session.flush()
        special = MenuItem(category_id=cat.id, name="Dorito Special Pizza", price=180)
        cold = MenuItem(category_id=cat.id, name="Cold Coffee", price=50)
        db.session.add_all([special, cold])
        db.session.flush()

        cook = User(name="Cook", phone="9939794303", role=User.ROLE_COOK)
        cook.set_password("Cook@123")
        mgr = User(name="Manager", phone="6202965250", role=User.ROLE_MANAGER)
        mgr.set_password("Manager@123")
        agent = User(name="Agent", phone="9000000001", role=User.ROLE_DELIVERY)
        agent.set_password("Agent@123")
        db.session.add_all([cook, mgr, agent])
        db.session.commit()
        special_id, cold_id, agent_id = special.id, cold.id, agent.id

    def login(phone, password):
        r = client.post("/api/auth/login", json={"phone": phone, "password": password})
        assert r.status_code == 200, r.get_json()
        return r.get_json()["access_token"]

    cook_h = {"Authorization": f"Bearer {login('9939794303', 'Cook@123')}"}
    mgr_h = {"Authorization": f"Bearer {login('6202965250', 'Manager@123')}"}
    agent_h = {"Authorization": f"Bearer {login('9000000001', 'Agent@123')}"}

    # --- 1. Guest places a multi-item order ----------------------------
    r = client.post(
        "/api/orders",
        json={
            "items": [
                {"menu_item_id": special_id, "quantity": 2},
                {"menu_item_id": cold_id, "quantity": 1},
            ],
            "customer_name": "Test Customer",
            "customer_phone": "9876543210",
            "delivery_address": "Near Bus Stand, Palojori, Deoghar, Jharkhand",
            "payment_mode": "cod",
        },
    )
    assert r.status_code in (200, 201), r.get_json()
    order = r.get_json()["order"]
    oid = order["id"]
    # Server recomputed total: items (180*2 + 50 = 410) + default
    # delivery_charge (₹30) = 440. Delivery_charge comes from the
    # auto-seeded ShopSettings row.
    assert abs(float(order["total_amount"]) - 440.0) < 0.01
    assert order["status"] == "pending"

    # --- 2. Invalid payload is rejected --------------------------------
    bad = client.post(
        "/api/orders",
        json={
            "items": [{"menu_item_id": 1, "quantity": 1}],
            "customer_name": "X",
            "customer_phone": "123",
            "delivery_address": "short",
            "payment_mode": "cod",
        },
    )
    assert bad.status_code == 400

    # --- 3. Manager accepts the order ---------------------------------
    r = client.patch(f"/api/admin/orders/{oid}/accept", headers=mgr_h)
    assert r.status_code in (200, 201) and r.get_json()["order"]["status"] == "accepted"

    # --- 3a. Kitchen sees accepted order and advances ------------------
    r = client.patch(f"/api/kitchen/orders/{oid}/status", headers=cook_h)
    assert r.status_code in (200, 201) and r.get_json()["order"]["status"] == "preparing"
    r = client.patch(f"/api/kitchen/orders/{oid}/status", headers=cook_h)
    assert r.status_code in (200, 201) and r.get_json()["order"]["status"] == "ready"

    # --- 4. Manager dashboard + assign delivery agent ------------------
    r = client.get("/api/admin/dashboard", headers=mgr_h)
    assert r.status_code == 200
    assert r.get_json()["active_orders"] >= 1

    r = client.patch(
        f"/api/admin/orders/{oid}/assign",
        headers=mgr_h,
        json={"agent_id": agent_id},
    )
    assert r.status_code in (200, 201)

    # --- 5. Cook is forbidden from admin dashboard --------------------
    r = client.get("/api/admin/dashboard", headers=cook_h)
    assert r.status_code == 403

    # --- 6. Delivery: out_for_delivery → delivered with OTP ------------
    r = client.patch(f"/api/delivery/orders/{oid}/status", headers=agent_h)
    assert r.status_code in (200, 201) and r.get_json()["order"]["status"] == "out_for_delivery"

    wrong = client.patch(
        f"/api/delivery/orders/{oid}/deliver",
        headers=agent_h,
        json={"otp": "0000"},
    )
    assert wrong.status_code == 401

    correct_otp = order["delivery_otp"]
    r = client.patch(
        f"/api/delivery/orders/{oid}/deliver",
        headers=agent_h,
        json={"otp": correct_otp},
    )
    assert r.status_code in (200, 201)
    done = r.get_json()["order"]
    assert done["status"] == "delivered"
    assert done["payment_status"] == "paid"

    # --- 7. Public tracking confirms terminal state --------------------
    r = client.get(f"/api/orders/{oid}/track?phone=9876543210")
    assert r.status_code == 200
    assert r.get_json()["order"]["status"] == "delivered"


@pytest.mark.e2e
def test_order_reject_flow(app, client):
    """Test the manager reject flow: pending -> rejected with reason."""
    with app.app_context():
        cat = Category(name="Burger", display_order=2)
        db.session.add(cat)
        db.session.flush()
        item = MenuItem(category_id=cat.id, name="Veg Burger", price=50)
        db.session.add(item)
        db.session.flush()

        mgr = User(name="Manager", phone="6202965250", role=User.ROLE_MANAGER)
        mgr.set_password("Manager@123")
        cook = User(name="Cook", phone="9939794303", role=User.ROLE_COOK)
        cook.set_password("Cook@123")
        db.session.add_all([mgr, cook])
        db.session.commit()
        item_id = item.id

    def login(phone, password):
        r = client.post("/api/auth/login", json={"phone": phone, "password": password})
        assert r.status_code == 200, r.get_json()
        return r.get_json()["access_token"]

    mgr_h = {"Authorization": f"Bearer {login('6202965250', 'Manager@123')}"}

    # Place order
    r = client.post(
        "/api/orders",
        json={
            "items": [{"menu_item_id": item_id, "quantity": 1}],
            "customer_name": "Reject Test",
            "customer_phone": "9876543211",
            "delivery_address": "Test Address, Palojori, Deoghar",
            "payment_mode": "cod",
        },
    )
    assert r.status_code in (200, 201)
    order = r.get_json()["order"]
    oid = order["id"]
    assert order["status"] == "pending"

    # Reject without reason -> 400
    r = client.patch(f"/api/admin/orders/{oid}/reject", headers=mgr_h, json={})
    assert r.status_code == 400

    # Reject with reason
    r = client.patch(
        f"/api/admin/orders/{oid}/reject",
        headers=mgr_h,
        json={"reason": "Item out of stock"},
    )
    assert r.status_code in (200, 201)
    rejected = r.get_json()["order"]
    assert rejected["status"] == "rejected"
    assert rejected["reject_reason"] == "Item out of stock"

    # Try to accept a rejected order -> 409
    r = client.patch(f"/api/admin/orders/{oid}/accept", headers=mgr_h)
    assert r.status_code == 409

    # Kitchen should not see rejected orders
    cook_h = {"Authorization": f"Bearer {login('9939794303', 'Cook@123')}"}
    r = client.get("/api/kitchen/orders", headers=cook_h)
    assert r.status_code == 200
    kitchen_orders = r.get_json()["orders"]
    assert all(o["id"] != oid for o in kitchen_orders)
