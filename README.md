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
Customer places order (COD/UPI)
        │ status: pending
        ▼
Cook sees ticket on Kitchen Display ──► "Start Preparing" ──► "Mark Ready"
        │ preparing → ready
        ▼
Manager assigns a delivery agent (Orders page)
        │
        ▼
Agent opens Delivery app ──► "Start Delivery" ──► "Mark Delivered"
        │ out_for_delivery → delivered (payment marked paid)
        ▼
Customer watches every step live on the Track Order page (auto-refresh 5s)
```

---

## 🗂 Project layout

```
backend/                  Flask REST API
├── app/models/           User, Category, MenuItem, Order, OrderItem
├── app/routes/           auth, menu, orders, admin, kitchen, delivery blueprints
├── seed.py               full menu (33 items) + staff accounts
├── tests/                lifecycle + live smoke tests
└── Dockerfile / wsgi.py  gunicorn entrypoint

frontend/                 React + Tailwind SPA
├── src/pages/customer/   Menu, Cart, Checkout, Track, MyOrders, Login, Register
├── src/pages/admin/      Dashboard, ManageOrders, ManageMenu, ManageStaff
├── src/pages/kitchen/    KitchenDisplay (KDS)
├── src/pages/delivery/   Delivery app
├── nginx.conf            SPA fallback + /api proxy
└── Dockerfile            node build → nginx serve

docker-compose.yml        db (postgres:16) + backend + frontend
PLAN.md                   full architecture & planning document
```

## 🔌 API overview

Base URL `/api` — all responses JSON. Auth via `Authorization: Bearer <token>`.

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/register` · `POST /auth/login` · `GET /auth/me` |
| Menu (public) | `GET /menu/categories` · `GET /menu/items?category_id=&search=` |
| Orders | `POST /orders` (guest OK) · `GET /orders/my` · `GET /orders/:id/track?phone=` |
| Admin (manager) | `GET /admin/dashboard` · `GET /admin/orders` · `PATCH /admin/orders/:id/assign` · menu CRUD · staff CRUD |
| Kitchen (cook) | `GET /kitchen/orders` · `PATCH /kitchen/orders/:id/status` |
| Delivery (agent) | `GET /delivery/orders` · `PATCH /delivery/orders/:id/status` |

Order totals are always computed **server-side** from current menu prices; item
name/price snapshots are stored on `order_items` so old orders never change.

---

## 🧪 Tests

```bash
cd backend
DATABASE_URL='sqlite:////tmp/dorito_test.db' ./.venv/bin/python tests/lifecycle_test.py   # full role lifecycle
bash tests/live_smoke_test.sh                                                             # HTTP smoke (server must run)
```

## 🌐 Going to production

1. Set strong `SECRET_KEY` / `JWT_SECRET_KEY` / `POSTGRES_PASSWORD` in `.env`.
2. Remove the `5432:5432` and `5000:5000` port mappings from `docker-compose.yml`
   (traffic should only enter through nginx on :80).
3. Put the app behind HTTPS (e.g. Caddy/traefik or a cloud load balancer).
4. Point a domain at the server and update `server_name` in `frontend/nginx.conf`.

Full planning document: [`PLAN.md`](./PLAN.md)
