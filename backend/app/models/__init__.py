"""All models — import here so Flask-Migrate and the app can see them."""

from app.models.user import User
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.otp_code import OtpCode
from app.models.offer import Offer
from app.models.notification import Notification
from app.models.whatsapp_outbox import WhatsAppOutbox
from app.models.marketing_log import MarketingLog
from app.models.shop_settings import ShopSettings
from app.models.combo_pack import ComboPack, ComboPackItem

__all__ = [
    "User", "Category", "MenuItem", "Order", "OrderItem",
    "OtpCode", "Offer", "Notification", "WhatsAppOutbox", "MarketingLog",
    "ShopSettings", "ComboPack", "ComboPackItem",
]
