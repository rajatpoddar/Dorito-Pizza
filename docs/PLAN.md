# 🍕 DORITO PIZZA AND BAKERY — Food Delivery & Restaurant Management Platform

> **Project Plan & Architecture Document**
> Shop: Dorito Pizza and Bakery | Location: Jamatara Road, Palojori, Deoghar, Jharkhand 814146
> Phones (from menu card): 6202965250, 9939794303

---

## 1. PROJECT OVERVIEW

A production-ready food ordering platform with 4 role-based applications sharing one
Flask REST API + PostgreSQL database and one React SPA:

| # | App | User Role | Key Features |
|---|-----|-----------|--------------|
| 1 | **Customer App** (public) | `customer` | Browse menu by category, cart, checkout (COD/UPI) with OTP verification, live order tracking (Pending → Preparing → Out for Delivery → Delivered), WhatsApp notifications |
| 2 | **Manager Panel** (admin) | `manager` | Dashboard (daily sales, active orders), menu CRUD (price/availability), order assignment to delivery agents, staff creation, offers/discounts, analytics, WhatsApp marketing broadcast |
| 3 | **Kitchen Display System** | `cook` | Real-time incoming order tickets, status flow `pending → preparing → ready` |
| 4 | **Delivery Agent App** | `delivery` | Assigned orders + customer address, OTP-verified delivery, status flow `out_for_delivery → delivered` |

### Order Lifecycle (single source of truth)

```
pending ──► accepted ──► preparing ──► ready ──► out_for_delivery ──► delivered
   │           (Manager)   (Cook/KDS)   (Cook)    (Manager assigns →)   (Agent + OTP verify)
   └────────► rejected (Manager, with reason → customer notified)
   └────────► cancelled (Manager only, before delivery)
```

### Real-time strategy
- **Polling every 5s** via `setInterval` + axios on order lists/tracking.
  Chosen over WebSockets for reliability behind nginx/docker and zero extra services.
  (Upgrade path: Flask-SocketIO documented in §9.)

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 + Flask 3, Flask-SQLAlchemy, Flask-Migrate (Alembic), Flask-JWT-Extended |
| Database | PostgreSQL 16 (SQLAlchemy ORM), SQLite for local dev |
| Frontend | React 18 (Vite) + React Router v6 + Tailwind CSS v3 |
| Auth | WhatsApp OTP via Evolution API (customers), JWT (all roles), role-based decorators |
| WhatsApp | Evolution API v2.3.5 (outbox pattern, anti-ban pacing, 2.5s min interval) |
| Deployment | Docker + docker-compose (3 services: db, backend, frontend/nginx) |
| PWA | Service worker + manifest + icons (installable via Add-to-Home-Screen) |

---

## 3. FOLDER STRUCTURE

