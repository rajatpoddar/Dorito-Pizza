"""Phase 2 backend tests — WhatsApp OTP login, offers, analytics, worker.

Run from backend/: DATABASE_URL='sqlite:////tmp/p2.db' .venv/bin/python tests/phase2_test.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.extensions import db as _db  # noqa: E402

app = create_app()
c = app.test_client()
_results = []


def check(label, cond, detail=""):
    _results.append((label, cond))
    print(f"{'PASS' if cond else 'FAIL'} {label}{' | ' + str(detail) if detail else ''}")
    return not cond  # raise indicator handled by caller


with app.app_context():
    _db.drop_all()
    _db.create_all()
    from app.models import Category, MenuItem, Offer  # noqa: F401
    cat = Category(name="Pizza", display_order=1, image_url="/images/menu/pizza.svg")
    _db.session.add(cat); _db.session.flush()
    _db.session.add(MenuItem(category_id=cat.id, name="Paneer Pizza", price=170))
    _db.session.add(Offer(code="TEST20", title="20% off", discount_type="percent",
                          value=20, min_order_amount=300, max_discount=60,
                          usage_limit=10))
    from app.models import User
    mgr = User(name="Mgr", phone="6000000000", role="manager"); mgr.set_password("Test@123")
    agt = User(name="Agent", phone="7000000000", role="delivery"); agt.set_password("Agent@123")
    _db.session.add_all([mgr, agt]); _db.session.commit()

# ---- 1b. Guest order BEFORE any login (the 'data save' promise) ----
item_id = c.get("/api/menu/items").get_json()["items"][0]["id"]
r = c.post("/api/orders", json={
    "items": [{"menu_item_id": item_id, "quantity": 1}],
    "customer_name": "Ravi", "customer_phone": "9123456780",
    "delivery_address": "Jamatara Road Palojori Deoghar 814146",
    "payment_mode": "cod"})
guest_od = r.get_json()["order"]

# ---- 1. WhatsApp OTP send (no API key -> debug_otp fallback) ----
r = c.post("/api/auth/otp/send", json={"phone": "9123456780"})
d = r.get_json()
check("otp/send returns debug_otp when no API key", r.status_code == 200 and d.get("debug_otp"), d)
code = d["debug_otp"]
check("otp/send rate-limits immediate resend",
      c.post("/api/auth/otp/send", json={"phone": "9123456780"}).status_code == 429)
check("otp/verify rejects wrong code",
      c.post("/api/auth/otp/verify", json={"phone": "9123456780", "code": "000000"}).status_code == 401)

# right code -> new customer created + previous guest orders linked
r = c.post("/api/auth/otp/verify", json={"phone": "9123456780", "code": code, "name": "Ravi Kumar"})
d = r.get_json()
check("otp/verify creates user + JWT", r.status_code == 200 and d["user"]["role"] == "customer", d.get("user"))
check("previous GUEST order auto-linked on first login",
      d.get("linked_orders", 0) >= 1 and d["user"]["name"] == "Ravi Kumar", d.get("linked_orders"))
token = d["access_token"]
auth = {"Authorization": f"Bearer {token}"}
r = c.get("/api/orders/my", headers=auth)
check("order history visible after login", any(o["id"] == guest_od["id"] for o in r.get_json()["orders"]))

# ---- 3. Logged-in order WITH offer ----
r = c.post("/api/orders", headers=auth, json={
    "items": [{"menu_item_id": item_id, "quantity": 2}],   # 340 subtotal
    "customer_name": "Ravi", "customer_phone": "9123456780",
    "delivery_address": "Jamatara Road Palojori Deoghar 814146",
    "payment_mode": "upi", "offer_code": "TEST20"})
od = r.get_json()["order"]
check("logged-in order attached to account", od["customer_id"] is not None, od.get("customer_id"))
check("order has delivery_otp", len(od["delivery_otp"]) == 4)
check("percent offer applied (340-60 cap)",
      od["discount_amount"] == 60 and od["total_amount"] == 280, od)
check("bad offer rejected", c.post("/api/orders", json={
    "items": [{"menu_item_id": item_id, "quantity": 1}], "customer_name": "X",
    "customer_phone": "9123456780", "delivery_address": "Jamatara Road Palojori Deoghar",
    "payment_mode": "cod", "offer_code": "NOPE123"}).status_code == 400)
r = c.get("/api/offers")
check("public offers list", any(o["code"] == "TEST20" for o in r.get_json()["offers"]))

# ---- 4. Kitchen -> delivery with OTP ----
mh = {"Authorization": "Bearer " + c.post("/api/auth/login",
      json={"phone": "6000000000", "password": "Test@123"}).get_json()["access_token"]}
ah = {"Authorization": "Bearer " + c.post("/api/auth/login",
      json={"phone": "7000000000", "password": "Agent@123"}).get_json()["access_token"]}
aid = c.get("/api/admin/staff?role=delivery", headers=mh).get_json()["staff"][0]["id"]
c.patch(f"/api/admin/orders/{od['id']}/assign", headers=mh, json={"agent_id": aid})
for _ in range(2):
    c.patch(f"/api/kitchen/orders/{od['id']}/status", headers=mh)
trk = c.get(f"/api/orders/{od['id']}/track?phone=9123456780").get_json()["order"]
check("delivery_otp hidden pre-delivery", "delivery_otp" not in trk)
c.patch(f"/api/delivery/orders/{od['id']}/status", headers=ah)   # start delivery
trk = c.get(f"/api/orders/{od['id']}/track?phone=9123456780").get_json()["order"]
check("delivery_otp visible once out for delivery", trk.get("delivery_otp") == od["delivery_otp"])
check("resend otp endpoint",
      c.post(f"/api/orders/{od['id']}/otp/resend?phone=9123456780").status_code == 200)
wrong = c.patch(f"/api/delivery/orders/{od['id']}/deliver", headers=ah, json={"otp": "9999"})
check("deliver with wrong OTP -> 401", wrong.status_code == 401)
ok = c.patch(f"/api/delivery/orders/{od['id']}/deliver", headers=ah, json={"otp": od["delivery_otp"]})
okj = ok.get_json()["order"]
check("deliver with right OTP -> delivered+paid",
      ok.status_code == 200 and okj["status"] == "delivered" and okj["payment_status"] == "paid")

# notifications created for logged-in customer
r = c.get("/api/notifications", headers=auth).get_json()
check("in-app notifications flowing", r["unread"] >= 3, f"unread={r['unread']}")

# ---- 5. Broadcast + analytics + whatsapp status/outbox ----
br = c.post("/api/admin/broadcast", headers=mh,
            json={"title": "Diwali Dhamaka!", "message": "20% off aaj hi"}).get_json()
check("broadcast queues messages", br.get("sent", 0) >= 1, br)
an = c.get("/api/admin/analytics", headers=mh).get_json()
check("analytics shape", an["kpis"]["total_orders"] >= 2 and len(an["daily"]) == 7, an["kpis"])
ws = c.get("/api/admin/whatsapp/status", headers=mh).get_json()
check("whatsapp status probe (no key -> reason)", ws["connected"] is False)
ob = c.get("/api/admin/outbox", headers=mh).get_json()["messages"]
kinds = {m["kind"] for m in ob}
need = {"otp", "order_confirmed", "out_for_delivery", "delivered", "marketing"}
check("outbox audit has all message kinds", need <= kinds, kinds)

# ---- 6. Worker processes outbox (no key -> marked skipped) ----
from app.services.whatsapp import process_outbox  # noqa: E402
process_outbox(app)
from app.models import WhatsAppOutbox  # noqa: E402
with app.app_context():
    statuses = {row.status for row in WhatsAppOutbox.query.all()}
    check("worker marks rows without API key as skipped",
          "skipped_no_key" in statuses, statuses)

passed = sum(1 for _, ok in _results if ok)
print(f"\nPHASE2 TESTS: {passed}/{len(_results)} passed")
if passed != len(_results):
    sys.exit(1)
