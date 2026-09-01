"""Address model — saved delivery addresses for customers."""
from datetime import datetime, timezone

from app.extensions import db


class Address(db.Model):
    __tablename__ = "addresses"

    MAX_ADDRESSES_PER_USER = 5

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False, index=True
    )
    label = db.Column(db.String(50), nullable=False, default="Home")
    full_address = db.Column(db.Text, nullable=False)
    lat = db.Column(db.Float, nullable=True)
    lng = db.Column(db.Float, nullable=True)
    is_default = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", backref="addresses")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "label": self.label,
            "full_address": self.full_address,
            "lat": self.lat,
            "lng": self.lng,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Address {self.label}: {self.full_address[:30]}>"
