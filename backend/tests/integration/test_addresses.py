"""Integration tests for the customer addresses CRUD endpoints."""
import pytest

from app.extensions import db
from app.models import User


@pytest.fixture
def customer_token(client, app):
    """Create a customer and return their JWT."""
    with app.app_context():
        user = User(name="Test Customer", phone="9876543210", role="customer")
        user.set_password("Test@123")
        db.session.add(user)
        db.session.commit()

    r = client.post("/api/auth/login", json={"phone": "9876543210", "password": "Test@123"})
    assert r.status_code == 200, r.get_json()
    return r.get_json()["access_token"]


@pytest.fixture
def auth_h(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


class TestAddressCRUD:
    def test_list_empty(self, client, auth_h):
        r = client.get("/api/addresses", headers=auth_h)
        assert r.status_code == 200
        assert r.get_json()["addresses"] == []

    def test_create_address(self, client, auth_h):
        r = client.post("/api/addresses", headers=auth_h, json={
            "label": "Home",
            "full_address": "123 Main St, Palojori, Deoghar",
        })
        assert r.status_code == 201
        addr = r.get_json()["address"]
        assert addr["label"] == "Home"
        assert addr["full_address"] == "123 Main St, Palojori, Deoghar"
        assert addr["is_default"] is True  # first address is auto-default

    def test_create_requires_address(self, client, auth_h):
        r = client.post("/api/addresses", headers=auth_h, json={"label": "Work"})
        assert r.status_code == 400

    def test_create_with_coords(self, client, auth_h):
        r = client.post("/api/addresses", headers=auth_h, json={
            "label": "Work",
            "full_address": "456 Office Rd",
            "lat": 24.5,
            "lng": 86.7,
        })
        assert r.status_code == 201
        addr = r.get_json()["address"]
        assert addr["lat"] == 24.5
        assert addr["lng"] == 86.7

    def test_max_5_addresses(self, client, auth_h):
        for i in range(5):
            r = client.post("/api/addresses", headers=auth_h, json={
                "label": f"Addr {i}",
                "full_address": f"Address number {i}",
            })
            assert r.status_code == 201
        r = client.post("/api/addresses", headers=auth_h, json={
            "label": "Too many",
            "full_address": "Should fail",
        })
        assert r.status_code == 400

    def test_list_returns_all(self, client, auth_h):
        for i in range(3):
            client.post("/api/addresses", headers=auth_h, json={
                "label": f"Place {i}",
                "full_address": f"Location {i}",
            })
        r = client.get("/api/addresses", headers=auth_h)
        assert r.status_code == 200
        assert len(r.get_json()["addresses"]) == 3

    def test_update_address(self, client, auth_h):
        r = client.post("/api/addresses", headers=auth_h, json={
            "label": "Home",
            "full_address": "Old address",
        })
        addr_id = r.get_json()["address"]["id"]

        r = client.put(f"/api/addresses/{addr_id}", headers=auth_h, json={
            "full_address": "New address, updated",
        })
        assert r.status_code == 200
        assert r.get_json()["address"]["full_address"] == "New address, updated"

    def test_update_cannot_clear_address(self, client, auth_h):
        r = client.post("/api/addresses", headers=auth_h, json={
            "label": "Home",
            "full_address": "Some address",
        })
        addr_id = r.get_json()["address"]["id"]

        r = client.put(f"/api/addresses/{addr_id}", headers=auth_h, json={
            "full_address": "",
        })
        assert r.status_code == 400

    def test_delete_address(self, client, auth_h):
        r = client.post("/api/addresses", headers=auth_h, json={
            "label": "Home",
            "full_address": "To delete",
        })
        addr_id = r.get_json()["address"]["id"]

        r = client.delete(f"/api/addresses/{addr_id}", headers=auth_h)
        assert r.status_code == 200

        r = client.get("/api/addresses", headers=auth_h)
        assert len(r.get_json()["addresses"]) == 0

    def test_delete_default_promotes_another(self, client, auth_h):
        r1 = client.post("/api/addresses", headers=auth_h, json={
            "label": "Home",
            "full_address": "Address 1",
        })
        r2 = client.post("/api/addresses", headers=auth_h, json={
            "label": "Work",
            "full_address": "Address 2",
        })
        addr1_id = r1.get_json()["address"]["id"]
        addr2_id = r2.get_json()["address"]["id"]

        # Delete the default (first) address
        client.delete(f"/api/addresses/{addr1_id}", headers=auth_h)

        # The remaining address should become default
        r = client.get("/api/addresses", headers=auth_h)
        addrs = r.get_json()["addresses"]
        assert len(addrs) == 1
        assert addrs[0]["id"] == addr2_id
        assert addrs[0]["is_default"] is True

    def test_set_default(self, client, auth_h):
        r1 = client.post("/api/addresses", headers=auth_h, json={
            "label": "Home",
            "full_address": "Home addr",
        })
        r2 = client.post("/api/addresses", headers=auth_h, json={
            "label": "Work",
            "full_address": "Work addr",
        })
        addr2_id = r2.get_json()["address"]["id"]

        # Make address 2 the default
        r = client.patch(f"/api/addresses/{addr2_id}/default", headers=auth_h)
        assert r.status_code == 200
        assert r.get_json()["address"]["is_default"] is True

        # Verify: address 1 should no longer be default
        r = client.get("/api/addresses", headers=auth_h)
        addrs = r.get_json()["addresses"]
        default_addrs = [a for a in addrs if a["is_default"]]
        assert len(default_addrs) == 1
        assert default_addrs[0]["id"] == addr2_id

    def test_cannot_update_other_users_address(self, client, app):
        # Create user 1 with an address
        with app.app_context():
            u1 = User(name="User 1", phone="9876543210", role="customer")
            u1.set_password("Pass@123")
            u2 = User(name="User 2", phone="9876543211", role="customer")
            u2.set_password("Pass@123")
            db.session.add_all([u1, u2])
            db.session.commit()

        r1 = client.post("/api/auth/login", json={"phone": "9876543210", "password": "Pass@123"})
        h1 = {"Authorization": f"Bearer {r1.get_json()['access_token']}"}
        r2 = client.post("/api/auth/login", json={"phone": "9876543211", "password": "Pass@123"})
        h2 = {"Authorization": f"Bearer {r2.get_json()['access_token']}"}

        r = client.post("/api/addresses", headers=h1, json={
            "label": "Home",
            "full_address": "User 1 address",
        })
        addr_id = r.get_json()["address"]["id"]

        # User 2 cannot update user 1's address
        r = client.put(f"/api/addresses/{addr_id}", headers=h2, json={
            "full_address": "Hacked",
        })
        assert r.status_code == 404

    def test_requires_auth(self, client):
        r = client.get("/api/addresses")
        assert r.status_code == 401

    def test_staff_cannot_access(self, client, app):
        with app.app_context():
            mgr = User(name="Manager", phone="6202965250", role="manager")
            mgr.set_password("Manager@123")
            db.session.add(mgr)
            db.session.commit()

        r = client.post("/api/auth/login", json={"phone": "6202965250", "password": "Manager@123"})
        h = {"Authorization": f"Bearer {r.get_json()['access_token']}"}

        r = client.get("/api/addresses", headers=h)
        assert r.status_code == 403