```
dorito/
├── PLAN.md                     ← this document
├── README.md                   ← run & deploy instructions
├── docker-compose.yml          ← db + backend + frontend
├── run_local.sh                ← local dev runner (SQLite, no Docker needed)
├── .gitignore
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── .env                    ← local env (EVOLUTION_API_KEY, etc.)
│   ├── wsgi.py                 ← entrypoint (gunicorn / flask dev)
│   ├── seed.py                 ← `python seed.py` populates menu + staff
│   ├── config.py               ← Dev/Docker/Test configs
│   └── app/
│       ├── __init__.py         ← application factory + blueprint registration
│       ├── extensions.py       ← db, jwt, migrate, CORS singletons
│       ├── worker.py           ← WhatsApp outbox paced sender (python -m app.worker)
│       ├── scheduler.py        ← Marketing automation (python -m app.scheduler)
│       ├── models/
│       │   ├── __init__.py     ← re-export all models
│       │   ├── user.py         ← User (roles: customer/manager/cook/delivery)
│       │   ├── category.py     ← Category
│       │   ├── menu_item.py    ← MenuItem
│       │   ├── order.py        ← Order (+status/payment/delivery_otp/offer enums)
│       │   ├── order_item.py   ← OrderItem (price/name snapshot)
│       │   ├── otp_code.py     ← OTP codes (hashed at rest, 10 min expiry)
│       │   ├── offer.py        ← Offers / coupons (percent|flat, min order, usage limit)
│       │   ├── notification.py ← In-app notifications (bell icon)
│       │   ├── whatsapp_outbox.py ← Queued WA messages (audit trail)
│       │   └── marketing_log.py   ← One-per-user-per-window dedup
│       ├── services/
│       │   ├── whatsapp.py     ← Evolution API client, message templates, outbox processing
│       │   └── notify.py       ← In-app notification helpers
│       ├── utils/
│       │   ├── __init__.py
│       │   ├── decorators.py   ← @roles_required('manager', ...)
│       │   └── schema_helpers.py ← Auto-add missing columns (SQLite compat)
│       └── routes/
│           ├── __init__.py     ← register_blueprints()
│           ├── auth.py         ← /api/auth/* (register, login, OTP send/verify, me)
│           ├── menu.py         ← /api/menu/*            (public)
│           ├── orders.py       ← /api/orders/*          (create, my, track, resend OTP)
│           ├── offers.py       ← /api/offers/*          (public active offers)
│           ├── notifications.py← /api/notifications/*   (bell, mark-read)
│           ├── admin.py        ← /api/admin/*           (dashboard, orders, menu, staff, offers, analytics, broadcast, WA status)
│           ├── kitchen.py      ← /api/kitchen/*         (cook)
│           └── delivery.py     ← /api/delivery/*        (agent, OTP-verified delivery)
│
└── frontend/
    ├── Dockerfile              ← multi-stage: node build → nginx serve
    ├── nginx.conf              ← SPA fallback + /api proxy → backend
    ├── package.json
    ├── vite.config.js          ← dev proxy /api → localhost:5000
    ├── tailwind.config.js      ← brand colors (red/gold/black menu theme)
    ├── postcss.config.js
    ├── index.html              ← favicon.svg + PWA manifest + apple-touch-icon
    └── public/
        ├── favicon.svg         ← pizza slice SVG favicon
        ├── manifest.json       ← PWA manifest
        ├── sw.js               ← Service worker (offline-first)
        ├── icon-192.png        ← PWA icon
        ├── icon-512.png        ← PWA icon
        └── images/menu/        ← Branded SVG food category images
    └── src/
        ├── main.jsx            ← Router + providers + SW registration
        ├── App.jsx             ← route table (all 4 role dashboards)
        ├── index.css           ← Tailwind directives + base styles
        ├── api/client.js       ← axios instance (JWT interceptor)
        ├── constants.js        ← order status flow, labels, category images
        ├── context/
        │   ├── AuthContext.jsx ← login/register/sendOtp/verifyOtp/logout
        │   └── CartContext.jsx ← cart + localStorage persistence
        ├── components/
        │   ├── Navbar.jsx          ← role-based navigation
        │   ├── HeroCarousel.jsx    ← auto-play offer carousel
        │   ├── MenuItemCard.jsx    ← menu item with image + add-to-cart
        │   ├── OrderStatusTracker.jsx ← visual progress bar
        │   └── StatusBadge.jsx     ← colored status pill
        └── pages/
            ├── customer/
            │   ├── MenuPage.jsx        ← category tabs + menu grid
            │   ├── CartPage.jsx        ← quantity adjust + total
            │   ├── CheckoutPage.jsx    ← form + OTP verify + place order
            │   ├── TrackOrderPage.jsx  ← order list (logged in) / lookup (guest) / live tracking
            │   ├── MyOrdersPage.jsx    ← order history with status
            │   ├── LoginPage.jsx       ← OTP (customer) + password (staff) tabs
            │   └── RegisterPage.jsx    ← customer signup
            ├── admin/
            │   ├── DashboardPage.jsx      ← KPI cards + status bar + top items
            │   ├── ManageOrdersPage.jsx   ← all orders + assign agent + cancel
            │   ├── ManageMenuPage.jsx     ← CRUD + availability toggle
            │   ├── ManageStaffPage.jsx    ← create/toggle cook/delivery/manager
            │   ├── ManageOffersPage.jsx   ← create/edit/delete offers
            │   ├── AnalyticsPage.jsx      ← 7-day chart + category split + KPIs
            │   └── MarketingPage.jsx      ← WhatsApp broadcast + outbox audit
            ├── kitchen/
            │   └── KitchenDisplayPage.jsx ← live order queue + advance status
            └── delivery/
                └── DeliveryPage.jsx       ← assigned orders + start/deliver with OTP
```

---

## 4. DATABASE SCHEMA

### users
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(120) | |
| phone | String(15) unique | **login identifier** (no email — shop runs on phone/UPI culture) |
| password_hash | String(255) nullable | werkzeug pbkdf2 (customers may be OTP-only) |
| role | Enum('customer','manager','cook','delivery') | |
| is_active | Boolean default True | |
| marketing_optin | Boolean default True | opt-in for marketing WhatsApp |
| last_login_at | DateTime(tz) nullable | |
| created_at | DateTime(tz) | |

