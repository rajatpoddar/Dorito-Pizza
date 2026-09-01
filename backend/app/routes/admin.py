"""Manager (admin) routes — dashboard, orders, menu CRUD, staff, offers, analytics."""
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import func

from app.extensions import db
from app.models import Category, ComboPack, ComboPackItem, MenuItem, Notification, Offer, Order, OrderItem, User
from app.services import notify as notify_svc
from app.utils.decorators import roles_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ------------------------------------------------------------------ dashboard
@admin_bp.get("/dashboard")
@roles_required("manager")
def dashboard():
    """Daily sales + live order counts for the manager home screen."""
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    todays_orders = Order.query.filter(Order.created_at >= today_start).all()
    delivered_today = [o for o in todays_orders if o.status == Order.STATUS_DELIVERED]
    active_orders = Order.query.filter(
        Order.status.in_(
            [Order.STATUS_PENDING, Order.STATUS_ACCEPTED, Order.STATUS_PREPARING,
             Order.STATUS_READY, Order.STATUS_OUT_FOR_DELIVERY]
        )
    ).count()

    status_counts = {s: 0 for s in Order.STATUSES}
    for status, count in (
        db.session.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    ):
        status_counts[status] = count

    return jsonify(
        today={
            "total_orders": len(todays_orders),
            "delivered_orders": len(delivered_today),
            "total_sales": float(sum(float(o.total_amount) for o in todays_orders)),
            "delivered_sales": float(sum(float(o.total_amount) for o in delivered_today)),
        },
        active_orders=active_orders,
        status_counts=status_counts,
    )


