"""Order model — a customer's food order and its lifecycle."""
from datetime import datetime, timezone

from app.extensions import db


class Order(db.Model):
    __tablename__ = "orders"

    # ---- status flow ----
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_PREPARING = "preparing"
    STATUS_READY = "ready"
    STATUS_OUT_FOR_DELIVERY = "out_for_delivery"
    STATUS_DELIVERED = "delivered"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (
        STATUS_PENDING,
        STATUS_ACCEPTED,
        STATUS_REJECTED,
        STATUS_PREPARING,
        STATUS_READY,
        STATUS_OUT_FOR_DELIVERY,
        STATUS_DELIVERED,
        STATUS_CANCELLED,
    )

    # ---- payment ----
    PAYMENT_COD = "cod"
    PAYMENT_UPI = "upi"
    PAYMENT_MODES = (PAYMENT_COD, PAYMENT_UPI)
    PAYMENT_PENDING = "pending"
    PAYMENT_PAID = "paid"

    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(20), unique=True, nullable=False, index=True)

    customer_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    customer_name = db.Column(db.String(120), nullable=False)
    customer_phone = db.Column(db.String(15), nullable=False, index=True)
    delivery_address = db.Column(db.Text, nullable=False)

    status = db.Column(
        db.Enum(*STATUSES, name="order_statuses"), nullable=False, default=STATUS_PENDING
    )
    payment_mode = db.Column(
        db.Enum(*PAYMENT_MODES, name="payment_modes"), nullable=False, default=PAYMENT_COD
    )
    payment_status = db.Column(
        db.Enum(PAYMENT_PENDING, PAYMENT_PAID, name="payment_statuses"),
        nullable=False,
        default=PAYMENT_PENDING,
    )
    total_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    discount_amount = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    delivery_charge = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    offer_id = db.Column(db.Integer, db.ForeignKey("offers.id"), nullable=True)
    offer_code = db.Column(db.String(30), nullable=True)
    reject_reason = db.Column(db.String(255), nullable=True)

    # 4-digit OTP the customer shares with the delivery partner
    delivery_otp = db.Column(db.String(4), nullable=True)

    delivery_agent_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True, index=True
    )
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    customer = db.relationship("User", back_populates="orders", foreign_keys=[customer_id])
    delivery_agent = db.relationship(
        "User", back_populates="assigned_orders", foreign_keys=[delivery_agent_id]
    )
    offer = db.relationship("Offer")
    items = db.relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="joined"
    )

    # ---------- helpers ----------
    @staticmethod
    def generate_order_number() -> str:
        """DP-YYYYMMDD-XXXX based on daily sequence."""
        from datetime import date

        today = date.today().strftime("%Y%m%d")
        prefix = f"DP-{today}-"
        last = (
            db.session.query(Order)
            .filter(Order.order_number.like(f"{prefix}%"))
            .order_by(Order.id.desc())
            .first()
        )
        seq = int(last.order_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    def to_dict(self, include_otp: bool = False) -> dict:
        data = {
            "id": self.id,
            "order_number": self.order_number,
            "customer_id": self.customer_id,
            "customer_name": self.customer_name,
            "customer_phone": self.customer_phone,
            "delivery_address": self.delivery_address,
            "status": self.status,
            "payment_mode": self.payment_mode,
            "payment_status": self.payment_status,
            "total_amount": float(self.total_amount),
            "discount_amount": float(self.discount_amount or 0),
            "delivery_charge": float(self.delivery_charge or 0),
            "offer_code": self.offer_code,
            "reject_reason": self.reject_reason,
            "delivery_agent": (
                {"id": self.delivery_agent.id, "name": self.delivery_agent.name}
                if self.delivery_agent
                else None
            ),
            "items": [item.to_dict() for item in self.items],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_otp:
            data["delivery_otp"] = self.delivery_otp
        return data

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Order {self.order_number} [{self.status}]>"
