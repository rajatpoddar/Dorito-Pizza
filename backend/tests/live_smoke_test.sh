#!/bin/bash
# Live HTTP smoke test against a running Flask server (localhost:5000)
set -u
BASE=http://localhost:5000/api

echo "--- 1. HEALTH ---"
curl -s $BASE/health; echo

echo "--- 2. MENU SEARCH 'pizza' ---"
curl -s "$BASE/menu/items?search=pizza" | python3 -c 'import json,sys; d=json.load(sys.stdin); print([(i["name"], i["price"]) for i in d["items"][:4]])'

echo "--- 3. LOGIN manager ---"
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"phone":"6202965250","password":"Manager@123"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
echo "token acquired: ${TOKEN:0:25}..."

echo "--- 4. GUEST ORDER (2x Dorito Special Pizza id=7) ---"
ORDER=$(curl -s -X POST $BASE/orders -H 'Content-Type: application/json' -d '{"items":[{"menu_item_id":7,"quantity":2}],"customer_name":"Curl Test","customer_phone":"9999999999","delivery_address":"Jamtada Road Palojori near mandir","payment_mode":"upi"}')
echo "$ORDER" | python3 -c 'import json,sys; o=json.load(sys.stdin)["order"]; print("order:", o["order_number"], "| total:", o["total_amount"], "| status:", o["status"])'
OID=$(echo "$ORDER" | python3 -c 'import json,sys; print(json.load(sys.stdin)["order"]["id"])')

echo "--- 5. KITCHEN advance (cook): preparing -> ready ---"
CTOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"phone":"9939794303","password":"Cook@123"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -s -X PATCH $BASE/kitchen/orders/$OID/status -H "Authorization: Bearer $CTOKEN" | python3 -c 'import json,sys; print("status:", json.load(sys.stdin)["order"]["status"])'
curl -s -X PATCH $BASE/kitchen/orders/$OID/status -H "Authorization: Bearer $CTOKEN" | python3 -c 'import json,sys; print("status:", json.load(sys.stdin)["order"]["status"])'

echo "--- 6. MANAGER dashboard ---"
curl -s $BASE/admin/dashboard -H "Authorization: Bearer $TOKEN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("today sales:", d["today"]["total_sales"], "| active:", d["active_orders"])'

echo "--- 7. ASSIGN agent ---"
AID=$(curl -s "$BASE/admin/staff?role=delivery" -H "Authorization: Bearer $TOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["staff"][0]["id"])')
curl -s -X PATCH $BASE/admin/orders/$OID/assign -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"agent_id\":$AID}" | python3 -c 'import json,sys; o=json.load(sys.stdin)["order"]; print("assigned to:", o["delivery_agent"]["name"])'

echo "--- 8. DELIVERY: out_for_delivery -> delivered ---"
DTOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"phone":"9000000001","password":"Agent@123"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -s -X PATCH $BASE/delivery/orders/$OID/status -H "Authorization: Bearer $DTOKEN" | python3 -c 'import json,sys; print("status:", json.load(sys.stdin)["order"]["status"])'
curl -s -X PATCH $BASE/delivery/orders/$OID/status -H "Authorization: Bearer $DTOKEN" | python3 -c 'import json,sys; o=json.load(sys.stdin)["order"]; print("status:", o["status"], "| payment:", o["payment_status"])'

echo ""
echo "LIVE HTTP SMOKE TEST PASSED"