@admin_bp.get("/dashboard/top-items")
@roles_required("manager")
def top_items():
    rows = (
        db.session.query(
            OrderItem.item_name,
            func.sum(OrderItem.quantity).label("qty"),
            func.sum(OrderItem.unit_price * OrderItem.quantity).label("revenue"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.status != Order.STATUS_CANCELLED)
        .group_by(OrderItem.item_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(10)
        .all()
    )
    return jsonify(
        items=[
            {"item_name": r[0], "quantity": int(r[1]), "revenue": float(r[2])}
            for r in rows
        ]
    )


@admin_bp.get("/dashboard/recent-activity")
@roles_required("manager")
def recent_activity():
    """Last 20 in-app notifications + last 10 outbox messages (one feed)."""
    from app.models import WhatsAppOutbox

    notifs = (
        Notification.query
        .order_by(Notification.created_at.desc())
        .limit(20)
        .all()
    )
    msgs = (
        WhatsAppOutbox.query
        .order_by(WhatsAppOutbox.created_at.desc())
        .limit(10)
        .all()
    )
    return jsonify(
        notifications=[n.to_dict() for n in notifs],
        messages=[
            {
                "id": m.id,
                "phone": m.phone,
                "kind": m.kind,
                "status": m.status,
                "order_id": m.order_id,
                "error": m.error,
                "attempts": m.attempts,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
                "preview": m.message.split("\n", 1)[0][:80],
            }
            for m in msgs
        ],
    )


# ------------------------------------------------------------------ orders
@admin_bp.get("/orders")
@roles_required("manager")
def all_orders():
    """All orders; optional ?status= and ?date=YYYY-MM-DD filters."""
    query = Order.query

    status = request.args.get("status")
    if status:
        if status not in Order.STATUSES:
            return jsonify(error=f"status must be one of {list(Order.STATUSES)}"), 400
        query = query.filter(Order.status == status)

    date_str = request.args.get("date")
    if date_str:
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return jsonify(error="date must be YYYY-MM-DD"), 400
        query = query.filter(
            Order.created_at >= day,
            Order.created_at < day + timedelta(days=1),
        )

    orders = query.order_by(Order.created_at.desc()).limit(200).all()
    return jsonify(orders=[o.to_dict() for o in orders])


@admin_bp.patch("/orders/<int:order_id>/assign")
@roles_required("manager")
def assign_agent(order_id):
    """Assign (or reassign) a delivery agent to an order."""
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404

    data = request.get_json(silent=True) or {}
    agent_id = data.get("agent_id")
    agent = db.session.get(User, agent_id) if agent_id else None
    if agent is None or agent.role != User.ROLE_DELIVERY or not agent.is_active:
        return jsonify(error="Select a valid, active delivery agent"), 400

    order.delivery_agent_id = agent.id
    db.session.commit()
    return jsonify(order=order.to_dict())


@admin_bp.patch("/orders/<int:order_id>/cancel")
@roles_required("manager")
def cancel_order(order_id):
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404
    if order.status == Order.STATUS_DELIVERED:
        return jsonify(error="Delivered orders cannot be cancelled"), 409

    order.status = Order.STATUS_CANCELLED
    db.session.commit()
    notify_svc.notify_order_event(order, "cancelled")
    return jsonify(order=order.to_dict())


@admin_bp.patch("/orders/<int:order_id>/accept")
@roles_required("manager")
def accept_order(order_id):
    """Manager accepts a pending order — moves it to accepted status."""
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404
    if order.status != Order.STATUS_PENDING:
        return jsonify(error="Only pending orders can be accepted"), 409

    order.status = Order.STATUS_ACCEPTED
    db.session.commit()
    notify_svc.notify_order_event(order, "accepted")
    # Send WhatsApp notification
    from app.services import whatsapp as wa_svc
    wa_svc.queue_message(
        order.customer_phone,
        wa_svc.order_accepted_message(order),
        kind=wa_svc.WhatsAppOutbox.KIND_ORDER_ACCEPTED,
        order_id=order.id,
    )
    # Notify all kitchen staff so they hear a beep on the KDS
    notify_svc.notify_role("cook", "New order 👨‍🍳",
                           f"{order.order_number} accept ho gaya — prepare karein.",
                           Notification.TYPE_ORDER, order.id)
    return jsonify(order=order.to_dict())


@admin_bp.patch("/orders/<int:order_id>/reject")
@roles_required("manager")
def reject_order(order_id):
    """Manager rejects a pending order with a reason."""
    order = db.session.get(Order, order_id)
    if order is None:
        return jsonify(error="Order not found"), 404
    if order.status != Order.STATUS_PENDING:
        return jsonify(error="Only pending orders can be rejected"), 409

    data = request.get_json(silent=True) or {}
    reason = (data.get("reason") or "").strip()
    if not reason:
        return jsonify(error="Rejection reason is required"), 400

    order.status = Order.STATUS_REJECTED
    order.reject_reason = reason
    db.session.commit()
    notify_svc.notify_order_event(order, "rejected", reason=reason)
    # Send WhatsApp notification
    from app.services import whatsapp as wa_svc
    wa_svc.queue_message(
        order.customer_phone,
        wa_svc.order_rejected_message(order, reason),
        kind=wa_svc.WhatsAppOutbox.KIND_ORDER_REJECTED,
        order_id=order.id,
    )
    return jsonify(order=order.to_dict())


# ------------------------------------------------------------------ categories
@admin_bp.get("/categories")
@roles_required("manager")
def categories():
    cats = Category.query.order_by(Category.display_order, Category.name).all()
    return jsonify(categories=[c.to_dict() for c in cats])


@admin_bp.post("/categories")
@roles_required("manager")
def add_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="Category name is required"), 400
    if Category.query.filter_by(name=name).first():
        return jsonify(error="Category already exists"), 409

    max_order = db.session.query(db.func.max(Category.display_order)).scalar() or 0
    category = Category(name=name, display_order=max_order + 1)
    db.session.add(category)
    db.session.commit()
    return jsonify(category=category.to_dict()), 201


# ------------------------------------------------------------------ menu items
@admin_bp.post("/menu-items")
@roles_required("manager")
def add_menu_item():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    category_id = data.get("category_id")

    if not name:
        return jsonify(error="Item name is required"), 400
    category = db.session.get(Category, category_id)
    if category is None:
        return jsonify(error="Select a valid category"), 400
    try:
        price = round(float(data.get("price")), 2)
    except (TypeError, ValueError):
        return jsonify(error="Price must be a number"), 400
    if price <= 0:
        return jsonify(error="Price must be greater than 0"), 400

    item = MenuItem(
        name=name,
        category_id=category.id,
        description=(data.get("description") or "").strip() or None,
        price=price,
        is_available=bool(data.get("is_available", True)),
        is_veg=bool(data.get("is_veg", True)),
        image_url=(data.get("image_url") or "").strip() or None,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item=item.to_dict()), 201


@admin_bp.put("/menu-items/<int:item_id>")
@roles_required("manager")
def update_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if item is None:
        return jsonify(error="Menu item not found"), 404

    data = request.get_json(silent=True) or {}
    if "name" in data and (data["name"] or "").strip():
        item.name = data["name"].strip()
    if "description" in data:
        item.description = (data["description"] or "").strip() or None
    if "price" in data:
        try:
            price = round(float(data["price"]), 2)
        except (TypeError, ValueError):
            return jsonify(error="Price must be a number"), 400
        if price <= 0:
            return jsonify(error="Price must be greater than 0"), 400
        item.price = price
    if "is_available" in data:
        item.is_available = bool(data["is_available"])
    if "is_veg" in data:
        item.is_veg = bool(data["is_veg"])
    if "category_id" in data:
        category = db.session.get(Category, data["category_id"])
        if category is None:
            return jsonify(error="Select a valid category"), 400
        item.category_id = category.id
    if "image_url" in data:
        # Allow clearing the image (empty string → NULL)
        item.image_url = (data["image_url"] or "").strip() or None

    db.session.commit()
    return jsonify(item=item.to_dict())


@admin_bp.delete("/menu-items/<int:item_id>")
@roles_required("manager")
def delete_menu_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if item is None:
        return jsonify(error="Menu item not found"), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify(message=f"'{item.name}' removed from the menu")


# ------------------------------------------------------------------ image upload
@admin_bp.post("/menu-items/<int:item_id>/image")
@roles_required("manager")
def upload_menu_item_image(item_id):
    """Upload a single image for a menu item. Returns the public URL
    (relative) which the client then sends in a follow-up PUT to set
    `image_url` on the item (so the same flow can later be used for
    URL-based images without uploading)."""
    item = db.session.get(MenuItem, item_id)
    if item is None:
        return jsonify(error="Menu item not found"), 404
    file = request.files.get("file") or request.files.get("image")
    if file is None or not file.filename:
        return jsonify(error="Send a file in field 'file' (multipart)"), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    allowed = current_app.config.get("UPLOAD_ALLOWED_EXT", {"png", "jpg", "jpeg", "webp", "gif"})
    if ext not in allowed:
        return jsonify(
            error=f"File type '.{ext}' not allowed. Use one of: {', '.join(sorted(allowed))}"
        ), 400

    # Read first, then enforce size cap (so we never write oversize files)
    blob = file.read()
    max_bytes = int(current_app.config.get("UPLOAD_MAX_BYTES", 5 * 1024 * 1024))
    if len(blob) > max_bytes:
        return jsonify(error=f"Image too large (>{max_bytes // (1024*1024)} MB)"), 413

    # Random filename so we never overwrite / leak the original
    safe_name = f"menu_{item.id}_{secrets.token_hex(6)}.{ext}"
    upload_dir = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_dir, exist_ok=True)
    full_path = os.path.join(upload_dir, safe_name)
    with open(full_path, "wb") as fh:
        fh.write(blob)

    image_url = f"/uploads/{safe_name}"
    item.image_url = image_url
    db.session.commit()
    return jsonify(item=item.to_dict(), image_url=image_url), 201


