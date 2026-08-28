"""End-to-end backend lifecycle test (SQLite). Run from backend/: venv python tests/lifecycle_test.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402

app = create_app()
c = app.test_client()


def show(label, resp, keys=None):
    data = resp.get_json()
    extra = ""
    if keys:
        parts = []
        for k in keys:
            v = data.get(k)
            if v is None and isinstance(data.get("order"), dict):
                v = data["order"].get(k)
            parts.append(f"{k}={v}")
        extra = " | " + ", ".join(parts)
    print(f"{'PASS' if resp.status_code < 300 else 'FAIL'} {label}: {resp.status_code}{extra}")
    return data


show("GET /api/health", c.get("/api/health"))
cats = show("GET /api/menu/categories", c.get("/api/menu/categories"))["categories"]
pizza = next(c for c in cats if c["name"] == "Pizza")
print("   Pizza items:", [(i["name"], i["price"]) for i in pizza["items"]][:3], "...")

cook = show("POST /api/auth/login (cook)", c.post("/api/auth/login", json={"phone": "9939794303", "password": "Cook@123"}), ["role"])
cook_h = {"Authorization": f"Bearer {cook['access_token']}"}

items = []
for cat in cats:
    for it in cat["items"]:
        if it["name"] in ("Dorito Special Pizza", "Cold Coffee"):
            items.append({"menu_item_id": it["id"], "quantity": 2 if "Pizza" in it["name"] else 1})

ord_data = c.post("/api/orders", json={
    "items": items,
    "customer_name": "Test Customer", "customer_phone": "9876543210",
    "delivery_address": "Near Bus Stand, Palojori, Deoghar, Jharkhand",
    "payment_mode": "cod"})
order = show("POST /api/orders (guest checkout)", ord_data, ["order_number", "total_amount", "status"])["order"]
assert abs(order["total_amount"] - (180 * 2 + 50)) < 0.01, "total wrong!"
print("   Server-side total verified: 180*2 + 50 =", order["total_amount"])

bad = c.post("/api/orders", json={"items": [{"menu_item_id": 1, "quantity": 1}], "customer_name": "X", "customer_phone": "123", "delivery_address": "short", "payment_mode": "cod"})
show("POST /api/orders (invalid -> 400)", bad)

k = c.get("/api/kitchen/orders", headers=cook_h).get_json()["orders"]
print(f"   KDS queue: {len(k)} orders")
show("PATCH kitchen advance -> preparing", c.patch(f"/api/kitchen/orders/{order['id']}/status", headers=cook_h), ["status"])
show("PATCH kitchen advance -> ready", c.patch(f"/api/kitchen/orders/{order['id']}/status", headers=cook_h), ["status"])

mgr = show("POST /api/auth/login (manager)", c.post("/api/auth/login", json={"phone": "6202965250", "password": "Manager@123"}), ["role"])
mgr_h = {"Authorization": f"Bearer {mgr['access_token']}"}
dash = show("GET /api/admin/dashboard", c.get("/api/admin/dashboard", headers=mgr_h))
print("   Dashboard: today sales =", dash["today"]["total_sales"], "| active orders =", dash["active_orders"])
agents = c.get("/api/admin/staff?role=delivery", headers=mgr_h).get_json()["staff"]
show("PATCH assign delivery agent", c.patch(f"/api/admin/orders/{order['id']}/assign", headers=mgr_h, json={"agent_id": agents[0]["id"]}), ["status"])

deny = c.get("/api/admin/dashboard", headers=cook_h)
show("GET /api/admin/dashboard as cook (-> 403)", deny)

dlv = show("POST /api/auth/login (agent)", c.post("/api/auth/login", json={"phone": "9000000001", "password": "Agent@123"}), ["role"])
dlv_h = {"Authorization": f"Bearer {dlv['access_token']}"}
my = c.get("/api/delivery/orders", headers=dlv_h).get_json()["orders"]
print(f"   Agent queue: {len(my)} orders")
show("PATCH delivery -> out_for_delivery", c.patch(f"/api/delivery/orders/{order['id']}/status", headers=dlv_h), ["status"])

# delivered now REQUIRES the customer's 4-digit Delivery OTP
wrong = c.patch(f"/api/delivery/orders/{order['id']}/deliver", headers=dlv_h, json={"otp": "0000"})
show("PATCH deliver with WRONG otp (-> 401)", wrong)
correct_otp = order["delivery_otp"]
fin = show("PATCH deliver with correct OTP", c.patch(f"/api/delivery/orders/{order['id']}/deliver", headers=dlv_h, json={"otp": correct_otp}), ["status", "payment_status"])["order"]

show("GET track order (public)", c.get(f"/api/orders/{order['id']}/track?phone=9876543210"), ["status"])
print()
print("FULL ORDER LIFECYCLE TEST PASSED: pending -> preparing -> ready -> out_for_delivery -> delivered(OTP)")
