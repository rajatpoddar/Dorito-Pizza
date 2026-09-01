# 🍕 Dorito Pizza and Bakery — Online Ordering & Restaurant Management

Production-ready food delivery platform for **Dorito Pizza and Bakery, Jamtada Road, Palojori**.

Four apps in one system:

| App | Who | URL path |
|-----|-----|----------|
| 🛒 Customer ordering (menu, cart, COD/UPI checkout, live tracking) | Public | `/` |
| 📊 Manager panel (sales dashboard, menu CRUD, order→agent assignment, staff) | Manager | `/admin` |
| 👨‍🍳 Kitchen Display System (live order tickets, mark preparing/ready) | Cook | `/kitchen` |
| 🛵 Delivery app (assigned orders, customer address, mark delivered) | Agent | `/delivery` |

**Stack:** Flask 3 + SQLAlchemy + PostgreSQL + JWT · React 18 (Vite) + Tailwind CSS · Docker Compose.

---

## 🚀 Quick start — Option A: without Docker (easiest)

```bash
./run_local.sh
```

Ek hi command — script khud sab kuch karta hai:
- Python venv + pip install (first run only)
- npm install (first run only)
- Database: **SQLite** (`.local_dev.db`) — koi PostgreSQL setup nahi chahiye
- Menu + staff accounts seed
- Backend (Flask :5000) + Frontend (Vite :3000) start + live logs
- **Ctrl+C** → dono servers band

Browser me kholo: **http://localhost:3000**
(Phone se test karne ke liye Vite ka `Network:` URL use karo — same WiFi par.)

Options:
```bash
./run_local.sh --postgres   # local PostgreSQL use karo (chalu hona chahiye)
./run_local.sh --reset      # menu/users reset karke dubara seed karo
```

Logs: `.logs/backend.log`, `.logs/frontend.log`

---

## 🐳 Quick start — Option B: Docker

```bash
# 1. from the project root
docker compose up --build

# 2. open the shop
#    Customer app:      http://localhost
#    API (direct):      http://localhost:5000/api/health
```

The backend automatically seeds the full menu + staff accounts on boot (PostgreSQL 16).

### Staff logins (seeded)

| Role | Phone (login id) | Password |
|------|------------------|----------|
| Manager | `6202965250` | `Manager@123` |
| Kitchen (Cook) | `9939794303` | `Cook@123` |
| Delivery Agent | `9000000001` | `Agent@123` |
| Demo Customer | `9000000002` | `Customer@123` |

> ⚠️ Change these passwords (Manager → Staff page / `seed.py`) and the JWT secrets
> (`.env`) before going live.

---

## 💻 Local development (hot reload)

```bash
# terminal 1 — database
docker compose up db

# terminal 2 — backend (http://localhost:5000)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://dorito:dorito@localhost:5432/dorito
flask --app wsgi db upgrade && python seed.py
python wsgi.py

# terminal 3 — frontend (http://localhost:3000, proxies /api → :5000)
cd frontend
npm install
npm run dev
```

---

## 📖 How an order flows

```
Customer places order (COD/UPI) — saved-address quick select supported
        │ status: pending
        ▼
Manager (Admin) accepts the order from /admin/orders
(manager can also REJECT with reason — WhatsApp + push notification fired)
        │ pending → accepted
        ▼
Cook sees ticket on Kitchen Display ──► "Start Preparing" ──► "Mark Ready"
        │ accepted → preparing → ready
        ▼
Manager assigns a delivery agent (Orders page)
        │
        ▼
Agent opens Delivery app ──► "Start Delivery" ──► customer shares 4-digit OTP ──► "Mark Delivered"
        │ out_for_delivery → delivered (payment marked paid)
        ▼
Customer watches every step live on the Track Order page (auto-refresh 5s)
        │
        ▼
Auto WhatsApp at every state change (order_confirmed, accepted, rejected,
out_for_delivery, delivered). Notification sound plays on staff consoles.
```

---

## 🗂 Project layout