# ------------------------------------------------------------------ staff
@admin_bp.get("/staff")
@roles_required("manager")
def list_staff():
    role = request.args.get("role")
    query = User.query.filter(User.role != User.ROLE_CUSTOMER)
    if role:
        if role not in User.ROLES:
            return jsonify(error=f"role must be one of {list(User.ROLES)}"), 400
        query = query.filter(User.role == role)
    staff = query.order_by(User.role, User.name).all()
    return jsonify(staff=[s.to_dict() for s in staff])


@admin_bp.post("/staff")
@roles_required("manager")
def create_staff():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = "".join(ch for ch in (data.get("phone") or "") if ch.isdigit())
    password = data.get("password") or ""
    role = data.get("role")

    if not name or not phone or not password:
        return jsonify(error="name, phone and password are required"), 400
    if role not in (User.ROLE_MANAGER, User.ROLE_COOK, User.ROLE_DELIVERY):
        return jsonify(error="role must be manager, cook or delivery"), 400
    if len(phone) != 10:
        return jsonify(error="Enter a valid 10-digit mobile number"), 400
    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters"), 400
    if User.query.filter_by(phone=phone).first():
        return jsonify(error="This mobile number is already registered"), 409

    staff = User(name=name, phone=phone, role=role)
    staff.set_password(password)
    db.session.add(staff)
    db.session.commit()
    return jsonify(staff=staff.to_dict()), 201


