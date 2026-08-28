"""Marketing message log — guarantees once-per-user-per-type-per-window."""
from datetime import datetime, timezone

from app.extensions import db


class MarketingLog(db.Model):
    __tablename__ = "marketing_logs"
    __table_args__ = (
        db.UniqueConstraint("phone", "kind", "period_key", name="uq_marketing_once"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    phone = db.Column(db.String(15), nullable=False, index=True)
    kind = db.Column(db.String(30), nullable=False)  # reorder_7d / winback_14d / broadcast
    period_key = db.Column(db.String(30), nullable=False)  # e.g. 2026-08-27
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