```
backend/                  Flask REST API
├── app/models/           User, Category, MenuItem, Order, OrderItem, Offer,
│                         OtpCode, Notification, WhatsAppOutbox, ShopSettings,
│                         ComboPack(+Item), Address
├── app/routes/           auth, menu, orders, admin (incl. accept/reject,
│                         combo-packs, image upload, broadcast, outbox),
│                         kitchen, delivery, offers, notifications,
│                         addresses, settings
├── app/services/         whatsapp (Evolution API + outbox + templates),
│                         notify (in-app notifications)
├── seed.py               full menu (34 items) + 4 combo packs + staff accounts
├── tests/                tiered: unit (4) / integration (8) / e2e (1) — 82 tests
└── Dockerfile / wsgi.py  gunicorn entrypoint + in-process worker

frontend/                 React + Tailwind SPA
├── src/pages/customer/   Menu, Cart, Checkout, Track, MyOrders, Login,
│                         Register, Account (profile + saved addresses + opt-in)
├── src/pages/admin/      Dashboard, ManageOrders (accept/reject/assign),
│                         ManageMenu (CRUD + image upload), ManageStaff,
│                         ManageOffers, ManageComboPacks, Marketing, Settings
├── src/pages/kitchen/    KitchenDisplay (KDS) — plays sound on new order
├── src/pages/delivery/   Delivery app — plays sound on new delivery
├── src/components/       HeroCarousel, MenuItemCard, ComboPackCard, Navbar,
│                         OrderStatusTracker, Footer, StatusBadge
├── public/sounds/        9 notification MP3s (new_order, accepted, rejected,
│                         delivered, etc.)
├── nginx.conf            SPA fallback + /api proxy
└── Dockerfile            node build → nginx serve

docker-compose.yml        db (postgres:16) + backend + frontend
deploy.sh                 one-command deploy (auto-generates .env with
                          random secrets, picks free ports, builds + starts)
run_local.sh              no-Docker dev runner (SQLite + Vite)
docs/                     project documentation (ARCHITECTURE, DESIGN, MEMORY,
                          PHASE, PLAN, PRD, RULES)
```

## 🔌 API overview

Base URL `/api` — all responses JSON. Auth via `Authorization: Bearer <token>`.

| Area | Method · Path | Access | Notes |
|------|----------------|--------|-------|
| **Auth & Profile** | `POST /auth/register` | public | password signup (kept for back-compat; OTP preferred) |
|  | `POST /auth/login` | public | phone + password (staff) |
|  | `POST /auth/otp/send` | public | send 6-digit WhatsApp login OTP |
|  | `POST /auth/otp/verify` | public | verify OTP → JWT + auto-link guest orders |
|  | `POST /auth/otp/send-update` | JWT | send OTP for **profile phone change** |
|  | `GET /auth/me` | JWT | current user |
|  | `PUT /auth/me/preferences` | JWT | marketing opt-in / opt-out |
|  | `PUT /auth/me/profile` | JWT | update name + phone (phone needs OTP) |
| **Menu (public)** | `GET /menu/categories` | public | categories with items embedded |
|  | `GET /menu/items` | public | flat list, `?category_id=&search=` |
|  | `GET /menu/items/:id` | public | one item |
|  | `GET /menu/combo-packs` | public | active combos for menu page |
| **Orders** | `POST /orders` | public (guest OK) | checkout; server-recomputes totals + discount |
|  | `GET /orders/my` | JWT | caller's order history |
|  | `GET /orders/:id/track` | public (phone) or JWT | live status; OTP visible once out for delivery |
|  | `POST /orders/:id/otp/resend` | public (phone) | re-send delivery OTP on WhatsApp |
| **Customer — Addresses** | `GET /addresses` | JWT customer | list saved (default first) |
|  | `POST /addresses` | JWT customer | add (max 5/user) |
|  | `PUT /addresses/:id` | JWT customer | edit (owner-only) |
|  | `DELETE /addresses/:id` | JWT customer | delete (auto-promotes next default) |
|  | `PATCH /addresses/:id/default` | JWT customer | set default |
| **Notifications** | `GET /notifications` | JWT | unread + recent |
|  | `POST /notifications/read` | JWT | mark one/all read |
| **Settings (public)** | `GET /settings` | public | shop info, delivery charge, open/closed |
| **Admin — Manager** | `GET /admin/dashboard` | manager | today's sales + status counts |
|  | `GET /admin/dashboard/top-items` | manager | top 10 items by qty + revenue |
|  | `GET /admin/dashboard/recent-activity` | manager | last 20 in-app notifications + last 10 WA outbox rows (Live Activity feed) |
|  | `GET /admin/orders` | manager | all orders, `?status=&?date=` filter |
|  | `PATCH /admin/orders/:id/assign` | manager | assign / reassign delivery agent |
|  | `PATCH /admin/orders/:id/cancel` | manager | cancel (with notify) |
|  | `PATCH /admin/orders/:id/accept` | manager | **accept** pending order (new) |
|  | `PATCH /admin/orders/:id/reject` | manager | **reject** pending + reason (new) |
|  | `GET/POST /admin/categories` | manager | category CRUD |
|  | `POST/PUT/DELETE /admin/menu-items[/:id]` | manager | menu item CRUD (incl. `is_veg`) |
|  | `POST /admin/menu-items/:id/image` | manager | upload image (multipart) |
|  | `GET/POST /admin/staff` | manager | list + create staff |
|  | `PATCH /admin/staff/:id` | manager | toggle active / change role |
|  | `GET/POST/PUT/DELETE /admin/offers[/:id]` | manager | coupon CRUD |
|  | `GET/POST /admin/combo-packs` | manager | combo CRUD |
|  | `PUT/DELETE /admin/combo-packs/:id` | manager | combo edit / delete |
|  | `GET /admin/analytics` | manager | 7-day trends + KPIs |
|  | `GET /admin/broadcast/vars` | manager | allowed template vars + sample context |
|  | `POST /admin/broadcast` | manager | WhatsApp blast (200/batch cap) |
|  | `GET /admin/whatsapp/status` | manager | WA instance status |
|  | `GET /admin/outbox` | manager | outbox audit (last 100) |
| **Admin — Settings** | `GET /admin/settings` | manager | shop settings + open/closed toggle |
|  | `PUT /admin/settings` | manager | update any field (delivery_chg, GST, hero, …) |
| **Kitchen (cook)** | `GET /kitchen/orders` | cook / manager | ticket queue |
|  | `PATCH /kitchen/orders/:id/status` | cook / manager | preparing → ready |
| **Delivery (agent)** | `GET /delivery/orders` | delivery / manager | assigned orders |
|  | `PATCH /delivery/orders/:id/status` | delivery / manager | pick up / out for delivery |
|  | `PATCH /delivery/orders/:id/deliver` | delivery / manager | verify 4-digit OTP → delivered |
| **Offers (public)** | `GET /offers` | public | active coupons |
| **Health** | `GET /health` | public | `200 OK` if up |

