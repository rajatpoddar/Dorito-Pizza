"""Tests for the notify_role() fan-out helper + dashboard activity feed."""
from datetime import datetime, timezone

import pytest


@pytest.fixture
def app_with_staff():
    from app import create_app
    from app.extensions import db
    from app.models import User

    app = create_app()
    with app.app_context():
        db.create_all()
        # 2 cooks, 1 manager, 1 delivery — all active.
        for i, (name, role) in enumerate([
            ("Cook A", "cook"),
            ("Cook B", "cook"),
            ("Manager", "manager"),
            ("Driver", "delivery"),
        ]):
            u = User(name=name, phone=f"91000000{i:02d}", role=role)
            u.set_password("x")
            db.session.add(u)
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


def test_notify_role_fans_out_to_all_active(app_with_staff):
    from app.extensions import db
    from app.models import Notification, User
    from app.services.notify import notify_role

    with app_with_staff.app_context():
        n = notify_role("cook", "New order 👨‍🍳", "Prepare karein.")
        assert n == 2
        cooks = User.query.filter_by(role="cook").all()
        for c in cooks:
            rows = Notification.query.filter_by(user_id=c.id).all()
            assert len(rows) == 1
            assert rows[0].title.startswith("New order")
            assert rows[0].body == "Prepare karein."
            assert rows[0].read_at is None


def test_notify_role_skips_inactive_users(app_with_staff):
    from app.extensions import db
    from app.models import User
    from app.services.notify import notify_role

    with app_with_staff.app_context():
        # Deactivate one cook
        c = User.query.filter_by(role="cook").first()
        c.is_active = False
        db.session.commit()
        n = notify_role("cook", "Hello")
        assert n == 1  # only the still-active cook got it


def test_notify_role_returns_zero_when_no_users(app_with_staff):
    from app.services.notify import notify_role

    with app_with_staff.app_context():
        n = notify_role("nonexistent_role", "Hello")
        assert n == 0


def test_recent_activity_returns_notifications_and_outbox(app_with_staff):
    """The /admin/dashboard/recent-activity endpoint surfaces both feeds."""
    from app.extensions import db
    from app.models import Notification, Order, WhatsAppOutbox
    from app.services.notify import notify_role, notify_user

    with app_with_staff.app_context():
        # Create a stub order (for the outbox FK)
        o = Order(
            order_number="DP-TEST-0001",
            customer_name="Test", customer_phone="919999999999",
            delivery_address="addr", total_amount=100, status="pending",
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(o)
        db.session.commit()

        # Drop one of each
        notify_user(o.customer_id, "Customer hi", "body")
        notify_role("cook", "Cook hi", "body", order_id=o.id)
        WhatsAppOutbox.query.delete()
        db.session.add(WhatsAppOutbox(
            phone="919999999999", message="hello", kind="order_confirmed",
            order_id=o.id, status="sent",
            sent_at=datetime.now(timezone.utc),
        ))
        db.session.commit()

        client = app_with_staff.test_client()
        # Log in as the manager
        r = client.post("/api/auth/login", json={
            "phone": "9100000002", "password": "x",
        })
        assert r.status_code == 200, r.get_json()
        token = r.get_json()["access_token"]
        r = client.get("/api/admin/dashboard/recent-activity",
                       headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.get_json()
        assert isinstance(body["notifications"], list) and len(body["notifications"]) >= 2
        assert isinstance(body["messages"], list) and len(body["messages"]) >= 1
        assert body["messages"][0]["kind"] == "order_confirmed"
        assert body["messages"][0]["preview"]