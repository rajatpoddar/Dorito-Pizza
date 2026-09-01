"""Database seeder — full Dorito menu (from the shop's menu card) + staff accounts.

Run:  python seed.py          (adds missing rows, safe to re-run)
      python seed.py --reset  (drops menu/users and reseeds; keeps orders)
"""
import sys

from app import create_app
from app.extensions import db
from app.models import Category, ComboPack, ComboPackItem, MenuItem, User

# (display_order, category_name, image, [(item, price, description), ...])
CATEGORY_IMAGES = {
    "Pizza": "/images/menu/pizza.svg",
    "Burger": "/images/menu/burger.svg",
    "Chicken Item": "/images/menu/chicken.svg",
    "Cake and Pasty": "/images/menu/cake.svg",
    "Coffee and Shake": "/images/menu/coffee.svg",
    "Pasta and Roll": "/images/menu/pasta.svg",
}

# Per-item artwork in frontend/public/assets/menu/. Without these, the
# frontend falls back to a generic per-category bucket PNG that no longer
# exists in the assets folder, so every item would render as a broken image.
ITEM_IMAGES = {
    # Pizza
    "Veg Pizza":                   "/assets/menu/veg-pizza.png",
    "Veg Sweet Corn Pizza":        "/assets/menu/veg-sweet-corn-pizza.png",
    "Baby Corn Pizza":             "/assets/menu/baby-corn-pizza.png",
    "Chicken Pizza":               "/assets/menu/chicken-pizza.png",
    "Paneer Pizza":                "/assets/menu/paneer-pizza.png",
    "Chicken Extra Cheese Pizza":  "/assets/menu/chicken-extra-cheese-pizza.png",
    "Dorito Special Pizza":        "/assets/menu/dorito-special-pizza.png",
    # Burger
    "Veg Burger":                  "/assets/menu/veg-burger.png",
    "Chicken Burger":              "/assets/menu/chicken-burger.png",
    "Paneer Burger":               "/assets/menu/paneer-burger.png",
    "Chicken Cheese Burger":       "/assets/menu/chicken-cheese-burger.png",
    "Paneer Cheese Burger":        "/assets/menu/paneer-cheese-burger.png",
    # Chicken Item
    "Chicken Pakoda":              "/assets/menu/chicken-pakoda.png",
    "Chicken Chilli":              "/assets/menu/chicken-chilli.png",
    "Butter Chicken":              "/assets/menu/butter-chicken.png",
    "Chicken Fry":                 "/assets/menu/chicken-fry.png",
    "Chicken 65":                  "/assets/menu/chicken-65.png",
    "Chicken Tikka":               "/assets/menu/chicken-tikka.png",
    "Roasted Chicken":             "/assets/menu/roasted-chicken.png",
    # Cake and Pasty
    "Vanilla Pudding":             "/assets/menu/vanilla-pudding.png",
    "Chocolate Pudding":           "/assets/menu/chocolate-pudding.png",
    "Pasty":                       "/assets/menu/pasty.png",
    "1 Pound Vanilla Cake":        "/assets/menu/1-pound-vanilla-cake.png",
    "1 Pound Chocolate Cake":      "/assets/menu/1-pound-chocolate-cake.png",
    # Coffee and Shake
    "Coffee":                      "/assets/menu/coffee.png",
    "Hot Chocolate Coffee":        "/assets/menu/hot-chocolate-coffee.png",
    "Cold Coffee":                 "/assets/menu/cold-coffee.png",
    "Strawberry Shake":            "/assets/menu/strawberry-shake.png",
    "Banana Shake":                "/assets/menu/banana-shake.png",
    # Pasta and Roll
    "Veg Roll":                    "/assets/menu/veg-roll.png",
    "Veg Pasta":                   "/assets/menu/veg-pasta.png",
    "Chicken Roll":                "/assets/menu/chicken-roll.png",
    "Paneer Roll":                 "/assets/menu/paneer-roll.png",
    "Chicken Pasta":               "/assets/menu/chicken-pasta.png",
}

