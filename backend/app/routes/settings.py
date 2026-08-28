"""Public + admin shop settings (delivery charge, free-delivery threshold, etc.)."""
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import ShopSettings
from app.utils.decorators import roles_required

# Public blueprint: GET /api/settings
public_bp = Blueprint("settings_public", __name__, url_prefix="/api/settings")

# Admin blueprint: GET/PUT /api/admin/settings
admin_bp = Blueprint("settings_admin", __name__, url_prefix="/api/admin/settings")


# ------------------ public (no auth) ------------------
@public_bp.get("", strict_slashes=False)
def get_public_settings():
    """Settings safe to show to every customer. Used by cart / checkout
    to compute the live delivery charge."""
    return jsonify(settings=ShopSettings.get().public_dict())


# ------------------ admin (manager only) ------------------
SETTINGS_FIELDS = (
    "delivery_charge",
    "free_delivery_above",
    "min_order_amount",
    "gst_percent",
    "shop_name",
    "shop_tagline",
    "shop_address",
    "shop_phone",
    "shop_phone_2",
    "hero_title",
    "hero_subtitle",
    "hero_image_url",
    # Shop availability — master switch for accepting new orders.
    "is_shop_open",
    "closed_message",
)


@admin_bp.get("", strict_slashes=False)
@roles_required("manager")
def get_admin_settings():
    return jsonify(settings=ShopSettings.get().admin_dict())


@admin_bp.put("", strict_slashes=False)
@roles_required("manager")
def update_admin_settings():
    """Update one or more settings. Unknown fields are ignored. Numeric
    fields are clamped to >= 0 to avoid nonsense values."""
    data = request.get_json(silent=True) or {}
    row = ShopSettings.get()
    changed = []
    string_fields = (
        "shop_name", "shop_tagline", "shop_address",
        "shop_phone", "shop_phone_2",
        "hero_title", "hero_subtitle", "hero_image_url",
        "closed_message",
    )
    bool_fields = ("is_shop_open",)
    for field in SETTINGS_FIELDS:
        if field not in data:
            continue
        value = data[field]
        if field in string_fields:
            value = (str(value) if value is not None else "").strip()
            if field == "shop_name" and not value:
                return jsonify(error="shop_name cannot be empty"), 400
            if field == "hero_title" and not value:
                return jsonify(error="hero_title cannot be empty"), 400
            # Cap closed_message to the column length (255).
            if field == "closed_message":
                value = value[:255]
        elif field in bool_fields:
            if not isinstance(value, bool):
                return jsonify(error=f"'{field}' must be true or false"), 400
        else:
            try:
                value = round(float(value), 2)
            except (TypeError, ValueError):
                return jsonify(error=f"'{field}' must be a number"), 400
            if value < 0:
                return jsonify(error=f"'{field}' cannot be negative"), 400
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed.append(field)
    if changed:
        db.session.commit()
    return jsonify(settings=row.admin_dict(), updated=changed)
