"""User model — customers and staff (manager / cook / delivery)."""
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    ROLE_CUSTOMER = "customer"
    ROLE_MANAGER = "manager"
    ROLE_COOK = "cook"
    ROLE_DELIVERY = "delivery"
    ROLES = (ROLE_CUSTOMER, ROLE_MANAGER, ROLE_COOK, ROLE_DELIVERY)

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(15), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=True)  # customers may be OTP-only
    role = db.Column(db.Enum(*ROLES, name="user_roles"), nullable=False, default=ROLE_CUSTOMER)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    marketing_optin = db.Column(db.Boolean, nullable=False, default=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    orders = db.relationship(
        "Order", back_populates="customer", foreign_keys="Order.customer_id"
    )
    assigned_orders = db.relationship(
        "Order", back_populates="delivery_agent", foreign_keys="Order.delivery_agent_id"
    )

    # ---------- password helpers ----------
    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Customers created via OTP have no password — treat as mismatch."""
        if not self.password_hash:
            return False
        return check_password_hash(self.password_hash, password)

    # ---------- serialisation ----------
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.phone} ({self.role})>"