# (display_order, category_name, [(item_name, price, description, is_veg), ...])
# is_veg: True = veg 🟢, False = non-veg 🔴
MENU = [
    (1, "Pizza", [
        ("Veg Pizza", 120, "Classic veggie pizza with fresh vegetables and cheese", True),
        ("Veg Sweet Corn Pizza", 130, "Sweet corn toppings with melted cheese", True),
        ("Baby Corn Pizza", 140, "Crunchy baby corn with cheese and herbs", True),
        ("Chicken Pizza", 150, "Loaded with juicy chicken chunks", False),
        ("Paneer Pizza", 170, "Soft paneer cubes with tangy sauce", True),
        ("Chicken Extra Cheese Pizza", 180, "Double cheese with chicken — a fan favourite", False),
        ("Dorito Special Pizza", 180, "Our house special — fully loaded", False),
    ]),
    (2, "Burger", [
        ("Veg Burger", 50, "Crispy veg patty with mayo and lettuce", True),
        ("Chicken Burger", 70, "Juicy chicken patty burger", False),
        ("Paneer Burger", 90, "Grilled paneer patty with spices", True),
        ("Chicken Cheese Burger", 100, "Chicken patty with a cheese slice", False),
        ("Paneer Cheese Burger", 110, "Paneer patty topped with cheese", True),
    ]),
    (3, "Chicken Item", [
        ("Chicken Pakoda", 120, "Golden-fried chicken fritters", False),
        ("Chicken Chilli", 150, "Spicy indo-chilli style chicken", False),
        ("Butter Chicken", 150, "Rich and creamy tomato butter gravy", False),
        ("Chicken Fry", 150, "Crispy fried chicken", False),
        ("Chicken 65", 150, "Fiery south-Indian style chicken 65", False),
        ("Chicken Tikka", 180, "Char-grilled marinated chicken tikka", False),
        ("Roasted Chicken", 400, "Full roasted chicken — perfect for sharing", False),
    ]),
    (4, "Cake and Pasty", [
        ("Vanilla Pudding", 30, "Smooth vanilla pudding cup", True),
        ("Chocolate Pudding", 40, "Rich chocolate pudding cup", True),
        ("Pasty", 40, "Flaky bakery pasty with savoury filling", True),
        ("1 Pound Vanilla Cake", 250, "Soft vanilla sponge cake (1 pound)", True),
        ("1 Pound Chocolate Cake", 250, "Decadent chocolate cake (1 pound)", True),
    ]),
    (5, "Coffee and Shake", [
        ("Coffee", 20, "Hot regular coffee", True),
        ("Hot Chocolate Coffee", 30, "Coffee blended with hot chocolate", True),
        ("Cold Coffee", 50, "Chilled creamy cold coffee", True),
        ("Strawberry Shake", 50, "Fresh strawberry milkshake", True),
        ("Banana Shake", 60, "Thick banana milkshake", True),
    ]),
    (6, "Pasta and Roll", [
        ("Veg Roll", 25, "Spicy veg filling rolled in flaky pastry", True),
        ("Veg Pasta", 50, "Veg pasta in tangy red sauce", True),
        ("Chicken Roll", 60, "Chicken filling rolled in flaky pastry", False),
        ("Paneer Roll", 70, "Paneer filling rolled in flaky pastry", True),
        ("Chicken Pasta", 100, "Chicken pasta in creamy sauce", False),
    ]),
]

STAFF = [
    # (name, phone, password, role)
    ("Rajat (Manager)", "6202965250", "Manager@123", User.ROLE_MANAGER),
    ("Kitchen (Cook)", "9939794303", "Cook@123", User.ROLE_COOK),
    ("Delivery Agent 1", "9000000001", "Agent@123", User.ROLE_DELIVERY),
    ("Demo Customer", "9000000002", "Customer@123", User.ROLE_CUSTOMER),
]


