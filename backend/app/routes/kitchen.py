"""Kitchen Display System (KDS) routes — the cook's view."""
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Order
from app.services import notify as notify_svc
from app.utils.decorators import roles_required

kitchen_bp = Blueprint("kitchen", __name__, url_prefix="/api/kitchen")

# allowed transitions made by the kitchen
ALLOWED = {
    Order.STATUS_PENDING: Order.STATUS_PREPARING,
    Order.STATUS_PREPARING: Order.STATUS_READY,
}


@kitchen_bp.get("/orders")
@roles_required("cook", "manager")
def queue():
    """All live kitchen orders (oldest first)."""
    orders = (
        Order.query.filter(
            Order.status.in_([Order.STATUS_PENDING, Order.STATUS_PREPARING, Order.STATUS_READY])
        )
        .order_by(Order.created_at.asc())
        .all()
    )
    return jsonify(orders=[o.to_dict() for o in orders])


@kitchen_bp.patch("/orders/<int:order_id>/status")
@roles_required("cook", "manager")
def advance(order_id):
    """Advance an order: pending → preparing → ready (notifies the customer)."""
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
    notify_svc.notify_order_event(
        order, "preparing" if next_status == Order.STATUS_PREPARING else "ready"
    )
    return jsonify(order=order.to_dict())
