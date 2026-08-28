"""Public menu routes — browsing categories and items."""
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import Category, MenuItem

menu_bp = Blueprint("menu", __name__, url_prefix="/api/menu")


@menu_bp.get("/categories")
def list_categories():
    """All categories with their items (public menu page payload)."""
    categories = Category.query.order_by(Category.display_order, Category.name).all()
    return jsonify(categories=[c.to_dict(include_items=True) for c in categories])


@menu_bp.get("/items")
def list_items():
    """Flat item list; optional ?category_id= and ?search= filters."""
    query = MenuItem.query

    category_id = request.args.get("category_id", type=int)
    if category_id:
        query = query.filter(MenuItem.category_id == category_id)

    search = (request.args.get("search") or "").strip()
    if search:
        query = query.filter(MenuItem.name.ilike(f"%{search}%"))

    items = query.order_by(MenuItem.category_id, MenuItem.name).all()
    return jsonify(items=[i.to_dict() for i in items])


@menu_bp.get("/items/<int:item_id>")
def get_item(item_id):
    item = db.session.get(MenuItem, item_id)
    if item is None:
        return jsonify(error="Menu item not found"), 404
    return jsonify(item=item.to_dict())
