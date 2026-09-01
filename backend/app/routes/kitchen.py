"""Kitchen Display System (KDS) routes — the cook's view."""
from flask import Blueprint, jsonify

from app.extensions import db
from app.models import Notification, Order
from app.services import notify as notify_svc
from app.services import whatsapp as wa_svc
from app.utils.decorators import roles_required

kitchen_bp = Blueprint("kitchen", __name__, url_prefix="/api/kitchen")

# allowed transitions made by the kitchen
ALLOWED = {
    Order.STATUS_ACCEPTED: Order.STATUS_PREPARING,
    Order.STATUS_PREPARING: Order.STATUS_READY,
}


@kitchen_bp.get("/orders")
@roles_required("cook", "manager")
def queue():
    """All live kitchen orders (oldest first)."""
    orders = (
        Order.query.filter(
            Order.status.in_([Order.STATUS_ACCEPTED, Order.STATUS_PREPARING, Order.STATUS_READY])
        )
        .order_by(Order.created_at.asc())
        .all()
    )
    return jsonify(orders=[o.to_dict() for o in orders])


@kitchen_bp.patch("/orders/<int:order_id>/status")
@roles_required("cook", "manager")
def advance(order_id):
    """Advance an order: accepted → preparing → ready (notifies customer + agent)."""
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404

    next_status = ALLOWED.get(order.status)
    if next_status is None:
        return jsonify(
            error=f"Kitchen cannot move an order from '{order.status}'",
        ), 409

    order.status = next_status
    db.session.commit()
    event = "preparing" if next_status == Order.STATUS_PREPARING else "ready"
    notify_svc.notify_order_event(order, event)

    # WhatsApp: customer should see kitchen progress.
    if next_status == Order.STATUS_PREPARING:
        wa_svc.queue_message(
            order.customer_phone, wa_svc.preparing_message(order),
            kind=wa_svc.WhatsAppOutbox.KIND_PREPARING, order_id=order.id,
        )
    elif next_status == Order.STATUS_READY:
        wa_svc.queue_message(
            order.customer_phone, wa_svc.ready_message(order),
            kind=wa_svc.WhatsAppOutbox.KIND_READY, order_id=order.id,
        )
        # When ready, ping every active delivery agent so they hear a beep
        # and can race to the kitchen / wait for manager assignment.
        notify_svc.notify_role(
            "delivery", "🛵 Order ready for pickup",
            f"{order.order_number} pack ho gaya — manager assign karega.",
            Notification.TYPE_ORDER, order.id,
        )

    return jsonify(order=order.to_dict())
