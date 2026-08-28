"""Shop settings (singleton row, key/value) — delivery charge, GST, etc.

Stored as one row, mutated by the manager. The row is created with sensible
defaults on first access (get_or_create) so any code that reads a setting
gets a valid number back even on a fresh DB.
"""
from datetime import datetime, timezone

from app.extensions import db


# ---- default values (used on first read / fresh DB) ----
DEFAULTS = {
    "delivery_charge": 30.0,      # ₹ flat delivery fee (per order)
    "free_delivery_above": 499.0, # orders above this subtotal ship free
    "shop_name": "Dorito Pizza and Bakery",
    "shop_tagline": "Jamtara Road, Palojori",
    "min_order_amount": 0.0,      # ₹ minimum cart subtotal to checkout
    "gst_percent": 0.0,           # GST % (applied to subtotal, optional)
}


class ShopSettings(db.Model):
    __tablename__ = "shop_settings"

    id = db.Column(db.Integer, primary_key=True)
    # Numeric settings stored as strings (SQLite-friendly) so we can mix
    # ints and floats without schema changes. Whitelisted keys only.
    delivery_charge = db.Column(db.Float, nullable=False, default=30.0)
    free_delivery_above = db.Column(db.Float, nullable=False, default=499.0)
    shop_name = db.Column(db.String(120), nullable=False, default="Dorito Pizza and Bakery")
    shop_tagline = db.Column(db.String(255), nullable=True, default="Jamtara Road, Palojori")
    min_order_amount = db.Column(db.Float, nullable=False, default=0.0)
    gst_percent = db.Column(db.Float, nullable=False, default=0.0)
    # ----- Home page / hero customization (admin-controlled) -----
    hero_title = db.Column(
        db.String(120), nullable=False, default="Pizza. Burger. Bakery. Delivered."
    )
    hero_subtitle = db.Column(
        db.String(255), nullable=True,
        default="Freshly baked pizzas, juicy burgers & cakes — straight to your door in Palojori.",
    )
    hero_image_url = db.Column(
        db.String(255), nullable=True, default="/assets/menu/dorito-special-pizza.png",
    )
    # Address shown on the home page + footer
    shop_address = db.Column(
        db.String(255), nullable=True, default="Jamtara Road, Palojori, Deoghar, Jharkhand 814146",
    )
    shop_phone = db.Column(db.String(20), nullable=True, default="6202965250")
    shop_phone_2 = db.Column(db.String(20), nullable=True, default="9939794303")
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ---- singleton helpers ----
    @classmethod
    def get(cls) -> "ShopSettings":
        """Return the single settings row, creating it with defaults if needed."""
        row = cls.query.first()
        if row is None:
            row = cls(**DEFAULTS)
            db.session.add(row)
            db.session.commit()
        return row

    def public_dict(self) -> dict:
        """Settings safe to expose to customers (no secrets)."""
        return {
            "shop_name": self.shop_name,
            "shop_tagline": self.shop_tagline,
            "shop_address": self.shop_address,
            "shop_phone": self.shop_phone,
            "shop_phone_2": self.shop_phone_2,
            "delivery_charge": float(self.delivery_charge or 0),
            "free_delivery_above": float(self.free_delivery_above or 0),
            "min_order_amount": float(self.min_order_amount or 0),
            "gst_percent": float(self.gst_percent or 0),
            "hero_title": self.hero_title,
            "hero_subtitle": self.hero_subtitle,
            "hero_image_url": self.hero_image_url,
        }

    def admin_dict(self) -> dict:
        return self.public_dict()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ShopSettings delivery=₹{self.delivery_charge}>"
