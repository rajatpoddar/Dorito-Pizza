"""Rename menu PNGs to per-item slugs and set image_url on each MenuItem.

The /public/assets/menu/ folder had generic bucket names like
pizza_01.png, burger_03.png. This script:
  1. Maps each menu item to its assigned PNG by current bucket logic.
  2. Renames the file to `<item-slug>.png` (e.g. `veg-pizza.png`).
  3. Writes that new path into `menu_items.image_url`.

If the script is re-run it's a no-op (slug already exists, item has
image_url set).

Usage:
    cd backend && ./.venv/bin/python ../scripts/seed_images.py
"""
import os
import re
import shutil
import sys

# allow running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import Category, MenuItem  # noqa: E402


# Same mapping as frontend constants.js (itemImage)
ASSET_BUCKETS = {
    "pizza": "pizza",
    "burger": "burger",
    "chicken": "fried_food",
    "pasta": "pasta_wrap",
    "cake": "dessert",
    "coffee": "drink",
    "shake": "drink",
    "roll": "pasta_wrap",
    "pastry": "dessert",
    "pasty": "dessert",
    "fried": "fried_food",
    "wrap": "pasta_wrap",
    "drink": "drink",
    "dessert": "dessert",
}
BUCKET_COUNTS = {
    "pizza": 7, "burger": 5, "chicken": 7, "pasta": 5, "cake": 5, "coffee": 5,
    "shake": 5, "roll": 5, "pastry": 5, "pasty": 5, "fried": 7, "wrap": 5,
    "drink": 5, "dessert": 5,
}


def bucket_for(category_name: str) -> str:
    cat = (category_name or "").lower()
    for key, val in ASSET_BUCKETS.items():
        if key in cat:
            return val
    return "pizza"


def slugify(name: str) -> str:
    """e.g. 'Chicken Extra Cheese Pizza' -> 'chicken-extra-cheese-pizza'."""
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main() -> int:
    app = create_app()
    # Project layout: scripts/ is at root, public/ is at frontend/public
    here = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.normpath(
        os.path.join(here, "..", "frontend", "public", "assets", "menu")
    )
    if not os.path.isdir(assets_dir):
        print(f"❌ assets dir not found: {assets_dir}")
        return 1

    renamed, skipped, missing = 0, 0, 0
    with app.app_context():
        # Build a per-category ordered list of items (by id) so we can
        # assign the bucket file based on (id-1) % N, matching the
        # frontend helper exactly.
        cats = Category.query.order_by(Category.id).all()
        for cat in cats:
            bucket = bucket_for(cat.name)
            n = BUCKET_COUNTS.get(bucket, 5)
            items = (
                MenuItem.query.filter_by(category_id=cat.id)
                .order_by(MenuItem.id)
                .all()
            )
            for idx_zero, item in enumerate(items):
                bucket_idx = (idx_zero % n) + 1
                old_name = f"{bucket}_{bucket_idx:02d}.png"
                old_path = os.path.join(assets_dir, old_name)
                new_name = f"{slugify(item.name)}.png"
                new_path = os.path.join(assets_dir, new_name)

                if not os.path.exists(old_path):
                    print(f"  ⚠️  missing source: {old_name} (for '{item.name}')")
                    missing += 1
                    continue

                if old_path == new_path:
                    skipped += 1
                else:
                    if os.path.exists(new_path):
                        # already renamed in a previous run; overwrite
                        os.remove(new_path)
                    os.rename(old_path, new_path)
                    renamed += 1

                new_url = f"/assets/menu/{new_name}"
                if item.image_url != new_url:
                    item.image_url = new_url

        db.session.commit()

    print(f"\n✅ Done. renamed={renamed} skipped={skipped} missing={missing}")
    print(f"   assets dir: {assets_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
