"""Menu category model (Pizza, Burger, ...)."""
from app.extensions import db


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False, index=True)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    image_url = db.Column(db.String(255), nullable=True)

    items = db.relationship(
        "MenuItem", back_populates="category", cascade="all, delete-orphan"
    )

    def to_dict(self, include_items: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "display_order": self.display_order,
            "image_url": self.image_url,
            "item_count": len(self.items),
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Category {self.name}>"
