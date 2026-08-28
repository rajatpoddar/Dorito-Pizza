"""Customer order routes — create (offers+OTP), list mine, live tracking."""
import secrets

from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity

from app.extensions import db, limiter
from app.models import MenuItem, Offer, Order, OrderItem, ShopSettings, User
from app.services import notify as notify_svc
from app.services import whatsapp
from app.utils.ratelimit import ORDERS_GUEST_CHECKOUT, limit as rl_limit

orders_bp = Blueprint("orders", __name__, url_prefix="/api/orders")

MAX_QTY_PER_ITEM = 20


def _optional_user():
    """Return the JWT user if a valid token is present, else None (guest checkout)."""
    try:
        verify_jwt_in_request(optional=True)
    except Exception:
        return None
    identity = get_jwt_identity()
    return db.session.get(User, int(identity)) if identity else None


@orders_bp.post("")
@rl_limit(limiter, ORDERS_GUEST_CHECKOUT)
def create_order():
    """Checkout. Guest ok; totals & discount always computed server-side.

    Body: { items: [{menu_item_id, quantity}], customer_name, customer_phone,
            delivery_address, payment_mode, offer_code? }
    """
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []

    name = (data.get("customer_name") or "").strip()
    phone = "".join(ch for ch in (data.get("customer_phone") or "") if ch.isdigit())
    address = (data.get("delivery_address") or "").strip()
    payment_mode = data.get("payment_mode") or Order.PAYMENT_COD

    if not items:
        return jsonify(error="Your cart is empty"), 400
    if not name:
        return jsonify(error="Customer name is required"), 400
    if len(phone) != 10:
        return jsonify(error="Enter a valid 10-digit mobile number"), 400
    if not address or len(address) < 10:
        return jsonify(error="Please enter a complete delivery address"), 400
    if payment_mode not in Order.PAYMENT_MODES:
        return jsonify(error="payment_mode must be 'cod' or 'upi'"), 400

    # ---- validate & price every line server-side ----
    order_items, subtotal = [], 0.0
    for line in items:
        try:
            menu_item_id = int(line.get("menu_item_id"))
            quantity = int(line.get("quantity", 1))
        except (TypeError, ValueError):
            return jsonify(error="Each item needs menu_item_id and quantity"), 400
        if quantity < 1 or quantity > MAX_QTY_PER_ITEM:
            return jsonify(error="Quantity must be between 1 and 20"), 400

        item = db.session.get(MenuItem, menu_item_id)
        if item is None or not item.is_available:
            return jsonify(
                error=f"Sorry, '{line.get('name') or menu_item_id}' is unavailable right now"
            ), 409

        order_items.append(
            OrderItem(menu_item_id=item.id, item_name=item.name,
                      unit_price=item.price, quantity=quantity)
        )
        subtotal += float(item.price) * quantity

    if not order_items:
        return jsonify(error="Your cart is empty"), 400

    # ---- shop policy (delivery charge, free-delivery threshold, min order) ----
    settings = ShopSettings.get()

    # ---- master switch: shop open / closed ----
    # When the manager toggles the shop closed (SettingsPage), new orders are
    # rejected with 503 + the friendly closed_message. In-flight kitchen /
    # delivery staff consoles continue normally (this only gates POST /orders).
    if not settings.is_shop_open:
        return jsonify(
            error="Shop is currently closed. Please come back during business hours.",
            closed=True,
            closed_message=settings.closed_message or "",
        ), 503

    if settings.min_order_amount and subtotal < float(settings.min_order_amount):
        return jsonify(
            error=f"Minimum order amount ₹{float(settings.min_order_amount):.0f} hai"
        ), 400
    # Free delivery above threshold (or if admin sets charge=0)
    if (settings.delivery_charge or 0) <= 0 or (
        settings.free_delivery_above and subtotal >= float(settings.free_delivery_above)
    ):
        delivery_charge = 0.0
    else:
        delivery_charge = float(settings.delivery_charge)

    # ---- offer / discount ----
    offer, discount, offer_code = None, 0.0, None
    code = (data.get("offer_code") or "").strip().upper()
    if code:
        offer = Offer.query.filter_by(code=code).first()
        if offer is None:
            return jsonify(error=f"Offer code '{code}' valid nahi hai"), 400
        ok, err, discount = offer.validate_for(subtotal)
        if not ok:
            return jsonify(error=err), 400
        offer_code = offer.code

    total = max(0.0, round(subtotal - discount + delivery_charge, 2))
    user = _optional_user()

    order = Order(
        order_number=Order.generate_order_number(),
        customer_id=user.id if user else None,
        customer_name=name,
        customer_phone=phone,
        delivery_address=address,
        status=Order.STATUS_PENDING,
        payment_mode=payment_mode,
        payment_status=Order.PAYMENT_PENDING,
        total_amount=total,
        discount_amount=round(discount, 2),
        delivery_charge=round(delivery_charge, 2),
        offer_id=offer.id if offer else None,
        offer_code=offer_code,
        delivery_otp=f"{secrets.randbelow(10000):04d}",
    )
    order.items = order_items
    db.session.add(order)
    if offer is not None:
        offer.used_count += 1
    db.session.commit()

    # ---- WhatsApp confirmation (with Delivery OTP) + in-app notification ----
    whatsapp.queue_message(phone, whatsapp.order_confirmed_message(order),
                           kind=whatsapp.WhatsAppOutbox.KIND_ORDER_CONFIRMED, order_id=order.id)
    notify_svc.notify_order_event(order, "confirmed")

    return jsonify(order=order.to_dict(include_otp=True)), 201