### categories
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(80) unique | Pizza, Burger, ... |
| display_order | Integer | menu card ordering |
| image_url | String nullable | SVG category image path |

### menu_items
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| category_id | FK → categories.id | |
| name | String(120) | |
| description | Text nullable | |
| price | Numeric(10,2) | INR |
| is_available | Boolean default True | manager toggle = "sold out" |
| image_url | String nullable | future: real photos |
| created_at / updated_at | DateTime | |

### orders
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| order_number | String(20) unique | `DP-YYYYMMDD-XXXX` |
| customer_id | FK → users.id nullable | linked on OTP login |
| customer_name / customer_phone | String | snapshot |
| delivery_address | Text | |
| status | Enum('pending','accepted','preparing','ready','out_for_delivery','delivered','cancelled','rejected') | |
| payment_mode | Enum('cod','upi') | |
| payment_status | Enum('pending','paid') | auto-paid on delivery |
| total_amount | Numeric(10,2) | server-computed (never trust client) |
| delivery_agent_id | FK → users.id nullable | manager assigns |
| delivery_otp | String(4) | 4-digit OTP for doorstep verification |
| offer_id | FK → offers.id nullable | |
| offer_code | String(30) nullable | snapshot |
| discount_amount | Numeric(10,2) default 0 | |
| created_at / updated_at | DateTime | |

### order_items
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| order_id | FK → orders.id (cascade delete) | |
| menu_item_id | FK → menu_items.id (SET NULL) | |
| item_name | String(120) | snapshot at purchase time |
| unit_price | Numeric(10,2) | snapshot |
| quantity | Integer ≥ 1 | |

### otp_codes
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| phone | String(15) indexed | |
| code_hash | String(64) | SHA-256(salt:code), never stored plain |
| purpose | String(20) default 'login' | |
| attempts | Integer default 0 | max 5 |
| expires_at | DateTime(tz) | 10 min from issue |
| consumed_at | DateTime(tz) nullable | set on verify |
| created_at | DateTime(tz) | |

### offers
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| code | String(30) unique indexed | e.g. DORITO20 |
| title | String(120) | display name |
| description | String(255) nullable | |
| discount_type | Enum('percent','flat') | |
| value | Numeric(10,2) | percent (1-100) or flat ₹ |
| min_order_amount | Numeric(10,2) default 0 | |
| max_discount | Numeric(10,2) nullable | cap for percent type |
| starts_at / ends_at | DateTime nullable | validity window |
| usage_limit | Integer nullable | total redemptions allowed |
| used_count | Integer default 0 | |
| is_active | Boolean default True | |
| created_at | DateTime(tz) | |

### notifications
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| user_id | FK → users.id | |
| title | String(120) | |
| body | String(300) | |
| type | String(20) | 'order', 'offer', 'info' |
| order_id | FK → orders.id nullable | |
| read_at | DateTime nullable | null = unread |
| created_at | DateTime(tz) | |

### whatsapp_outbox
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| phone | String(15) indexed | normalized 91XXXXXXXXXX |
| message | Text | full WA message body |
| kind | String(30) | otp / order_confirmed / out_for_delivery / delivered / delivery_otp / marketing |
| order_id | FK → orders.id nullable | |
| status | String(20) indexed | queued → sending → sent/failed/skipped |
| attempts | Integer default 0 | max 3 |
| error | String(300) nullable | |
| picked_at | DateTime nullable | |
| sent_at | DateTime nullable | |
| created_at | DateTime(tz) indexed | |

### marketing_logs
| column | type | notes |
|--------|------|-------|
| id | Integer PK | |
| user_id | FK → users.id nullable | |
| phone | String(15) | |
| kind | String(30) | reorder_7d / winback_14d |
| period_key | String(20) | ISO date or week key |
| created_at | DateTime(tz) | unique per phone+kind+period |

---

## 5. API DESIGN (all JSON, prefix `/api`)

### Auth — `/api/auth`
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | /register | public | customer signup {name, phone, password} |
| POST | /login | public | password login (staff) → {access_token, user} |
| POST | /otp/send | public | send 6-digit WhatsApp OTP → {sent, is_new_user} |
| POST | /otp/verify | public | verify OTP → JWT + user (auto-create customer if new, link guest orders) |
| GET | /me | any JWT | current profile |