Order totals are always computed **server-side** from current menu prices; item
name/price snapshots are stored on `order_items` so old orders never change.

**Rate limits** (Flask-Limiter, per-IP): OTP send 3/10 min, OTP verify 10/10 min,
login 10/10 min, register 5/10 min, profile update 5/10 min, guest checkout 10/10 min.

---

## 🧪 Tests

```bash
cd backend
# tiered pytest suite (82 tests across unit / integration / e2e)
./.venv/bin/python -m pytest -m "not e2e" --cov=app            # fast lane, with coverage
./.venv/bin/python -m pytest                                     # full suite incl. e2e
# legacy scripts (still work, but superseded by the tiered suite):
DATABASE_URL='sqlite:////tmp/dorito_test.db' ./.venv/bin/python tests/lifecycle_test.py   # full role lifecycle
bash tests/live_smoke_test.sh                                                             # HTTP smoke (server must run)
```

Coverage floor is **60%** (enforced in CI). Bump up with new tests; never down.

## 🌐 Going to production

### One-command deploy (recommended)

The fastest way to get the app live on a fresh VPS / Synology / Raspberry-Pi-class
server is `deploy.sh` — it auto-generates `.env` with random secrets, picks
free ports, builds + starts all 3 containers and waits for the healthcheck.

```bash
# On your server, as a user with docker + git:
git clone https://github.com/rajatpoddar/Dorito-Pizza.git
cd Dorito-Pizza
bash deploy.sh
```

At the end you'll see:
```
  ═══════════════════════════════════════════════════
   🍕  DORITO PIZZA IS LIVE!
  ═══════════════════════════════════════════════════

  Frontend:   http://<server-ip>:<FRONTEND_PORT>
  Backend:    http://<server-ip>:<BACKEND_PORT>/api/health
```

Run `bash deploy.sh` again any time to pull + redeploy the latest code.

### Pre-deploy checklist (client demo)

- [ ] `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` set on the server's `.env` (else
      OTPs print to console only — fine for demo, replace before go-live).
- [ ] `TRACK_BASE_URL` set to the **public URL** the customer will see
      (e.g. `https://doritopizza.in`) so WhatsApp track links work.
- [ ] `POSTGRES_PASSWORD` regenerated (deploy.sh does this on first run).
- [ ] Manager / Cook / Agent passwords changed from the demo defaults
      (`Manager@123` / `Cook@123` / `Agent@123`) via `/admin/staff`.
- [ ] `SENTRY_DSN` set if you want error tracking (optional, no-op without it).

### Hardening (post‑demo, before real customers)

1. Remove the `5432:5432` and `5000:5000` port mappings from `docker-compose.yml`
   (traffic should only enter through nginx on :80).
2. Put the app behind HTTPS (e.g. Caddy / Traefik / a cloud LB).
3. Point a domain at the server and update `server_name` in `frontend/nginx.conf`.
4. Move rate-limiter storage from in-memory to Redis (set
   `RATELIMIT_STORAGE_URI=redis://...`) so multi-worker counts are accurate.

Full planning document: [`PLAN.md`](./docs/PLAN.md) · Live project memory: [`MEMORY.md`](./docs/MEMORY.md)
