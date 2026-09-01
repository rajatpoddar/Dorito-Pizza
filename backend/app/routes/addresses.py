"""Customer saved addresses — CRUD endpoints."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.extensions import db
from app.models import Address, User
from app.utils.decorators import roles_required

addresses_bp = Blueprint("addresses", __name__, url_prefix="/api/addresses")


def _current_user():
    """Return the JWT user or None."""
    try:
        verify_jwt_in_request()
    except Exception:
        return None
    identity = get_jwt_identity()
    return db.session.get(User, int(identity)) if identity else None


@addresses_bp.get("")
@roles_required("customer")
def list_addresses():
    """Return all saved addresses for the logged-in user, default first."""
    user = _current_user()
    addresses = (
        Address.query.filter_by(user_id=user.id)
        .order_by(Address.is_default.desc(), Address.created_at.desc())
        .all()
    )
    return jsonify(addresses=[a.to_dict() for a in addresses])


@addresses_bp.post("")
@roles_required("customer")
def create_address():
    """Add a new saved address (max 5 per user)."""
    user = _current_user()
    count = Address.query.filter_by(user_id=user.id).count()
    if count >= Address.MAX_ADDRESSES_PER_USER:
        return jsonify(error=f"Maximum {Address.MAX_ADDRESSES_PER_USER} addresses allowed"), 400

    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "Home").strip()
    full_address = (data.get("full_address") or "").strip()

    if not full_address:
        return jsonify(error="Address is required"), 400

    lat = data.get("lat")
    lng = data.get("lng")
    is_default = bool(data.get("is_default", False))

    # If this is the first address or is_default is True, clear other defaults
    if is_default or count == 0:
        Address.query.filter_by(user_id=user.id).update({"is_default": False})
        is_default = True

    address = Address(
        user_id=user.id,
        label=label,
        full_address=full_address,
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        is_default=is_default,
    )
    db.session.add(address)
    db.session.commit()
    return jsonify(address=address.to_dict()), 201


@addresses_bp.put("/<int:address_id>")
@roles_required("customer")
def update_address(address_id):
    """Update a saved address (owner only)."""
    user = _current_user()
    address = db.session.get(Address, address_id)
    if address is None or address.user_id != user.id:
        return jsonify(error="Address not found"), 404

    data = request.get_json(silent=True) or {}
    if "label" in data:
        address.label = (data["label"] or "Home").strip()
    if "full_address" in data:
        fa = (data["full_address"] or "").strip()
        if not fa:
            return jsonify(error="Address is required"), 400
        address.full_address = fa
    if "lat" in data:
        address.lat = float(data["lat"]) if data["lat"] is not None else None
    if "lng" in data:
        address.lng = float(data["lng"]) if data["lng"] is not None else None
    if "is_default" in data and data["is_default"]:
        Address.query.filter_by(user_id=user.id).update({"is_default": False})
        address.is_default = True

    db.session.commit()
    return jsonify(address=address.to_dict())


@addresses_bp.delete("/<int:address_id>")
@roles_required("customer")
def delete_address(address_id):
    """Delete a saved address (owner only)."""
    user = _current_user()
    address = db.session.get(Address, address_id)
    if address is None or address.user_id != user.id:
        return jsonify(error="Address not found"), 404

    was_default = address.is_default
    db.session.delete(address)
    db.session.commit()

    # If we deleted the default, promote the most recent remaining one
    if was_default:
        latest = (
            Address.query.filter_by(user_id=user.id)
            .order_by(Address.created_at.desc())
            .first()
        )
        if latest:
            latest.is_default = True
            db.session.commit()

    return jsonify(message="Address deleted")


@addresses_bp.patch("/<int:address_id>/default")
@roles_required("customer")
def set_default(address_id):
    """Set an address as the default (owner only)."""
    user = _current_user()
    address = db.session.get(Address, address_id)
    if address is None or address.user_id != user.id:
        return jsonify(error="Address not found"), 404

    Address.query.filter_by(user_id=user.id).update({"is_default": False})
    address.is_default = True
    db.session.commit()
    return jsonify(address=address.to_dict())