### Menu — `/api/menu` (public read)
| Method | Path | Access |
|--------|------|--------|
| GET | /categories | public |
| GET | /items?category_id=&search= | public |
| GET | /items/:id | public |

### Orders — `/api/orders`
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | / | public (guest ok) | create order, server computes totals, sends WhatsApp confirmation |
| GET | /my | customer JWT | orders of logged-in user |
| GET | /:id/track | JWT or phone query | live tracking (JWT: owner only; phone: guest) |
| POST | /:id/otp/resend | public | resend delivery OTP on WhatsApp |

### Offers — `/api/offers`
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | / | public | active offers for checkout screen |

### Notifications — `/api/notifications`
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | / | JWT | user's notifications + unread count |
| POST | /read | JWT | mark all as read |

### Admin — `/api/admin` (manager only)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /dashboard | today's sales, order counts by status |
| GET | /dashboard/top-items | top 10 selling items |
| GET | /orders?status=&date= | all orders |
| PATCH | /orders/:id/assign {agent_id} | assign delivery agent |
| PATCH | /orders/:id/cancel | cancel (pre-delivery only) |
| GET/POST | /categories | list / add category |
| POST/PUT/DELETE | /menu-items[/:id] | menu CRUD + availability toggle |
| GET | /staff?role= | list staff |
| POST | /staff | create cook/delivery/manager accounts |
| PATCH | /staff/:id | activate/deactivate |
| GET | /offers | all offers (admin view) |
| POST | /offers | create offer |
| PUT | /offers/:id | update offer |
| DELETE | /offers/:id | delete offer |
| GET | /analytics | 7-day trends, category split, payment split, KPIs |
| POST | /broadcast | WhatsApp marketing to opted-in customers |
| GET | /whatsapp/status | Evolution API instance connection state |
| GET | /outbox | last 50 WhatsApp messages (audit) |

### Kitchen — `/api/kitchen` (cook/manager only)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /orders | queue: status ∈ {pending, preparing, ready} |
| PATCH | /orders/:id/status | pending→preparing→ready |

### Delivery — `/api/delivery` (delivery agent only)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /orders | my assigned: status ∈ {ready, out_for_delivery} |
| PATCH | /orders/:id/status | ready→out_for_delivery |
| PATCH | /orders/:id/deliver {otp} | out_for_delivery→delivered (requires 4-digit OTP) |

---

## 6. SEED DATA (extracted from actual menu card photo)

**6 categories, 34 items, exact prices:**

| Category | Items (₹) | Veg? |
|----------|-----------|------|
| **Pizza** | Veg Pizza 120, Veg Sweet Corn Pizza 130, Baby Corn Pizza 140, Chicken Pizza 150, Paneer Pizza 170, Chicken Extra Cheese Pizza 180, Dorito Special Pizza 180 | Veg, Veg, Veg, Non-veg, Veg, Non-veg, Non-veg |
| **Burger** | Veg Burger 50, Chicken Burger 70, Paneer Burger 90, Chicken Cheese Burger 100, Paneer Cheese Burger 110 | Veg, Non-veg, Veg, Non-veg, Veg |
| **Chicken Item** | Chicken Pakoda 120, Chicken Chilli 150, Butter Chicken 150, Chicken Fry 150, Chicken 65 150, Chicken Tikka 180, Roasted Chicken 400 | All Non-veg |
| **Cake and Pasty** | Vanilla Pudding 30, Chocolate Pudding 40, Pasty 40, 1 Pound Vanilla Cake 250, 1 Pound Chocolate Cake 250 | All Veg |
| **Coffee and Shake** | Coffee 20, Hot Chocolate Coffee 30, Cold Coffee 50, Banana Shake 50, Banana Shake 60 | All Veg |
| **Pasta and Roll** | Veg Roll 25, Veg Pasta 50, Chicken Roll 60, Paneer Roll 70, Chicken Pasta 100 | Veg, Veg, Non-veg, Veg, Non-veg |

> Note: Veg items get a 🟢 green badge; Non-veg items get a 🔴 red badge on the menu card.

**Seed users (staff login by phone):**
| Role | Phone | Password |
|------|-------|----------|
| manager | 6202965250 | Manager@123 |
| cook | 9939794303 | Cook@123 |
| delivery | 9000000001 | Agent@123 |
| customer (demo) | 9000000002 | Customer@123 |

---

## 7. DOCKER DEPLOYMENT (3 services)

1. **db** — postgres:16-alpine, healthcheck `pg_isready`, named volume `pgdata`.
2. **backend** — python:3.11-slim; waits for db health; on boot runs
   `python seed.py`; gunicorn on :5000.
