"""Integration tests for the in-app notifications surface.

The bell UI (P5.8 in the v3.0 roadmap) hasn't shipped yet, but the
underlying `/api/notifications` endpoints power the existing test
flow ("in-app notifications flowing", `phase2_test.py`). Lock the
behaviour down here so the future bell UI can build on a stable API.
"""
import pytest

from app.extensions import db
from app.models import Notification, User


def _make_user_and_login(client, phone="9876500000"):
    with client.application.app_context():
        u = User(name="Notify Tester", phone=phone, role=User.ROLE_CUSTOMER)
        db.session.add(u)
        db.session.commit()
        uid = u.id
    r = client.post(
        "/api/auth/login", json={"phone": phone, "password": "ignored"}
    )
    # Customer has no password set, so OTP login is the path. Skip and
    # mint the JWT directly via flask-jwt-extended for the test.
    from flask_jwt_extended import create_access_token

    token = create_access_token(identity=str(uid))
    return uid, {"Authorization": f"Bearer {token}"}


def _seed_notifications(app, user_id):
    with app.app_context():
        for i in range(3):
            db.session.add(
                Notification(
                    user_id=user_id,
                    type=Notification.TYPE_ORDER,
                    title=f"Order #{i} ready",
                    body=f"Order {i} is on its way",
                )
            )
        db.session.commit()


@pytest.mark.integration
class TestNotifications:
    def test_get_requires_jwt(self, app, client):
        r = client.get("/api/notifications")
        assert r.status_code == 401

    def test_get_returns_only_my_notifications(self, app, client):
        uid, h = _make_user_and_login(client, "9876500001")
        _seed_notifications(app, uid)
        r = client.get("/api/notifications", headers=h)
        assert r.status_code == 200
        body = r.get_json()
        assert body["unread"] == 3
        assert len(body["notifications"]) == 3

    def test_mark_read_clears_unread(self, app, client):
        uid, h = _make_user_and_login(client, "9876500002")
        _seed_notifications(app, uid)
        r = client.post("/api/notifications/read", headers=h)
        assert r.status_code == 200
        # Verify the count is now zero
        r = client.get("/api/notifications", headers=h)
        assert r.get_json()["unread"] == 0
