"""Public offers (active coupons) for the checkout screen."""
from flask import Blueprint, jsonify

from app.models import Offer

offers_bp = Blueprint("offers", __name__, url_prefix="/api/offers")


@offers_bp.get("")
def list_active_offers():
    offers = Offer.query.order_by(Offer.created_at.desc()).limit(20).all()
    live = [o for o in offers if o.is_live()]
    return jsonify(offers=[o.public_dict() for o in live])
