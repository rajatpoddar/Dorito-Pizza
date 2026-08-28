"""Integration tests for the public menu endpoints.

These endpoints power the customer-facing menu page; if they break,
nobody can order. Kept as a separate file from `test_phase2_workflows`
because the menu surface is the single most-hit public API.
"""
import pytest

from app.extensions import db
from app.models import Category, MenuItem


@pytest.mark.integration
class TestMenuCategories:
    def test_empty_db_returns_empty_list(self, app, client):
        r = client.get("/api/menu/categories")
        assert r.status_code == 200
        body = r.get_json()
        assert "categories" in body
        assert body["categories"] == []

    def test_returns_categories_with_nested_items(self, app, client):
        with app.app_context():
            cat = Category(name="Pizza", display_order=1, image_url="/images/menu/pizza.svg")
            db.session.add(cat)
            db.session.flush()
            db.session.add(MenuItem(category_id=cat.id, name="Paneer Pizza", price=170))
            db.session.add(MenuItem(category_id=cat.id, name="Veg Pizza", price=120))
            db.session.commit()

        r = client.get("/api/menu/categories")
        assert r.status_code == 200
        cats = r.get_json()["categories"]
        assert len(cats) == 1
        assert cats[0]["name"] == "Pizza"
        assert {i["name"] for i in cats[0]["items"]} == {"Paneer Pizza", "Veg Pizza"}


@pytest.mark.integration
class TestMenuItems:
    def test_items_list_returns_all_items(self, app, client):
        """NB: the public menu endpoint deliberately returns ALL items,
        including `is_available=False` rows. The customer-facing menu
        page filters out unavailable items client-side so a manager
        can re-enable them without a redeploy. If you change this
        contract, also update the menu page filter.
        """
        with app.app_context():
            cat = Category(name="Burger", display_order=2, image_url="/images/menu/burger.svg")
            db.session.add(cat)
            db.session.flush()
            db.session.add(MenuItem(category_id=cat.id, name="Veggie Burger", price=80, is_available=True))
            db.session.add(MenuItem(category_id=cat.id, name="Out of Stock", price=90, is_available=False))
            db.session.commit()

        r = client.get("/api/menu/items")
        assert r.status_code == 200
        items = r.get_json()["items"]
        names = {i["name"] for i in items}
        assert names == {"Veggie Burger", "Out of Stock"}

    def test_items_filter_by_category_id(self, app, client):
        with app.app_context():
            cat_a = Category(name="Pizza", display_order=1, image_url="/p.svg")
            cat_b = Category(name="Burger", display_order=2, image_url="/b.svg")
            db.session.add_all([cat_a, cat_b])
            db.session.flush()
            cat_a_id = cat_a.id  # capture before context exit
            cat_b_id = cat_b.id
            db.session.add(MenuItem(category_id=cat_a_id, name="Paneer Pizza", price=170))
            db.session.add(MenuItem(category_id=cat_b_id, name="Veg Burger", price=80))
            db.session.commit()

        r = client.get(f"/api/menu/items?category_id={cat_a_id}")
        assert r.status_code == 200
        items = r.get_json()["items"]
        assert {i["name"] for i in items} == {"Paneer Pizza"}

    def test_items_search_is_case_insensitive(self, app, client):
        with app.app_context():
            cat = Category(name="Cake and Pasty", display_order=4, image_url="/c.svg")
            db.session.add(cat)
            db.session.flush()
            cat_id = cat.id
            db.session.add(MenuItem(category_id=cat_id, name="Black Forest Cake", price=350))
            db.session.add(MenuItem(category_id=cat_id, name="Vanilla Pastry", price=40))
            db.session.commit()

        r = client.get("/api/menu/items?search=BLACK")
        items = r.get_json()["items"]
        assert {i["name"] for i in items} == {"Black Forest Cake"}

    def test_single_item_lookup(self, app, client):
        with app.app_context():
            cat = Category(name="Pasta", display_order=3, image_url="/images/menu/pasta.svg")
            db.session.add(cat)
            db.session.flush()
            cat_id = cat.id
            it = MenuItem(category_id=cat_id, name="White Sauce Pasta", price=140)
            db.session.add(it)
            db.session.commit()
            iid = it.id

        r = client.get(f"/api/menu/items/{iid}")
        assert r.status_code == 200
        body = r.get_json()
        assert body["item"]["name"] == "White Sauce Pasta"
        assert float(body["item"]["price"]) == 140.0
