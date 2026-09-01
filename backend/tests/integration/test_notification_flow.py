"""End-to-end test: every status transition fires the right
WhatsApp kind + in-app notification + (for staff) role fan-out."""


def _seed(app):
    """Seed the minimum world needed for the tests."""
    from app.extensions import db
    from app.models import Category, User

    with app.app_context():
        cat = Category(name="Pizza", display_order=1)
        db.session.add(cat)
        db.session.flush()
        from app.models.menu_item import MenuItem
        item = MenuItem(category_id=cat.id, name="Test Pizza", price=100,
                        description="t", is_available=True)
        db.session.add(item)

        for name, phone, role, pw in [
            ("Mgr", "9100000001", "manager", "x"),
            ("Cook", "9100000002", "cook", "x"),
            ("Driver", "9100000003", "delivery", "x"),
            ("Cust", "9100000004", "customer", "x"),
        ]:
            u = User(name=name, phone=phone, role=role)
            u.set_password(pw)
            db.session.add(u)
        db.session.commit()

        from app.models import WhatsAppOutbox, Notification
        WhatsAppOutbox.query.delete()
        Notification.query.delete()
        db.session.commit()


def _login(client, phone, password):
    r = client.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["access_token"]


def test_full_flow_fires_every_channel(app, client):
    """pending → accepted → preparing → ready → out_for_delivery → delivered."""
    _seed(app)
    from app.models import MenuItem, Notification, Order, WhatsAppOutbox

    cust = _login(client, "9100000004", "x")
    mgr = _login(client, "9100000001", "x")
    cook = _login(client, "9100000002", "x")
    drv = _login(client, "9100000003", "x")

    item = MenuItem.query.first()
    r = client.post("/api/orders", json={
        "items": [{"menu_item_id": item.id, "quantity": 1}],
        "customer_name": "Test", "customer_phone": "9100000004",
        "delivery_address": "Palojori main road, near temple",
        "payment_mode": "cod",
    }, headers={"Authorization": f"Bearer {cust}"})
    assert r.status_code == 201, r.get_json()
    order = Order.query.first()
    assert order.status == Order.STATUS_PENDING

    # pending → 1 WA (order_confirmed) + 1 customer in-app notif.
    assert WhatsAppOutbox.query.count() == 1
    assert WhatsAppOutbox.query.first().kind == WhatsAppOutbox.KIND_ORDER_CONFIRMED
    assert Notification.query.count() == 1

    # Manager accepts.
    r = client.patch(f"/api/admin/orders/{order.id}/accept",
                     headers={"Authorization": f"Bearer {mgr}"})
    assert r.status_code == 200
    kinds = sorted([m.kind for m in WhatsAppOutbox.query.all()])
    assert WhatsAppOutbox.KIND_ORDER_ACCEPTED in kinds
    titles = [n.title for n in Notification.query.all()]
    assert any("accepted" in t for t in titles)
    # role fan-out — cook gets a notification
    cook_notifs = Notification.query.filter_by(user_id=2).all()
    assert any("order" in n.title.lower() for n in cook_notifs)

    # Cook: preparing.
    r = client.patch(f"/api/kitchen/orders/{order.id}/status",
                     headers={"Authorization": f"Bearer {cook}"})
    assert r.status_code == 200
    assert WhatsAppOutbox.query.filter_by(
        kind=WhatsAppOutbox.KIND_PREPARING).first() is not None

    # Cook: ready.
    r = client.patch(f"/api/kitchen/orders/{order.id}/status",
                     headers={"Authorization": f"Bearer {cook}"})
    assert r.status_code == 200
    assert WhatsAppOutbox.query.filter_by(
        kind=WhatsAppOutbox.KIND_READY).first() is not None
    # delivery agents notified
    driver_notifs = Notification.query.filter_by(user_id=3).all()
    assert any("ready" in n.title.lower() for n in driver_notifs)

    # Manager assigns driver.
    from app.models import User as UserM
    drv_user = UserM.query.filter_by(role="delivery").first()
    r = client.patch(f"/api/admin/orders/{order.id}/assign",
                     json={"agent_id": drv_user.id},
                     headers={"Authorization": f"Bearer {mgr}"})
    assert r.status_code == 200

    # Driver: out for delivery.
    r = client.patch(f"/api/delivery/orders/{order.id}/status",
                     headers={"Authorization": f"Bearer {drv}"})
    assert r.status_code == 200
    assert WhatsAppOutbox.query.filter_by(
        kind=WhatsAppOutbox.KIND_OUT_FOR_DELIVERY).first() is not None

    # Driver: deliver (OTP).
    order = Order.query.first()
    r = client.patch(f"/api/delivery/orders/{order.id}/deliver",
                     json={"otp": order.delivery_otp},
                     headers={"Authorization": f"Bearer {drv}"})
    assert r.status_code == 200, r.get_json()
    assert WhatsAppOutbox.query.filter_by(
        kind=WhatsAppOutbox.KIND_DELIVERED).first() is not None
    # Manager got a delivered notification
    mgr_notifs = Notification.query.filter_by(user_id=1).all()
    assert any("delivered" in n.title.lower() for n in mgr_notifs)


def test_reject_flow_fires_both_channels(app, client):
    _seed(app)
    from app.models import MenuItem, Notification, Order, WhatsAppOutbox

    cust = _login(client, "9100000004", "x")
    mgr = _login(client, "9100000001", "x")

    item = MenuItem.query.first()
    r = client.post("/api/orders", json={
        "items": [{"menu_item_id": item.id, "quantity": 1}],
        "customer_name": "Test", "customer_phone": "9100000004",
        "delivery_address": "Palojori main road, near temple",
        "payment_mode": "cod",
    }, headers={"Authorization": f"Bearer {cust}"})
    assert r.status_code == 201, r.get_json()
    order = Order.query.first()

    r = client.patch(f"/api/admin/orders/{order.id}/reject",
                     json={"reason": "Out of cheese"},
                     headers={"Authorization": f"Bearer {mgr}"})
    assert r.status_code == 200
    assert WhatsAppOutbox.query.filter_by(
        kind=WhatsAppOutbox.KIND_ORDER_REJECTED).first() is not None
    notifs = Notification.query.all()
    assert any("reject" in n.title.lower() for n in notifs)


def test_recent_activity_endpoint_returns_combined_feed(app, client):
    """Manager dashboard sees notifications + WA outbox tail."""
    _seed(app)
    from app.extensions import db
    from app.models import Notification, WhatsAppOutbox
    from datetime import datetime, timezone

    with app.app_context():
        db.session.add(Notification(user_id=1, title="Test notif", body="x", type="order"))
        db.session.add(WhatsAppOutbox(
            phone="919999999999", message="Hello", kind="order_confirmed",
            status="sent", sent_at=datetime.now(timezone.utc),
        ))
        db.session.commit()

    mgr = _login(client, "9100000001", "x")
    r = client.get("/api/admin/dashboard/recent-activity",
                   headers={"Authorization": f"Bearer {mgr}"})
    assert r.status_code == 200
    body = r.get_json()
    assert any(x["title"] == "Test notif" for x in body["notifications"])
    assert any(x["kind"] == "order_confirmed" for x in body["messages"])