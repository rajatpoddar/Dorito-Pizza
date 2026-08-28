"""WhatsApp outbox — every outbound message queued, rate-limited, audited."""
from datetime import datetime, timezone

from app.extensions import db


class WhatsAppOutbox(db.Model):
    __tablename__ = "whatsapp_outbox"

    STATUS_QUEUED = "queued"
    STATUS_SENDING = "sending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_SKIPPED = "skipped_no_key"

    KIND_OTP = "otp"
    KIND_ORDER_CONFIRMED = "order_confirmed"
    KIND_OUT_FOR_DELIVERY = "out_for_delivery"
    KIND_DELIVERED = "delivered"
    KIND_DELIVERY_OTP = "delivery_otp"
    KIND_MARKETING = "marketing"

    id = db.Column(db.Integer, primary_key=True)
    phone = db.Column(db.String(15), nullable=False, index=True)
    message = db.Column(db.Text, nullable=False)
    kind = db.Column(db.String(30), nullable=False, default="info")
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=STATUS_QUEUED, index=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    error = db.Column(db.String(300), nullable=True)
    picked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    def mark(self, status: str, error: str | None = None) -> None:
        self.status = status
        self.error = (error or "")[:290] or None
        if status == self.STATUS_SENT:
            self.sent_at = datetime.now(timezone.utc)
