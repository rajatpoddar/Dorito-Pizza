"""In-app notifications (bell icon) for app users."""
from datetime import datetime, timezone

from app.extensions import db


class Notification(db.Model):
    __tablename__ = "notifications"

    TYPE_ORDER = "order"
    TYPE_OFFER = "offer"
    TYPE_INFO = "info"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    body = db.Column(db.String(300), nullable=True)
    type = db.Column(db.String(20), nullable=False, default=TYPE_INFO)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "body": self.body,
            "type": self.type,
            "order_id": self.order_id,
            "read": self.read_at is not None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
