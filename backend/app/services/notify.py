"""In-app notification helpers (and event wiring used by routes)."""
from flask import current_app

from app.extensions import db
from app.models import Notification


def notify_user(user_id: int | None, title: str, body: str = "", type_: str = Notification.TYPE_INFO,
                order_id: int | None = None) -> None:
    """Create an in-app notification (no-op for guest orders without a user)."""
    if not user_id:
        return
    db.session.add(
        Notification(user_id=user_id, title=title[:118], body=(body or "")[:298],
                     type=type_, order_id=order_id)
    )
    db.session.commit()


def notify_order_event(order, event: str) -> None:
    """Customer-facing in-app notifications on order status changes."""
    cfg = current_app.config
    shop = cfg["SHOP_NAME"]
    if event == "confirmed":
        notify_user(order.customer_id, "Order confirmed 🎉",
                    f"{order.order_number} receive ho gaya. Total ₹{float(order.total_amount):.0f}",
                    Notification.TYPE_ORDER, order.id)
    elif event == "preparing":
        notify_user(order.customer_id, "Kitchen me ban raha hai 👨‍🍳",
                    f"{order.order_number} prepare ho raha hai.", Notification.TYPE_ORDER, order.id)
    elif event == "ready":
        notify_user(order.customer_id, "Order ready 🍕",
                    f"{order.order_number} pack ho chuka hai.", Notification.TYPE_ORDER, order.id)
    elif event == "out_for_delivery":
        notify_user(order.customer_id, "Out for delivery 🛵",
                    f"OTP ready rakhein: {order.delivery_otp}", Notification.TYPE_ORDER, order.id)
    elif event == "delivered":
        notify_user(order.customer_id, "Delivered ✅",
                    f"{order.order_number} deliver ho gaya. Dhanyavaad!", Notification.TYPE_ORDER, order.id)
    elif event == "cancelled":
        notify_user(order.customer_id, "Order cancelled",
                    f"{order.order_number} cancel kar diya gaya. {shop}", Notification.TYPE_ORDER, order.id)
