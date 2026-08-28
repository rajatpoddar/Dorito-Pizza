"""Discount offers / coupons managed by the manager."""
from datetime import datetime, timezone

from app.extensions import db


class Offer(db.Model):
    __tablename__ = "offers"

    TYPE_PERCENT = "percent"
    TYPE_FLAT = "flat"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(30), unique=True, nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False, default="")
    description = db.Column(db.String(255), nullable=True)
    discount_type = db.Column(db.Enum(TYPE_PERCENT, TYPE_FLAT, name="discount_types"),
                              nullable=False, default=TYPE_FLAT)
    value = db.Column(db.Numeric(10, 2), nullable=False)  # percent (1-100) or flat ₹
    min_order_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    max_discount = db.Column(db.Numeric(10, 2), nullable=True)  # cap for percent type
    starts_at = db.Column(db.DateTime(timezone=True), nullable=True)
    ends_at = db.Column(db.DateTime(timezone=True), nullable=True)
    usage_limit = db.Column(db.Integer, nullable=True)  # total redemptions allowed
    used_count = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # ---------- logic ----------
    @staticmethod
    def _aware(dt):
        """SQLite returns naive datetimes — assume UTC if naive."""
        if dt is None:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    def is_live(self, now=None) -> bool:
        now = now or datetime.now(timezone.utc)
        if not self.is_active:
            return False
        starts = self._aware(self.starts_at)
        ends = self._aware(self.ends_at)
        if starts and now < starts:
            return False
        if ends and now > ends:
            return False
        if self.usage_limit is not None and self.used_count >= self.usage_limit:
            return False
        return True

    def discount_for(self, subtotal: float) -> float:
        """Discount ₹ for a given subtotal (assumes min_order satisfied)."""
        if self.discount_type == self.TYPE_PERCENT:
            d = subtotal * float(self.value) / 100.0
            if self.max_discount is not None:
                d = min(d, float(self.max_discount))
        else:
            d = float(self.value)
        return round(min(d, subtotal), 2)

    def validate_for(self, subtotal: float) -> tuple[bool, str, float]:
        """Returns (ok, error, discount)."""
        if not self.is_live():
            return False, "Ye offer abhi available nahi hai", 0.0
        if subtotal < float(self.min_order_amount):
            return False, f"Is offer ke liye minimum order ₹{float(self.min_order_amount):.0f} ka hona chahiye", 0.0
        return True, "", self.discount_for(subtotal)

    def public_dict(self) -> dict:
        if self.discount_type == self.TYPE_PERCENT:
            amount = f"{float(self.value):.0f}% OFF"
            if self.max_discount:
                amount += f" (max ₹{float(self.max_discount):.0f})"
        else:
            amount = f"₹{float(self.value):.0f} OFF"
        return {
            "code": self.code,
            "title": self.title,
            "description": self.description,
            "amount_label": amount,
            "min_order_amount": float(self.min_order_amount),
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
        }

    def admin_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "title": self.title,
            "description": self.description,
            "discount_type": self.discount_type,
            "value": float(self.value),
            "min_order_amount": float(self.min_order_amount),
            "max_discount": float(self.max_discount) if self.max_discount is not None else None,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "usage_limit": self.usage_limit,
            "used_count": self.used_count,
            "is_active": self.is_active,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Offer {self.code}>"
