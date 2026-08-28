"""Delivery agent routes — assigned orders, OTP-verified delivery."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models import Order
from app.services import notify as notify_svc
from app.services import whatsapp
from app.utils.decorators import roles_required

delivery_bp = Blueprint("delivery", __name__, url_prefix="/api/delivery")


@delivery_bp.get("/orders")
@roles_required("delivery")
def my_deliveries():
    """Orders assigned to me that are ready or on the way."""
    agent_id = int(get_jwt_identity())
    orders = (
        Order.query.filter(
            Order.delivery_agent_id == agent_id,
            Order.status.in_([Order.STATUS_READY, Order.STATUS_OUT_FOR_DELIVERY]),
        )
        .order_by(Order.created_at.asc())
        .all()
    )
    return jsonify(orders=[o.to_dict() for o in orders])


@delivery_bp.patch("/orders/<int:order_id>/status")
@roles_required("delivery")
def start_delivery(order_id):
    """ready → out_for_delivery (customer gets WhatsApp + in-app notice)."""
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404
    if order.delivery_agent_id != int(get_jwt_identity()):
        return jsonify(error="This order is not assigned to you"), 403
    if order.status != Order.STATUS_READY:
        return jsonify(error=f"Order '{order.status}' state me delivery start nahi ho sakta"), 409

    order.status = Order.STATUS_OUT_FOR_DELIVERY
    db.session.commit()

    whatsapp.queue_message(order.customer_phone,
                           whatsapp.out_for_delivery_message(order),
                           kind=whatsapp.WhatsAppOutbox.KIND_OUT_FOR_DELIVERY, order_id=order.id)
    notify_svc.notify_order_event(order, "out_for_delivery")
    return jsonify(order=order.to_dict())


@delivery_bp.patch("/orders/<int:order_id>/deliver")
@roles_required("delivery")
def deliver(order_id):
    """out_for_delivery → delivered. Requires the customer's 4-digit OTP."""
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404
    if order.delivery_agent_id != int(get_jwt_identity()):
        return jsonify(error="This order is not assigned to you"), 403
    if order.status != Order.STATUS_OUT_FOR_DELIVERY:
        return jsonify(error="Pehle 'Start Delivery' karein, phir OTP verify hoga"), 409

    data = request.get_json(silent=True) or {}
    otp = "".join(ch for ch in str(data.get("otp", "")) if ch.isdigit())
    if len(otp) != 4:
        return jsonify(error="Customer se 4-digit OTP lein"), 400
    if otp != order.delivery_otp:
        return jsonify(error="Galat OTP. Customer se dobara confirm karein."), 401

    order.status = Order.STATUS_DELIVERED
    # money settled at the doorstep (COD cash collected / UPI verified)
    order.payment_status = Order.PAYMENT_PAID
    db.session.commit()

    whatsapp.queue_message(order.customer_phone,
                           whatsapp.delivered_message(order),
                           kind=whatsapp.WhatsAppOutbox.KIND_DELIVERED, order_id=order.id)
    notify_svc.notify_order_event(order, "delivered")
    return jsonify(order=order.to_dict())
