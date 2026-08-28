"""In-app notifications (bell) for the logged-in user."""
from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_jwt_extended import verify_jwt_in_request

from app.extensions import db
from app.models import Notification
from app.utils.decorators import db_get_current_user

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.get("")
def my_notifications():
    verify_jwt_in_request()
    user = db_get_current_user()
    rows = (
        Notification.query.filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread = Notification.query.filter(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    ).count()
    return jsonify(notifications=[n.to_dict() for n in rows], unread=unread)


@notifications_bp.post("/read")
def mark_read():
    verify_jwt_in_request()
    user = db_get_current_user()
    Notification.query.filter(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    ).update({"read_at": datetime.now(timezone.utc)})
    db.session.commit()
    return jsonify(ok=True)