def seed(reset: bool = False) -> None:
    app = create_app()
    with app.app_context():
        # safety: create any missing tables (no-op if migrations already ran)
        db.create_all()

        if reset:
            print("⚠  Resetting menu items, categories and users …")
            # orders keep their snapshots; FK menu_item_id is SET NULL
            for table in ("order_items",):
                db.session.execute(db.text(f"DELETE FROM {table}"))
            MenuItem.query.delete()
            Category.query.delete()
            User.query.delete()
            db.session.commit()

        # ---------- categories + items ----------
        for order, cat_name, items in MENU:
            category = Category.query.filter_by(name=cat_name).first()
            if category is None:
                category = Category(name=cat_name, display_order=order,
                                    image_url=CATEGORY_IMAGES.get(cat_name))
                db.session.add(category)
                db.session.flush()
                print(f"  + category: {cat_name}")
            elif not category.image_url:
                # backfill images on older databases
                category.image_url = CATEGORY_IMAGES.get(cat_name)
            for name, price, desc, is_veg in items:
                item_image = ITEM_IMAGES.get(name)
                existing = MenuItem.query.filter_by(name=name).first()
                if existing is None:
                    db.session.add(
                        MenuItem(
                            category_id=category.id, name=name,
                            price=price, description=desc,
                            image_url=item_image, is_veg=is_veg,
                        )
                    )
                    print(f"    + item: {name} (₹{price}) {'🟢' if is_veg else '🔴'}")
                else:
                    # backfill image + is_veg on items seeded before
                    # these fields were added (run-once, idempotent).
                    if item_image and not existing.image_url:
                        existing.image_url = item_image
                    if not hasattr(existing, 'is_veg') or existing.is_veg is None:
                        existing.is_veg = is_veg
        db.session.commit()

        # ---------- users ----------
        for name, phone, password, role in STAFF:
            if User.query.filter_by(phone=phone).first() is None:
                user = User(name=name, phone=phone, role=role)
                user.set_password(password)
                db.session.add(user)
                print(f"  + user: {name} [{role}] ({phone})")
        db.session.commit()

        cats = Category.query.count()
        items = MenuItem.query.count()
        users = User.query.count()

        # ---------- sample offers (idempotent) ----------
        from datetime import datetime, timedelta, timezone

        from app.models import Offer

        if Offer.query.count() == 0:
            end = datetime.now(timezone.utc) + timedelta(days=90)
            db.session.add_all([
                Offer(code="DORITO20", title="20% Off — Dorito Special",
                      description="₹249 se zyada ke order par 20% discount (max ₹60)",
                      discount_type=Offer.TYPE_PERCENT, value=20,
                      min_order_amount=249, max_discount=60, ends_at=end,
                      usage_limit=500),
                Offer(code="WELCOME50", title="Flat ₹50 Off — First Order",
                      description="₹299 se zyada ke order par ₹50 ka discount",
                      discount_type=Offer.TYPE_FLAT, value=50,
                      min_order_amount=299, ends_at=end, usage_limit=300),
            ])
            print("  + offers: DORITO20, WELCOME50")

        db.session.commit()

        # ---------- combo packs (idempotent) ----------
        if ComboPack.query.count() == 0:
            _seed_combo_packs()

        db.session.commit()
        print(f"\n✅ Seed complete — {cats} categories, {items} items, {users} users.")


def _seed_combo_packs() -> None:
    """Create sample combo packs from existing menu items."""
    combos = [
        {
            "name": "Pizza + Burger Combo",
            "description": "Veg Pizza + Veg Burger — save ₹70!",
            "combo_price": 150,
            "items": [
                ("Veg Pizza", 1),
                ("Veg Burger", 1),
            ],
        },
        {
            "name": "Chicken Lovers Combo",
            "description": "Chicken 65 + Chicken Roll — save ₹60!",
            "combo_price": 150,
            "items": [
                ("Chicken 65", 1),
                ("Chicken Roll", 1),
            ],
        },
        {
            "name": "Coffee Break Combo",
            "description": "Cold Coffee + Pasty — save ₹30!",
            "combo_price": 60,
            "items": [
                ("Cold Coffee", 1),
                ("Pasty", 1),
            ],
        },
        {
            "name": "Veg Feast Combo",
            "description": "Paneer Pizza + Veg Pasta + Banana Shake — save ₹150!",
            "combo_price": 250,
            "items": [
                ("Paneer Pizza", 1),
                ("Veg Pasta", 1),
                ("Banana Shake", 1),
            ],
        },
    ]

    for idx, combo in enumerate(combos, start=1):
        cp = ComboPack(
            name=combo["name"],
            description=combo["description"],
            combo_price=combo["combo_price"],
            display_order=idx,
        )
        db.session.add(cp)
        db.session.flush()  # get cp.id
        for item_idx, (item_name, qty) in enumerate(combo["items"], start=1):
            mi = MenuItem.query.filter_by(name=item_name).first()
            if mi:
                db.session.add(ComboPackItem(
                    combo_pack_id=cp.id,
                    menu_item_id=mi.id,
                    quantity=qty,
                    display_order=item_idx,
                ))
        print(f"  + combo: {combo['name']} (₹{combo['combo_price']})")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
