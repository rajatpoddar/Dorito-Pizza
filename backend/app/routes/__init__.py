"""Blueprint registry — single place to add new route modules."""
from app.routes.auth import auth_bp
from app.routes.menu import menu_bp
from app.routes.orders import orders_bp
from app.routes.offers import offers_bp
from app.routes.notifications import notifications_bp
from app.routes.admin import admin_bp
from app.routes.kitchen import kitchen_bp
from app.routes.delivery import delivery_bp
from app.routes.settings import public_bp as settings_public_bp, admin_bp as settings_admin_bp

ALL_BLUEPRINTS = (
    auth_bp, menu_bp, orders_bp, offers_bp, notifications_bp,
    admin_bp, kitchen_bp, delivery_bp,
    settings_public_bp, settings_admin_bp,
)


def register_blueprints(app):
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)
