"""In-app notification helpers (and event wiring used by routes)."""
from flask import current_app

from app.extensions import db
from app.models import Notification, User


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


def notify_role(role: str, title: str, body: str = "",
                type_: str = Notification.TYPE_INFO, order_id: int | None = None) -> int:
    """Fan-out an in-app notification to every active user with the given role.

    Used for staff-side events — e.g. when an order is accepted, all cooks
    get a "New order 👨‍🍳" notification so their KDS bell rings.

    Returns the number of recipients (0 if no active users have that role).
    """
    recipients = User.query.filter_by(role=role, is_active=True).all()
    if not recipients:
        return 0
    safe_title = title[:118]
    safe_body = (body or "")[:298]
    for u in recipients:
        db.session.add(
            Notification(user_id=u.id, title=safe_title, body=safe_body,
                         type=type_, order_id=order_id)
        )
    db.session.commit()
    return len(recipients)


def notify_order_event(order, event: str, reason: str = None) -> None:
    """Customer-facing in-app notifications on order status changes."""
    cfg = current_app.config
    shop = cfg["SHOP_NAME"]
    if event == "confirmed":
        notify_user(order.customer_id, "Order confirmed 🎉",
                    f"{order.order_number} receive ho gaya. Total ₹{float(order.total_amount):.0f}",
                    Notification.TYPE_ORDER, order.id)
    elif event == "accepted":
        notify_user(order.customer_id, "Order accepted 🎉",
                    f"{order.order_number} accept ho gaya. Kitchen me ban raha hai.",
                    Notification.TYPE_ORDER, order.id)
    elif event == "rejected":
        notify_user(order.customer_id, "Order rejected 😔",
                    f"{order.order_number} reject kar diya gaya. Reason: {reason or 'No reason provided'}",
                    Notification.TYPE_ORDER, order.id)
    elif event == "preparing":
        notify_user(order.customer_id, "Kitchen me ban raha hai 👨‍🍳",
                    f"{order.order_number} prepare ho raha hai.", Notification.TYPE_ORDER, order.id)
    elif event == "ready":
        notify_user(order.customer_id, "Order ready 🍕",
                    f"{order.order_number} pack ho chuka hai.", Notification.TYPE_ORDER, order.id)
    elif event == "out_for_delivery":
        notify_user(
            order.customer_id, "Out for delivery 🛵",
            f"OTP ready rakhein: {order.delivery_otp}",
            Notification.TYPE_ORDER, order.id,
        )
    elif event == "delivered":
        notify_user(order.customer_id, "Delivered ✅",
                    f"{order.order_number} deliver ho gaya. Dhanyavaad!", Notification.TYPE_ORDER, order.id)
    elif event == "cancelled":
        notify_user(
            order.customer_id, "Order cancelled",
            f"{order.order_number} cancel kar diya gaya. {shop}",
            Notification.TYPE_ORDER, order.id,
        )
