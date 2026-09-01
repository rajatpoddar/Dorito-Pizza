"""Combo packs — bundled menu items sold at a discounted price."""
from datetime import datetime, timezone

from app.extensions import db


class ComboPack(db.Model):
    """A bundle of menu items at a discounted combo price.

    Example: "Pizza + Burger + Shake Combo" at ₹199 (saves ₹81).
    """
    __tablename__ = "combo_packs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    combo_price = db.Column(db.Numeric(10, 2), nullable=False)
    image_url = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationship to combo items
    items = db.relationship("ComboPackItem", backref="combo_pack", cascade="all, delete-orphan",
                            order_by="ComboPackItem.display_order")

    def original_total(self) -> float:
        """Sum of individual item prices."""
        return sum(float(ci.menu_item.price) * ci.quantity for ci in self.items if ci.menu_item)

    def savings(self) -> float:
        """How much the customer saves vs buying items individually."""
        return max(0.0, self.original_total() - float(self.combo_price))

    def is_available(self) -> bool:
        """Combo is available only if ALL its items are in stock."""
        return all(
            ci.menu_item is not None and ci.menu_item.is_available
            for ci in self.items
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "combo_price": float(self.combo_price),
            "original_total": self.original_total(),
            "savings": self.savings(),
            "image_url": self.image_url,
            "is_active": self.is_active,
            "is_available": self.is_available(),
            "display_order": self.display_order,
            "items": [ci.to_dict() for ci in self.items],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def admin_dict(self) -> dict:
        return {
            **self.to_dict(),
            "item_count": len(self.items),
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ComboPack {self.name}>"


class ComboPackItem(db.Model):
    """A line item within a combo pack — links to a MenuItem with a quantity."""
    __tablename__ = "combo_pack_items"

    id = db.Column(db.Integer, primary_key=True)
    combo_pack_id = db.Column(db.Integer, db.ForeignKey("combo_packs.id", ondelete="CASCADE"),
                               nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey("menu_items.id", ondelete="SET NULL"),
                              nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    display_order = db.Column(db.Integer, nullable=False, default=0)

    menu_item = db.relationship("MenuItem", lazy="joined")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "menu_item_id": self.menu_item_id,
            "quantity": self.quantity,
            "display_order": self.display_order,
            "item_name": self.menu_item.name if self.menu_item else None,
            "item_price": float(self.menu_item.price) if self.menu_item else None,
            "item_available": self.menu_item.is_available if self.menu_item else False,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ComboPackItem combo={self.combo_pack_id} item={self.menu_item_id}>"