@orders_bp.get("/my")
def my_orders():
    """Orders of the logged-in user (incl. previously-guest orders after OTP login)."""
    try:
        verify_jwt_in_request()
    except Exception:
        return jsonify(error="Login required"), 401
    user = db.session.get(User, int(get_jwt_identity()))
    orders = (
        Order.query.filter_by(customer_id=user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return jsonify(orders=[o.to_dict() for o in orders])


@orders_bp.get("/<int:order_id>/track")
def track_order(order_id):
    """Live tracking by order id.

    Auth: JWT (logged-in user) OR phone query param (guest).
    If logged in, order must belong to the user — no phone needed.
    Delivery OTP visible once out for delivery.
    """
    from datetime import timezone  # local import keeps top clean

    user = _optional_user()

    phone = "".join(ch for ch in (request.args.get("phone") or "") if ch.isdigit())
    if len(phone) > 10 and phone.startswith("91"):
        phone = phone[-10:]

    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found."), 404

    # If logged in, the order must belong to this user
    if user:
        if order.customer_id != user.id:
            return jsonify(error="Order not found."), 404
    elif phone:
        # Guest: verify by phone
        if order.customer_phone[-10:] != phone[-10:]:
            return jsonify(error="Order not found. Check the order id and phone number."), 404

    show_otp = order.status in (Order.STATUS_OUT_FOR_DELIVERY, Order.STATUS_DELIVERED)
    data = order.to_dict(include_otp=show_otp)
    data["placed_at_local"] = (
        order.created_at.astimezone() if order.created_at.tzinfo else order.created_at
    ).strftime("%d %b %Y, %I:%M %p")
    return jsonify(order=data)


@orders_bp.post("/<int:order_id>/otp/resend")
def resend_delivery_otp(order_id):
    """Re-send the Delivery OTP on WhatsApp (customer tapped 'OTP nahi aaya')."""
    phone = "".join(ch for ch in (request.args.get("phone") or "") if ch.isdigit())
    if len(phone) > 10 and phone.startswith("91"):
        phone = phone[-10:]
    order = db.session.get(Order, order_id)
    if order is None or (phone and order.customer_phone[-10:] != phone[-10:]):
        return jsonify(error="Order not found"), 404
    if order.status not in (Order.STATUS_READY, Order.STATUS_OUT_FOR_DELIVERY):
        return jsonify(error="OTP abhi bhejne ki zaroorat nahi hai"), 409

    whatsapp.queue_message(
        order.customer_phone,
        "🍕 *Dorito Pizza and Bakery*\n\n"
        f"🛵 Order *{order.order_number}* ka Delivery OTP: *{order.delivery_otp}*\n\n"
        "Driver ko delivery ke time ye OTP dikhayein.",
        kind=whatsapp.WhatsAppOutbox.KIND_DELIVERY_OTP,
        order_id=order.id,
    )
    return jsonify(sent=True)