3. **frontend** — multi-stage: node:20-alpine builds Vite bundle → nginx:alpine serves it,
   `nginx.conf` proxies `/api/` → `backend:5000` (single origin, no CORS pain in prod).

Dev mode: `docker compose up db` for database only; run Flask + Vite locally with hot reload.

---

## 8. BUILD MILESTONES

### v1.0 — Core Platform ✅ COMPLETE
- [x] M0 — Menu extraction from photo, this plan
- [x] M1 — Backend skeleton: factory, extensions, config, requirements, Dockerfile
- [x] M2 — SQLAlchemy models (users, categories, menu_items, orders, order_items)
- [x] M3 — Auth routes + JWT + role decorators
- [x] M4 — Menu, Orders, Admin, Kitchen, Delivery routes
- [x] M5 — seed.py with full menu + staff accounts
- [x] M6 — Frontend scaffold: Vite + Tailwind + router + axios + contexts
- [x] M7 — Customer app pages (menu, cart, checkout, tracking)
- [x] M8 — Manager / Kitchen / Delivery pages
- [x] M9 — docker-compose.yml + nginx + README, end-to-end validation

### v2.0 — Phase 2 ✅ COMPLETE
- [x] P2.1 — OTP-based Login (WhatsApp) with auto user creation + guest order linking
- [x] P2.2 — Evolution API integration (outbox pattern, anti-ban, 2.5s pacing, worker)
- [x] P2.3 — Delivery OTP (4-digit, WhatsApp, agent verification)
- [x] P2.4 — Offers / Discounts (admin CRUD, checkout validation, server-computed)
- [x] P2.5 — In-app notifications + Marketing automation (scheduler, broadcast)
- [x] P2.6 — Admin Analytics (7-day trends, category split, KPIs)
- [x] P2.7 — PWA (manifest + service worker + icons, installable)
- [x] P2.8 — UI upgrade (hero carousel, SVG menu images, branded favicon)
- [x] P2.9 — New DB objects (otp_codes, offers, notifications, whatsapp_outbox, marketing_logs)
- [x] P2.10 — All new API endpoints wired + tested

---

## 9. FUTURE ENHANCEMENTS (v3.0+)

### 9.1 Quick Wins (Phase 5.1) ✅ COMPLETE
- [x] Veg / Non-veg icon on every menu item card (`is_veg` column on `menu_items`)
- [x] Customer login tab as default on `/login` page
- [x] Mobile status bar theme-color meta tag (already set: `#e11d2e`)
- [x] Gallery images fix (actual kebab-case filenames)
- [x] Toggle switch for stock/unavailable in admin menu

### 9.2 Combo Packs (Phase 5.2) ✅ COMPLETE
- [x] ComboPack model (bundled items at discounted price)
- [x] Admin CRUD for combo packs
- [x] Combo section on menu page + server-side combo validation at checkout

### 9.3 Customer Addresses + Maps (Phase 5.3)
- [x] Saved delivery addresses (Address model, max 5 per user)
- [x] Address CRUD API + UI on checkout + account page
- [ ] Leaflet/OpenStreetMap pin-point address picker (free, no API key)
- [ ] Show delivery location on admin order detail

### 9.4 Legal Pages + Payment Gateway (Phase 5.4)
- [ ] Terms & Conditions page (`/terms`)
- [ ] Privacy Policy page (`/privacy`)
- [ ] Refund & Cancellation Policy page (`/refund`)
- [ ] Footer links to legal pages
- [ ] Razorpay integration (UPI + Cards) — replace manual UPI confirmation

### 9.5 Manager Accept/Reject Flow (Phase 5.5) ✅ COMPLETE
- [x] New order status: `accepted` between `pending` and `preparing`
- [x] Manager accept/reject endpoints with reject reason
- [x] Admin UI: Accept/Reject buttons on pending orders
- [x] Customer WhatsApp + in-app notification on accept/reject
- [x] Kitchen only sees `accepted` orders (not raw `pending`)

### 9.6 Larger Features
- [ ] Android APK via Capacitor (`frontend/android/`, `build_apk.sh`)
- [ ] WebSockets (Flask-SocketIO) instead of polling
- [ ] Item images upload (S3/local)
- [ ] Order printing / thermal KOT
- [ ] Multi-language (Hindi/English toggle)
- [ ] Customer feedback / rating system
- [ ] Push notifications (web push API)
- [ ] Loyalty / rewards points