@admin_bp.patch("/staff/<int:user_id>")
@roles_required("manager")
def toggle_staff(user_id):
    staff = db.session.get(User, user_id)
    if staff is None or staff.role == User.ROLE_CUSTOMER:
        return jsonify(error="Staff member not found"), 404
    data = request.get_json(silent=True) or {}
    if "is_active" in data:
        staff.is_active = bool(data["is_active"])
    db.session.commit()
    return jsonify(staff=staff.to_dict())


# ------------------------------------------------------------------ offers
@admin_bp.get("/offers")
@roles_required("manager")
def list_offers():
    offers = Offer.query.order_by(Offer.created_at.desc()).all()
    return jsonify(offers=[o.admin_dict() for o in offers])


@admin_bp.post("/offers")
@roles_required("manager")
def create_offer():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    if not code or not re.match(r"^[A-Z0-9]{3,20}$", code):
        return jsonify(error="Code 3-20 letters/digits ka hona chahiye (e.g. DORITO20)"), 400
    if Offer.query.filter_by(code=code).first():
        return jsonify(error="Ye offer code already exists"), 409

    dtype = data.get("discount_type", Offer.TYPE_FLAT)
    if dtype not in (Offer.TYPE_PERCENT, Offer.TYPE_FLAT):
        return jsonify(error="discount_type must be percent or flat"), 400
    try:
        value = float(data.get("value"))
        min_amt = float(data.get("min_order_amount") or 0)
    except (TypeError, ValueError):
        return jsonify(error="value / min_order_amount must be numbers"), 400
    if value <= 0 or (dtype == Offer.TYPE_PERCENT and value > 100):
        return jsonify(error="value must be > 0 (percent max 100)"), 400

    def _dt(key):
        raw = data.get(key)
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            return None

    offer = Offer(
        code=code,
        title=(data.get("title") or f"{code} offer").strip(),
        description=(data.get("description") or "").strip() or None,
        discount_type=dtype,
        value=round(value, 2),
        min_order_amount=round(min_amt, 2),
        max_discount=float(data["max_discount"]) if data.get("max_discount") else None,
        starts_at=_dt("starts_at"),
        ends_at=_dt("ends_at"),
        usage_limit=int(data["usage_limit"]) if data.get("usage_limit") else None,
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(offer)
    db.session.commit()
    return jsonify(offer=offer.admin_dict()), 201


@admin_bp.put("/offers/<int:offer_id>")
@roles_required("manager")
def update_offer(offer_id):
    offer = db.session.get(Offer, offer_id)
    if offer is None:
        return jsonify(error="Offer not found"), 404
    data = request.get_json(silent=True) or {}
    for field in ("title", "description"):
        if field in data:
            setattr(offer, field, (data[field] or "").strip() or None)
    if "discount_type" in data and data["discount_type"] in (Offer.TYPE_PERCENT, Offer.TYPE_FLAT):
        offer.discount_type = data["discount_type"]
    for field in ("value", "min_order_amount", "max_discount"):
        if field in data and data[field] is not None:
            setattr(offer, field, round(float(data[field]), 2))
    if "usage_limit" in data:
        offer.usage_limit = int(data["usage_limit"]) if data["usage_limit"] else None
    if "is_active" in data:
        offer.is_active = bool(data["is_active"])
    if "ends_at" in data:
        try:
            offer.ends_at = datetime.fromisoformat(data["ends_at"]) if data["ends_at"] else None
        except ValueError:
            return jsonify(error="ends_at must be ISO format"), 400
    db.session.commit()
    return jsonify(offer=offer.admin_dict())


@admin_bp.delete("/offers/<int:offer_id>")
@roles_required("manager")
def delete_offer(offer_id):
    offer = db.session.get(Offer, offer_id)
    if offer is None:
        return jsonify(error="Offer not found"), 404
    db.session.delete(offer)
    db.session.commit()
    return jsonify(message=f"Offer '{offer.code}' deleted")


# ------------------------------------------------------------------ analytics
@admin_bp.get("/analytics")
@roles_required("manager")
def analytics():
    """7-day trends + business KPIs for the manager."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    orders = Order.query.filter(Order.created_at >= week_ago).all()
    all_orders = Order.query.filter(Order.status != Order.STATUS_CANCELLED).all()

    # daily revenue/orders
    days = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        day_orders = [
            o for o in orders
            if o.created_at.date() == day and o.status != Order.STATUS_CANCELLED
        ]
        days.append({
            "date": day.isoformat(),
            "label": day.strftime("%d %b"),
            "orders": len(day_orders),
            "revenue": round(sum(float(o.total_amount) for o in day_orders), 2),
        })

    # category split (all time) — batch-load menu items to avoid N+1
    item_ids = {
        item.menu_item_id
        for o in all_orders
        for item in o.items
        if item.menu_item_id
    }
    mi_map = {
        mi.id: mi.category.name
        for mi in MenuItem.query.filter(MenuItem.id.in_(item_ids)).all()
    }
    cat_split = {}
    for o in all_orders:
        for item in o.items:
            cat = mi_map.get(item.menu_item_id, "Other")
            cat_split[cat] = cat_split.get(cat, 0.0) + float(item.unit_price) * item.quantity
    categories = [
        {"category": c, "revenue": round(v, 2)}
        for c, v in sorted(cat_split.items(), key=lambda kv: -kv[1])
    ]

    # payment split
    pay = {"cod": [0, 0.0], "upi": [0, 0.0]}
    for o in all_orders:
        pay[o.payment_mode][0] += 1
        pay[o.payment_mode][1] += float(o.total_amount)

    # new vs returning customers (by phone)
    phone_counts = {}
    for o in all_orders:
        phone_counts[o.customer_phone] = phone_counts.get(o.customer_phone, 0) + 1
    new_customers = sum(1 for c in phone_counts.values() if c == 1)
    returning = len(phone_counts) - new_customers

    # top delivery agents
    agent_stats = {}
    for o in all_orders:
        if o.status == Order.STATUS_DELIVERED and o.delivery_agent:
            s = agent_stats.setdefault(o.delivery_agent.name, {"deliveries": 0, "revenue": 0.0})
            s["deliveries"] += 1
            s["revenue"] += float(o.total_amount)
    agents = [
        {"name": n, "deliveries": s["deliveries"], "revenue": round(s["revenue"], 2)}
        for n, s in sorted(agent_stats.items(), key=lambda kv: -kv[1]["deliveries"])
    ][:5]

    total_rev = sum(float(o.total_amount) for o in all_orders)
    repeat_rate = (returning / len(phone_counts) * 100) if phone_counts else 0.0

    return jsonify(
        daily=days,
        categories=categories,
        payment={
            "cod": {"orders": pay["cod"][0], "revenue": round(pay["cod"][1], 2)},
            "upi": {"orders": pay["upi"][0], "revenue": round(pay["upi"][1], 2)},
        },
        customers={"new": new_customers, "returning": returning,
                   "total": len(phone_counts), "repeat_rate_pct": round(repeat_rate, 1)},
        agents=agents,
        kpis={
            "total_revenue": round(total_rev, 2),
            "total_orders": len(all_orders),
            "avg_order_value": round(total_rev / len(all_orders), 2) if all_orders else 0,
            "discount_given": round(sum(float(o.discount_amount or 0) for o in all_orders), 2),
        },
    )


# ------------------------------------------------------------------ combo packs
@admin_bp.get("/combo-packs")
@roles_required("manager")
def list_combo_packs():
    combos = ComboPack.query.order_by(ComboPack.display_order, ComboPack.name).all()
    return jsonify(combo_packs=[c.admin_dict() for c in combos])


@admin_bp.post("/combo-packs")
@roles_required("manager")
def create_combo_pack():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="Combo name is required"), 400

    try:
        combo_price = round(float(data.get("combo_price", 0)), 2)
    except (TypeError, ValueError):
        return jsonify(error="combo_price must be a number"), 400
    if combo_price <= 0:
        return jsonify(error="combo_price must be greater than 0"), 400

    raw_items = data.get("items") or []
    if not raw_items:
        return jsonify(error="Add at least one item to the combo"), 400
    if len(raw_items) > 10:
        return jsonify(error="Maximum 10 items per combo"), 400

    cp = ComboPack(
        name=name,
        description=(data.get("description") or "").strip() or None,
        combo_price=combo_price,
        is_active=bool(data.get("is_active", True)),
        display_order=int(data.get("display_order") or 0),
    )
    db.session.add(cp)
    db.session.flush()

    for idx, line in enumerate(raw_items, start=1):
        mi_id = line.get("menu_item_id")
        mi = db.session.get(MenuItem, mi_id)
        if mi is None:
            return jsonify(error=f"Menu item {mi_id} not found"), 400
        qty = int(line.get("quantity", 1))
        if qty < 1 or qty > 5:
            return jsonify(error="Quantity must be 1-5"), 400
        db.session.add(ComboPackItem(
            combo_pack_id=cp.id,
            menu_item_id=mi.id,
            quantity=qty,
            display_order=idx,
        ))

    db.session.commit()
    return jsonify(combo_pack=cp.admin_dict()), 201


@admin_bp.put("/combo-packs/<int:combo_id>")
@roles_required("manager")
def update_combo_pack(combo_id):
    cp = db.session.get(ComboPack, combo_id)
    if cp is None:
        return jsonify(error="Combo pack not found"), 404
    data = request.get_json(silent=True) or {}

    if "name" in data and (data["name"] or "").strip():
        cp.name = data["name"].strip()
    if "description" in data:
        cp.description = (data["description"] or "").strip() or None
    if "combo_price" in data:
        try:
            cp.combo_price = round(float(data["combo_price"]), 2)
        except (TypeError, ValueError):
            return jsonify(error="combo_price must be a number"), 400
    if "is_active" in data:
        cp.is_active = bool(data["is_active"])
    if "display_order" in data:
        cp.display_order = int(data["display_order"])

    # Replace items if provided
    if "items" in data:
        raw_items = data["items"]
        if not raw_items:
            return jsonify(error="Add at least one item to the combo"), 400
        ComboPackItem.query.filter_by(combo_pack_id=cp.id).delete()
        db.session.flush()
        for idx, line in enumerate(raw_items, start=1):
            mi = db.session.get(MenuItem, line.get("menu_item_id"))
            if mi is None:
                return jsonify(error=f"Menu item {line.get('menu_item_id')} not found"), 400
            qty = int(line.get("quantity", 1))
            if qty < 1 or qty > 5:
                return jsonify(error="Quantity must be 1-5"), 400
            db.session.add(ComboPackItem(
                combo_pack_id=cp.id,
                menu_item_id=mi.id,
                quantity=qty,
                display_order=idx,
            ))

    db.session.commit()
    return jsonify(combo_pack=cp.admin_dict())


@admin_bp.delete("/combo-packs/<int:combo_id>")
@roles_required("manager")
def delete_combo_pack(combo_id):
    cp = db.session.get(ComboPack, combo_id)
    if cp is None:
        return jsonify(error="Combo pack not found"), 404
    db.session.delete(cp)
    db.session.commit()
    return jsonify(message=f"Combo '{cp.name}' deleted")


# ------------------------------------------------------------------ broadcast
@admin_bp.get("/broadcast/vars")
@roles_required("manager")
def broadcast_vars():
    """Return the whitelist of template variables the manager can use in
    broadcast / campaign messages. Frontend uses this to render an inline
    reference (e.g. "Available: {{name}}, {{order_count}}")."""
    from app.services.whatsapp import list_template_vars

    return jsonify(variables=list_template_vars())


@admin_bp.post("/broadcast")
@roles_required("manager")
def broadcast():
    """WhatsApp marketing to opted-in customers + in-app notification.

    `title` and `message` may contain `{{name}}`, `{{order_count}}`,
    `{{last_ordered_at}}` placeholders. They are validated against a
    whitelist (see `services/whatsapp.py`) and rendered per-recipient so
    each customer gets a personalised message.
    """
    from app.models import Notification, Order, WhatsAppOutbox
    from app.services import whatsapp
    from app.services.whatsapp import render_template

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    segment = data.get("segment", "optin")

    if not title or not message:
        return jsonify(error="title and message required"), 400

    # --- validate templates up front (clear 400, not silent send) ---
    try:
        whatsapp.validate_template(title)
        whatsapp.validate_template(message)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400

    query = User.query.filter(User.role == User.ROLE_CUSTOMER, User.is_active.is_(True))
    if segment != "all":
        query = query.filter(User.marketing_optin.is_(True))
    recipients = query.limit(current_app.config["BROADCAST_CAP"]).all()

    track = current_app.config.get("TRACK_BASE_URL", "")
    shop = current_app.config["SHOP_ADDRESS"]
    count = 0
    for u in recipients:
        # ---- per-customer context for template rendering ----
        orders = (
            Order.query.filter(Order.customer_phone == u.phone)
            .order_by(Order.created_at.desc())
            .all()
        )
        order_count = len(orders)
        last_ordered_at = ""
        if orders and orders[0].created_at:
            delta = (datetime.now(timezone.utc) - orders[0].created_at).days
            last_ordered_at = f"{delta} din pehle" if delta >= 0 else ""

        ctx = {
            "name": u.name or "",
            "order_count": order_count,
            "last_ordered_at": last_ordered_at,
        }
        personalised_title = render_template(title, ctx)
        personalised_body = render_template(message, ctx)

        full_msg = (
            "🍕 *Dorito Pizza and Bakery*\n\n"
            f"*{personalised_title}*\n{personalised_body}\n\n"
            f"🔗 Order: {track}\n"
            f"📍 {shop}\n"
            "_Reply STOP to opt out_"
        )
        whatsapp.queue_message(u.phone, full_msg, kind=WhatsAppOutbox.KIND_MARKETING)
        db.session.add(Notification(user_id=u.id, title=personalised_title[:118],
                                    body=personalised_body[:298],
                                    type=Notification.TYPE_OFFER))
        count += 1
    db.session.commit()

    return jsonify(
        sent=count,
        capped=len(recipients) >= current_app.config["BROADCAST_CAP"],
        note="Queued — worker pacing ke saath bhejega (anti-ban)",
    )


@admin_bp.get("/whatsapp/status")
@roles_required("manager")
def whatsapp_status():
    """Evolution API instance connection state."""
    from app.services.whatsapp import instance_status

    return jsonify(instance_status())


@admin_bp.get("/outbox")
@roles_required("manager")
def outbox_audit():
    """Last 50 WhatsApp messages with delivery status (audit/debug)."""
    from app.models import WhatsAppOutbox

    rows = WhatsAppOutbox.query.order_by(WhatsAppOutbox.id.desc()).limit(50).all()
    return jsonify(messages=[
        {
            "id": r.id, "phone": r.phone, "kind": r.kind, "status": r.status,
            "attempts": r.attempts, "error": r.error,
            "preview": r.message[:60].replace("\n", " "),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ])
