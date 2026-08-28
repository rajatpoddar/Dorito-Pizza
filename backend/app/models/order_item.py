"""Order line item — snapshots name/price at purchase time."""
from app.extensions import db


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(
        db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    menu_item_id = db.Column(
        db.Integer, db.ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True
    )
    item_name = db.Column(db.String(120), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)

    order = db.relationship("Order", back_populates="items")
    menu_item = db.relationship("MenuItem")

    @property
    def subtotal(self):
        return float(self.unit_price) * self.quantity

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "menu_item_id": self.menu_item_id,
            "item_name": self.item_name,
            "unit_price": float(self.unit_price),
            "quantity": self.quantity,
            "subtotal": self.subtotal,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<OrderItem {self.item_name} x{self.quantity}>"
