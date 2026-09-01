# 🗺️ Implementation Phases & Status - Dorito Pizza and Bakery

> **Living document** tracking what has been shipped, what is in progress, and what
> remains for each release phase. Read alongside `PLAN.md` (the original plan) and
> `RULES.md` (conventions). Update this file at the end of every merge to `main`.

**Legend:** ✅ done · 🟡 in progress · ⏳ planned · ❌ blocked · 🚫 dropped

**Last updated:** 2026-09-01 (Phase 5.3b complete: maps integration — Leaflet picker + admin delivery pin)

---

## 0. Project Health Snapshot

| Area | State | Note |
|------|-------|------|
| Backend Flask API | ✅ stable | 60 endpoints across 11 blueprints |
| Frontend React SPA | ✅ stable | 4 role dashboards + 9 admin sub-pages |
| PostgreSQL schema | ✅ stable | Auto-heal helpers + `migrations/notes.md` |
| WhatsApp outbox | ✅ stable | Worker draining 1 msg / 2.5 s |
| PWA | ✅ installable | Manifest + service worker + 9 notification sounds |
| Docker compose | ✅ stable | db + backend + frontend (nginx) |
| Test coverage | ✅ gated | **99 pytest tests**, 65% line coverage, 60% floor enforced in CI |
| CI / CD | ✅ green | GitHub Actions: backend lint+test+coverage, frontend lint+build, compose smoke |
| Rate limiting | ✅ | Flask-Limiter: per-IP limits on all public auth/OTP endpoints + guest checkout |
| Error tracking | ✅ | Sentry SDK wired; only initialises when `SENTRY_DSN` is set (no-op in dev/test) |
| Structured logging | ✅ | JSON logs to stdout in production; `request_id` propagated via `flask.g` |
| Production deploy | ✅ | One-command `deploy.sh` (auto-generates `.env`, picks ports, builds, waits for health) |
| Docs | ✅ | Moved to `docs/` folder; API table complete in README |

---

## 1. Phase 0 — Project Discovery & Plan (M0) ✅ COMPLETE

| ID | Deliverable | Status |
|----|-------------|--------|
| M0.1 | Extract full menu from shop photo into `PLAN.md` | ✅ |
| M0.2 | Identify 4 user roles + status flow | ✅ |
| M0.3 | Pick tech stack (Flask + React + Postgres + Evolution) | ✅ |
| M0.4 | Folder layout, env strategy, deployment topology | ✅ |
| M0.5 | Author `README.md` and `PLAN.md` | ✅ |
| M0.6 | Author this `PHASE.md` tracker | ✅ |

**Evidence:** `PLAN.md` contains the verbatim 6-category × 34-item menu with prices;
`README.md` quick-start is one command (`./run_local.sh`); folder layout matches
`PLAN.md` §3 1-for-1.

---

## 2. Phase 1 — Core Platform (v1.0) ✅ COMPLETE

### 2.1 Backend skeleton

| ID | Deliverable | Status | File / Note |
|----|-------------|--------|-------------|
| M1.1 | Application factory + extensions | ✅ | `backend/app/__init__.py`, `extensions.py` |
| M1.2 | Dev / Docker / Test config classes | ✅ | `backend/config.py` |
| M1.3 | `requirements.txt` pinned | ✅ | Flask 3, SQLAlchemy, JWT-Extended, Migrate, CORS, psycopg2, requests, gunicorn, python-dotenv |
| M1.4 | `Dockerfile` (slim, non-root, gunicorn) | ✅ | `backend/Dockerfile` |
| M1.5 | `wsgi.py` entrypoint | ✅ | `backend/wsgi.py` |

### 2.2 Data models

| ID | Model | Status | Notes |
|----|-------|--------|-------|
| M2.1 | `User` (4 roles) | ✅ | `models/user.py` — phone unique, password hash, role enum |
| M2.2 | `Category` | ✅ | `models/category.py` — slug, image, sort order |
| M2.3 | `MenuItem` | ✅ | `models/menu_item.py` — price, availability, category FK |
| M2.4 | `Order` | ✅ | `models/order.py` — status enum, payment enum, delivery OTP, totals |
| M2.5 | `OrderItem` | ✅ | `models/order_item.py` — name/price snapshot at purchase time |
| M2.6 | Migrations (Alembic) | ✅ | `backend/migrations/versions/` |
| M2.7 | Schema auto-heal helpers | ✅ | `utils/schema_helpers.py` |

### 2.3 Auth & RBAC

| ID | Deliverable | Status | Endpoint |
|----|-------------|--------|----------|
| M3.1 | Password register / login | ✅ | `POST /api/auth/register`, `POST /api/auth/login` |
| M3.2 | JWT issuance + `@jwt_required` | ✅ | `utils/decorators.py` |
| M3.3 | `@roles_required(...)` decorator | ✅ | `utils/decorators.py` |
| M3.4 | `GET /api/auth/me` | ✅ | returns current user |

### 2.4 Domain routes

| ID | Module | Status | Endpoints |
|----|--------|--------|-----------|
| M4.1 | `routes/menu.py` | ✅ | `GET /api/menu/categories`, `GET /api/menu/items`, `GET /api/menu/items/:id` |
| M4.2 | `routes/orders.py` | ✅ | `POST /api/orders`, `GET /api/orders/my`, `GET /api/orders/:id/track` |
| M4.3 | `routes/admin.py` | ✅ | dashboard, orders list, category + menu CRUD, staff CRUD, assign / cancel |
| M4.4 | `routes/kitchen.py` | ✅ | `GET /api/kitchen/orders`, `PATCH /api/kitchen/orders/:id/status` |
| M4.5 | `routes/delivery.py` | ✅ | `GET /api/delivery/orders`, `PATCH /api/delivery/orders/:id/status` |

### 2.6 Frontend scaffold

| ID | Deliverable | Status |
|----|-------------|--------|
| M6.1 | Vite + React 18 + Tailwind v3 + React Router v6 | ✅ |
| M6.2 | `api/client.js` axios with JWT interceptor | ✅ |
| M6.3 | `AuthContext` + `CartContext` | ✅ |
| M6.4 | Role-aware routing in `App.jsx` | ✅ |

### 2.7 Customer app pages

| ID | Page | Status | File |
|----|------|--------|------|
| M7.1 | Menu (categories + items + search) | ✅ | `pages/customer/MenuPage.jsx` |
| M7.2 | Cart (qty adjust, remove, totals) | ✅ | `pages/customer/CartPage.jsx` |
| M7.3 | Checkout (address, payment, OTP gate) | ✅ | `pages/customer/CheckoutPage.jsx` |
| M7.4 | Order tracking (live polling 5 s) | ✅ | `pages/customer/TrackOrderPage.jsx` |
| M7.5 | My orders history | ✅ | `pages/customer/MyOrdersPage.jsx` |
| M7.6 | Login / Register | ✅ | `pages/customer/LoginPage.jsx`, `RegisterPage.jsx` |

### 2.8 Manager / Kitchen / Delivery pages

| ID | Page | Status | File |
|----|------|--------|------|
| M8.1 | Manager dashboard (KPIs) | ✅ | `pages/admin/DashboardPage.jsx` |
| M8.2 | Manage menu (CRUD) | ✅ | `pages/admin/ManageMenuPage.jsx` |
| M8.3 | Manage orders (assign / cancel / filter) | ✅ | `pages/admin/ManageOrdersPage.jsx` |
| M8.4 | Manage staff | ✅ | `pages/admin/ManageStaffPage.jsx` |
| M8.5 | Kitchen display (queue + advance) | ✅ | `pages/kitchen/KitchenDisplayPage.jsx` |
| M8.6 | Delivery agent (assigned + OTP) | ✅ | `pages/delivery/DeliveryPage.jsx` |

### 2.9 Deployment

| ID | Deliverable | Status |
|----|-------------|--------|
| M9.1 | `docker-compose.yml` (db + backend + frontend) | ✅ |
| M9.2 | `frontend/Dockerfile` (multi-stage node → nginx) | ✅ |
| M9.3 | `frontend/nginx.conf` (SPA fallback + `/api` proxy) | ✅ |
| M9.4 | `run_local.sh` (no-Docker quick start) | ✅ |
| M9.5 | `backend/.env.example` template | ✅ |

**Phase 1 exit criteria — all ✅.** Manual smoke-tested end-to-end on local SQLite
and Docker PostgreSQL.

---

## 3. Phase 2 — WhatsApp OTP, Offers, Notifications, Marketing, PWA (v2.0) ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P2.1 | OTP login via WhatsApp (Evolution API) | ✅ | `POST /api/auth/otp/send`, `POST /api/auth/otp/verify`; auto-creates customer; links guest orders |
| P2.2 | Evolution API integration (outbox + 2.5 s pacing) | ✅ | `services/whatsapp.py`, `worker.py`, `models/whatsapp_outbox.py` |
| P2.3 | Delivery OTP (4-digit, agent verifies) | ✅ | Generated on order create, sent via WA, verified in `delivery.py` |
| P2.4 | Offers / discounts (admin CRUD + server-compute) | ✅ | `models/offer.py`, `routes/offers.py`, `routes/admin.py` `/offers/*` |
| P2.5 | In-app notifications (bell, read/unread) | ✅ | `models/notification.py`, `routes/notifications.py`, `services/notify.py` |
| P2.6 | Admin analytics (7-day trends, KPIs) | ✅ | `GET /api/admin/analytics` |
| P2.7 | PWA (manifest + service worker + icons) | ✅ | `public/manifest.json`, `public/sw.js`, `public/icon-192.png`, `icon-512.png` |
| P2.8 | UI upgrade (hero carousel, SVG menu images, favicon) | ✅ | `components/HeroCarousel.jsx`, `public/images/menu/*.svg`, `public/favicon.svg` |
| P2.9 | New DB tables (`otp_codes`, `offers`, `notifications`, `whatsapp_outbox`, `marketing_logs`) | ✅ | in `models/` |
| P2.10 | All new API endpoints wired + tested | ✅ | see `PHASE.md` §6 below |

**Phase 2 evidence:** `backend/tests/phase2_test.py` runs green on local SQLite; manual
end-to-end: customer logs in via WhatsApp OTP, places order with a 10% off coupon,
receives confirmation message, manager assigns agent, agent verifies 4-digit OTP on
delivery — all flows work.

---

## 4. Phase 3 — Marketing Automation ✅ COMPLETE (100%)

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P3.1 | `scheduler.py` runs every 30 min 9am–9pm IST | ✅ | `app/scheduler.py` |
| P3.2 | Reorder nudge (7-day window, dedup via `marketing_logs`) | ✅ | `kind=reorder_7d` |
| P3.3 | Winback nudge (14-day inactive) | ✅ | `kind=winback_14d` |
| P3.4 | Manager broadcast endpoint (200 msg / batch cap) | ✅ | `POST /api/admin/broadcast` |
| P3.5 | WhatsApp status + outbox audit pages in admin | ✅ | `MarketingPage.jsx` |
| P3.6 | Opt-in / opt-out flag on `User` | ✅ | DB column + `PUT /api/auth/me/preferences` + `AccountPage.jsx` toggle |
| P3.7 | Template variable validation | ✅ | Whitelist `{{name}}/{{order_count}}/{{last_ordered_at}}`, 400 on unknown/malformed, per-recipient render in `broadcast` + `GET /admin/broadcast/vars` for UI hint |

**Blocker:** none. Both remaining items shipped.

**P3.6 detail:**
- `User.to_dict()` exposes `marketing_optin`
- `PUT /api/auth/me/preferences` accepts `{marketing_optin: bool}`, validates type, 400 on bad input
- New `pages/customer/AccountPage.jsx` shows profile + opt-in toggle + quick links
- `Navbar` shows "Account" link for logged-in customers (desktop + mobile drawer)
- Route `/account` guarded by `ProtectedRoute roles=['customer']`

**P3.7 detail:**
- `services/whatsapp.py`: `ALLOWED_TEMPLATE_VARS = ("name", "order_count", "last_ordered_at")`
- `validate_template(text)` raises `ValueError` for unknown / malformed `{{...}}`
- `render_template(text, ctx)` substitutes per-recipient context (name, order count, days since last order)
- `POST /api/admin/broadcast` validates title + message up front (clear 400, not silent send)
- `GET /api/admin/broadcast/vars` returns the whitelist for the frontend to render an inline click-to-insert hint
- `MarketingPage.jsx`: live template check (same 400 surfaced before Send), click-to-insert chips, Send button disabled when template is invalid

**Bonus fix shipped with P3.6:**
- `GET /api/auth/me` was missing `@jwt_required()` — anonymous callers hit a 500.
  Now returns 401 (tested). Tracked separately as a security item, not in original B1–B6 list.

**Shop Availability gate (unplanned but blocking for production):**
The shop used to accept orders 24×7 — including 3 AM when the kitchen is closed. Fixed
with a master switch on `ShopSettings`:
- `is_shop_open: bool` (default `True`) + `closed_message: str` (default friendly)
- Manager toggles from `/admin/settings` → big OPEN/CLOSED card with status badge
- `POST /api/orders` returns **HTTP 503** + `closed: true` + the custom message
  when the shop is closed. In-flight kitchen / delivery staff consoles are not
  affected — this only gates new orders.
- Public `GET /api/settings` exposes the flag + message so the SPA can render
  a red banner, disable the cart's "Proceed to Checkout" button, and disable
  the checkout's "Place Order" / "Verify & Place Order" buttons.
- `ShopContext` polls `/api/settings` every 60 s so the open/closed toggle is
  reflected on customer screens within a minute (without page reload). The
  server is still the source of truth — even an out-of-date tab can't slip
  an order past the 503 gate.
- Schema auto-heals via `utils/schema_helpers.REQUIRED_COLUMNS` — existing
  DBs pick up the new columns on next boot.


### 2.5 Seed data

| ID | Deliverable | Status |
|----|-------------|--------|
| M5.1 | `seed.py` populates 6 categories + 34 items | ✅ |
| M5.2 | Seed staff: manager / cook / delivery / demo customer | ✅ |
| M5.3 | Idempotent (safe to run twice) | ✅ |


---

## 5. Phase 4 — Hardening & Quality 🟡 IN PROGRESS (75%)

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P4.1 | GitHub Actions CI (lint + tests) | ✅ | `.github/workflows/ci.yml` — backend lint+test+coverage, frontend lint+build, compose smoke, pip-audit, npm audit |
| P4.2 | Pytest split: unit + integration + e2e | ✅ | `tests/{unit,integration,e2e}/` — 79 tests across 10 modules, 18.4 s end-to-end |
| P4.3 | Coverage report + 60% gate | ✅ | `pyproject.toml` `[tool.coverage.*]` — floor is 60% (current: 65%); ratchet up as you add tests, never down |
| P4.4 | `pre-commit` (black, isort, eslint, prettier) | ✅ | `.pre-commit-config.yaml` + `frontend/.eslintrc.cjs` + `frontend/.prettierrc.json` + `pyproject.toml` |
| P4.5 | Sentry / error tracking integration | ✅ | `sentry-sdk[flask]==2.18.0` wired in `app/utils/sentry.py`; opt-in via `SENTRY_DSN` env var; `max_request_body_size="never"` and `send_default_pii=False` per RULES §5.10; PII redaction belt-and-braces in `before_send` |
| P4.6 | Structured JSON logging | ✅ | `app/utils/logging_config.py` ships `JsonFormatter` + per-request middleware (request id, method, path, status, latency_ms, user_id); `app.logger.info("evt", extra={...})` is the call-site convention; `worker.py` + `scheduler.py` now use named loggers instead of `print()` |
| P4.7 | API rate-limiter middleware (flask-limiter) | ✅ | `Flask-Limiter` wired in `app/extensions.py` + `app/__init__.py`; policy in `app/utils/ratelimit.py`; per-IP limits on `/api/auth/otp/send` (3/10m), `/otp/verify` (10/10m), `/login` (10/10m), `/register` (5/10m), `POST /api/orders` (10/10m). Disabled in test config; re-enabled in `test_rate_limiter.py` to assert 429s. |
| P4.8 | Backups: daily `pg_dump` cron + restore runbook | ⏳ |  |
| P4.9 | Helm / k8s manifests (alternative to compose) | ⏳ |  |
| P4.10 | Bug fixes batch: cancel notification, JWT timedelta, OTP_DEBUG .get(), analytics N+1 | ✅ | 2026-08-31 |
| P4.11 | Docs reorganized to `docs/` folder | ✅ | 2026-08-31 |

**Why now?** Code is feature-complete; without CI/CD and proper test gates, regressions
can land unnoticed. This is the next **highest-leverage** work.

**Quick-wins batch (2026-08-28) — what landed:**
- `frontend/src/hooks/{usePolling,useCountdown}.js` — replaced 8 raw `setInterval` sites, fixed the B2 "duplicate interval" bug, made every polling screen auto-pause on hidden tabs and catch up on focus. This is the underlying fix for what B1 was trying to achieve.
- `backend/app/utils/phone.py` — single source of truth for the RULES.md §5.9 phone normalisation rule; now used by `auth.py` and unit-tested.
- `.github/workflows/ci.yml` — 3-job matrix (backend / frontend / compose-smoke), High/Critical CVE gate on both pip and npm, parallel runs, coverage report on every PR.
- `pyproject.toml` — black + isort + flake8 + pytest + coverage all read from one config file; `--strict-markers` so an undeclared marker is a hard failure; `--cov-fail-under=60` enforces the coverage floor.
- `backend/tests/conftest.py` + `backend/tests/README.md` — fixtures and tiering documented; legacy scripts (`lifecycle_test.py`, `phase2_test.py`) explicitly excluded from pytest collection; `app` fixture is function-scoped to dodge in-memory SQLite + detached-instance footguns.
- `backend/app/utils/ratelimit.py` + Flask-Limiter wiring — 5 endpoints limited per IP per RULES.md §5.8; 429 handler returns JSON with `Retry-After`; tests pin the policy in `test_rate_limiter.py`.
- `backend/app/utils/sentry.py` + `backend/app/utils/logging_config.py` — Sentry is opt-in (no DSN = no SDK), structured JSON logs with correlation id flow through `flask.g`, and the existing `print()` calls in `worker.py` / `scheduler.py` are now real `logger` calls. The `JsonFormatter` redacts any `phone`/`otp`/`password` keys before they reach stdout / Sentry.

---

## 6. Phase 5 — UX Polish + Production Readiness 🟡 IN PROGRESS (60%)

Priority order — quick wins first, then bigger features.

### 6.1 Quick Wins ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.1 | Veg / Non-veg icon on every menu item card | ✅ | `is_veg` boolean on `MenuItem` model; 🟢/🔴 badge on `MenuItemCard.jsx` + admin row + edit modal; seed.py tags all 34 items |
| P5.2 | Customer login tab as default on `/login` | ✅ | `LoginPage.jsx`: `useState('otp')` — customer OTP is the first tab |
| P5.3 | Mobile status bar color (PWA theme-color) | ✅ | Already set: `#e11d2e` in `index.html` + `manifest.json` |
| P5.4 | Gallery images fix (edit modal) | ✅ | `GALLERY_FILES` + `itemImage()` updated to use actual kebab-case filenames |
| P5.5 | Toggle switch for stock/unavailable | ✅ | `MenuRow` toggle switch replaces old button; better error handling |
| P5.6 | Image renames (coffee, strawberry→banana, tikka→65) | ✅ | Files already correctly named in `public/assets/menu/` |

### 6.2 Combo Packs ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.7 | `ComboPack` model (name, items, combo price, savings label) | ✅ | `ComboPack` + `ComboPackItem` models, admin CRUD endpoints |
| P5.8 | Combo packs displayed on menu page | ✅ | `ComboPackCard.jsx` + `MenuPage.jsx` section |
| P5.9 | Combo pack ordering (backend computes total from member items) | ✅ | Each item added to cart individually; server validates at checkout |

### 6.3 Customer Saved Addresses (1 day) ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.10 | `Address` model (user_id, label, full_address, lat, lng, is_default) | ✅ | `models/address.py` — max 5 per user, auto-default on first create |
| P5.11 | `GET/POST/PUT/DELETE /api/addresses` CRUD | ✅ | `routes/addresses.py` — auth-protected, owner-only update/delete, `PATCH /default` |
| P5.12 | Address picker on checkout + account page | ✅ | `AccountPage.jsx` full CRUD UI; `CheckoutPage.jsx` one-tap address select |

**Changes:**
- New `Address` model: `user_id`, `label`, `full_address`, `lat`, `lng`, `is_default`, timestamps
- `GET/POST /api/addresses`, `PUT/DELETE /api/addresses/:id`, `PATCH /api/addresses/:id/default`
- Max 5 addresses per customer; first address auto-set as default
- Delete default → promotes most recent remaining address
- Owner-only access (404 if trying to access another user's address)
- `AccountPage.jsx`: full address management section with add/edit/delete/set-default
- `CheckoutPage.jsx`: saved address quick-select above the address textarea
- 14 integration tests covering CRUD, max limit, default promotion, cross-user isolation, auth

### 6.4 Maps Integration (1–2 days) ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.13 | Map-based address picker (Leaflet + OpenStreetMap — free, no API key) | ✅ | `<AddressPicker>` component; pin drag/click → `/api/geocode/reverse` → autofill address textarea + lat/lng; integrated into `CheckoutPage` (toggle) + `AccountPage` (add/edit modal) |
| P5.14 | Show delivery location on admin order detail | ✅ | OSM iframe embed (no API key) on each order card in `ManageOrdersPage.jsx`; opens full OSM for directions on tap |

**Changes:**
- New `Order.delivery_lat` / `delivery_lng` columns (auto-heal on existing DBs via `schema_helpers.py`).
- New `Address.lat` / `Address.lng` columns (already existed from P5.10 — now used).
- `POST /api/orders` accepts optional `delivery_lat` / `delivery_lng` (coerced to `None` on garbage values for safety).
- New `GET /api/geocode/reverse?lat&lng` proxy endpoint with throttling (1 RPS, respects Nominatim usage policy) + 1 h in-process cache.
- New `<AddressPicker>` component (Leaflet + OSM tiles, custom DivIcon pin, debounced reverse-geocode).
- `CheckoutPage.jsx`: lazy map toggle under the address textarea; saved-address quick-select syncs the pin.
- `AccountPage.jsx`: map toggle in the add/edit address form; saves `lat`/`lng` on the address.
- `ManageOrdersPage.jsx`: OSM iframe embed + "Open full map" link per order (only when lat/lng present).
- 10 new integration tests covering geocode input validation, caching, error mapping, and order lat/lng round-trip (admin + customer).
- `frontend/package.json`: added `leaflet@^1.9.4` + `react-leaflet@^4.2.1`.

### 6.5 Legal Pages + Razorpay Prep (1–2 days)

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.15 | Terms & Conditions page (`/terms`) | ⏅ | Static page, linked from footer |
| P5.16 | Privacy Policy page (`/privacy`) | ⏅ | Static page, linked from footer |
| P5.17 | Refund & Cancellation Policy page (`/refund`) | ⏅ | Static page, linked from footer |
| P5.18 | Footer links updated to include legal pages | ⏳ | `Footer.jsx` |
| P5.19 | Razorpay integration (UPI + Cards) | ⏅ | Replace manual UPI with Razorpay checkout; `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` env vars; order creation flow |

### 6.6 Manager Accept/Reject Flow (2 days) ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.20 | New order status: `accepted` between `pending` and `preparing` | ✅ | `Order.STATUSES` enum updated + `STATUS_FLOW` in `constants.js` + schema auto-heal |
| P5.21 | `POST /api/admin/orders/:id/accept` endpoint | ✅ | Manager reviews → accepts → order moves to kitchen queue |
| P5.22 | `POST /api/admin/orders/:id/reject` endpoint with `reject_reason` | ✅ | Manager rejects → customer gets WhatsApp notification + in-app notif with reason |
| P5.23 | Admin ManageOrders UI: Accept / Reject buttons on pending orders | ✅ | Reject opens modal for reason input |
| P5.24 | Customer notification on accept/reject | ✅ | WhatsApp + in-app: "Order accepted 🎉" or "Order rejected: {reason} 😔" |
| P5.25 | Kitchen only sees `accepted` orders (not raw `pending`) | ✅ | `kitchen.py` query filter updated, ALLOWED transitions updated |

**New order lifecycle:** `pending → accepted → preparing → ready → out_for_delivery → delivered`

**Changes:**
- `Order` model: added `STATUS_ACCEPTED`, `STATUS_REJECTED`, `reject_reason` column
- `admin.py`: new `/accept` + `/reject` endpoints with validation
- `kitchen.py`: filters only `accepted` + `preparing` + `ready`; transitions from `accepted → preparing`
- `notify.py`: in-app notifications for `accepted` and `rejected` events
- `whatsapp.py`: new `order_accepted_message()` + `order_rejected_message()` templates
- `constants.js`: `STATUS_FLOW`, `STATUS_LABELS`, `STATUS_COLORS` updated with `accepted`/`rejected`
- `ManageOrdersPage.jsx`: Accept/Reject buttons on pending orders + reject reason modal
- `OrderStatusTracker.jsx`: handles `rejected` terminal state
- `TrackOrderPage.jsx`: shows rejection reason
- `schema_helpers.py`: auto-heals `reject_reason` column on existing DBs
- `test_full_lifecycle.py`: e2e test for accept flow + new `test_order_reject_flow`
- Dashboard `active_orders` count includes `accepted` status |

### 6.7 Production Hardening (ongoing)

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.26 | Daily `pg_dump` backup cron | ⏳ | P4.8 — needed before any real customer |
| P5.27 | Android APK via Capacitor | ⏳ | After Razorpay lands |
| P5.28 | HTTPS + domain setup docs | ⏳ | Runbook for production deploy |

### 6.8 Notification Sounds + Profile OTP Update ✅ COMPLETE

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.29 | 9 notification sounds (`public/sounds/01..09_*.mp3`) | ✅ | new_order, order_accepted, order_rejected, kitchen_new_order, customer_confirmed, driver_new_delivery, driver_pickup_ready, customer_out_for_delivery, order_delivered |
| P5.30 | `OtpCode.purpose` column (`login` / `phone_update`) | ✅ | Migration via auto-heal; old codes for one purpose don't affect the other |
| P5.31 | `POST /api/auth/otp/send-update` + `PUT /api/auth/me/profile` | ✅ | Phone update requires `purpose=phone_update` OTP; rate-limited (5/10 min) |
| P5.32 | `AccountPage.jsx` name + phone update flow | ✅ | "Send OTP → enter 6-digit → save"; name updates directly, phone gated |
| P5.33 | Sounds played on staff consoles (ManageOrders, KitchenDisplay, DeliveryPage) | ✅ | `useEffect` on poll → play matching mp3; throttled so rapid polls don't double-fire |

**Why this matters for the demo:** every status change the manager / cook / agent makes
produces a sound on the relevant console — the client *feels* the system working
without reading a single line of code. Combined with the manager accept/reject
flow (6.6) and saved addresses (6.3), the full ordering loop is exercised in
real time during a live demo.

### 6.9 Notification Flow Hardening ✅ COMPLETE

Audit found three systemic gaps: (a) the kitchen sound was wired to `status === 'pending'`
but the KDS endpoint only returns `accepted|preparing|ready` — the beep **never fired**;
(b) the WhatsApp outbox only had messages for `confirmed / accepted / rejected /
out_for_delivery / delivered` — kitchen progress (`preparing`, `ready`) was silent on
WhatsApp; (c) no notification bell in the navbar — the existing
`GET /api/notifications` endpoint had no frontend consumer.

| ID | Deliverable | Status | Notes |
|----|-------------|--------|-------|
| P5.34 | New outbox KINDs (`order_accepted`, `order_rejected`, `preparing`, `ready`) | ✅ | separates from `order_confirmed` so analytics can break down per transition |
| P5.35 | `whatsapp.preparing_message()` + `ready_message()` templates | ✅ | customer gets 2 more WhatsApp messages during the cooking phase |
| P5.36 | `notify_role(role, …)` helper — fan-out to every active user of a role | ✅ | cooks hear beep on accept, delivery agents hear beep on ready, manager hears beep on delivered |
| P5.37 | Fixed KitchenDisplayPage sound detection | ✅ | now keyed on `prevStatusRef`; plays on `accepted` (which KDS gets) + on `preparing → ready` (so cook knows to hand off) |
| P5.38 | Fixed DeliveryPage sound detection | ✅ | plays `new_delivery` on new assignment + `delivered` when order disappears from list |
| P5.39 | Fixed ManageOrdersPage sound `READY_AUDIO` bug | ✅ | was playing on **any** ready order every poll; now keyed off `prevStatusRef` so it fires once on the actual `preparing → ready` transition |
| P5.40 | NotificationBell component (`NotificationBell.jsx`) | ✅ | polls every 15s, badge with unread count, dropdown with last 10, mark-all-read on open; used in navbar for every role |
| P5.41 | Manager dashboard Live Activity feed | ✅ | `GET /api/admin/dashboard/recent-activity` returns last 20 in-app notifications + last 10 WA outbox rows; dashboard renders them as two cards with status pills + kind pills |
| P5.42 | TrackOrderPage status-change toast | ✅ | customer sees a coloured bouncing toast on every status transition (accepted / preparing / ready / out_for_delivery / delivered / rejected / cancelled) |
| P5.43 | Browser Notification API on kitchen + delivery | ✅ | was admin-only; now cook + driver also get native OS notifications on relevant transitions |
| P5.44 | E2E test `test_notification_flow.py` | ✅ | 3 tests — full happy path, reject flow, activity-feed endpoint — verify every transition fires both channels |
| P5.45 | `notify_role` unit tests | ✅ | 4 tests covering fan-out + inactive user skip + zero-recipients case + dashboard endpoint |

**New order-lifecycle wiring:**

```
pending  ──(manager accept)──► accepted
   │  WA: order_confirmed   │  WA: order_accepted
   │  Notif: customer       │  Notif: customer + role_fanout(cook)
   │  Sound: manager 🔔     │  Sound: manager + cook 🔔🔔
   │
   └──(manager reject)────► rejected
       WA: order_rejected
       Notif: customer (with reason)
       Sound: manager 🔔

accepted ──(cook start)──► preparing
   │  WA: preparing       │  WA: ready
   │  Notif: customer     │  Notif: customer + role_fanout(delivery)
   │  Sound: cook 👨‍🍳    │  Sound: cook + delivery 🛵

ready ──(driver start)──► out_for_delivery
   │  WA: out_for_delivery
   │  Notif: customer (with OTP)
   │  Sound: delivery 🛵

out_for_delivery ──(driver OTP)──► delivered
   │  WA: delivered
   │  Notif: customer + role_fanout(manager)
   │  Sound: manager + delivery 🎉
```


---

## 7. Open Bugs & Tech Debt 🟡

| ID | Description | Severity | Owner | Status |
|----|-------------|----------|-------|--------|
| B1 | Notification bell does not auto-refresh on tab focus | low | — | 🚫 deferred to v3.0 (P5.8 — bell UI does not exist yet; P4 usePolling hook already auto-pauses polling on hidden tabs and catches up on focus, which is the underlying fix for the data fetches that do exist) |
| B2 | `usePolling` hook duplicates `setInterval` calls if mounted twice | low | — | ✅ fixed by `frontend/src/hooks/usePolling.js` |
| B3 | `marketing_logs` period_key for winback can double-fire at month boundary | low | — | 🟡 investigating |
| B4 | `frontend/src/hooks/` directory does not exist yet (rule §11) | low | — | ✅ fixed — see `frontend/src/hooks/{usePolling,useCountdown,index}.js` |
| B5 | No `migrations/notes.md` exists (rule §8) | low | — | ✅ fixed — see `backend/migrations/notes.md` |
| B6 | `RULES.md` says "no `console.log`" but a few `console.error` calls remain in error boundaries | low | — | 🚫 not reproducible — `grep -rn "console\." frontend/src` returns zero hits. The `no-console: error` ESLint rule is now wired so any future regression is caught at lint time. |

---

## 8. API Inventory (current state)

> All endpoints below are LIVE in the codebase. Test status: ✅ covered by
> `tests/lifecycle_test.py` or `tests/phase2_test.py` · 🟡 partial · ⏳ no test yet.

### 8.1 Auth — `/api/auth`
| Method | Path | Access | Test |
|--------|------|--------|------|
| POST | /register | public | ✅ |
| POST | /login | public | ✅ |
| POST | /otp/send | public | ✅ |
| POST | /otp/verify | public | ✅ |
| GET | /me | JWT | ✅ |
| PUT | /me/preferences | JWT | ✅ |

### 8.2 Menu — `/api/menu`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | /categories | public | ✅ |
| GET | /items | public | ✅ |
| GET | /items/:id | public | ✅ |
| GET | /combo-packs | public | ✅ |

### 8.3 Orders — `/api/orders`
| Method | Path | Access | Test |
|--------|------|--------|------|
| POST | / | public | ✅ |
| GET | /my | customer JWT | ✅ |
| GET | /:id/track | JWT or phone | ✅ |
| POST | /:id/otp/resend | public | 🟡 |

### 8.4 Offers — `/api/offers`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | / | public | ✅ |

### 8.5 Notifications — `/api/notifications`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | / | JWT | 🟡 |
| POST | /read | JWT | 🟡 |

### 8.6 Admin — `/api/admin`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | /dashboard | manager | ✅ |
| GET | /dashboard/top-items | manager | ✅ |
| GET | /orders | manager | ✅ |
| PATCH | /orders/:id/assign | manager | ✅ |
| PATCH | /orders/:id/cancel | manager | ✅ |
| GET/POST | /categories | manager | 🟡 |
| POST/PUT/DELETE | /menu-items[/:id] | manager | ✅ |
| GET | /staff | manager | ✅ |
| POST | /staff | manager | ✅ |
| PATCH | /staff/:id | manager | ✅ |
| GET | /offers | manager | ✅ |
| POST/PUT/DELETE | /offers[/:id] | manager | ✅ |
| GET/POST | /combo-packs | manager | ✅ |
| PUT/DELETE | /combo-packs/:id | manager | ✅ |
| GET | /analytics | manager | 🟡 |
| GET | /broadcast/vars | manager | ✅ |
| POST | /broadcast | manager | ✅ |
| GET | /whatsapp/status | manager | 🟡 |
| GET | /outbox | manager | 🟡 |


### 8.7 Kitchen — `/api/kitchen`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | /orders | cook / manager | ✅ |
| PATCH | /orders/:id/status | cook / manager | ✅ |

### 8.8 Delivery — `/api/delivery`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | /orders | delivery / manager | ✅ |
| PATCH | /orders/:id/status | delivery / manager | ✅ |
| PATCH | /orders/:id/deliver | delivery / manager | ✅ |

### 8.9 Health — `/api`
| Method | Path | Access | Test |
|--------|------|--------|------|
| GET | /health | public | 🟡 |

---

## 9. Definition of Done (per phase)

A phase is "done" only when **all** of the following are true:

1. Every checkbox in that phase's section is ✅.
2. `pytest backend/tests/` is green locally.
3. `docker compose up --build` boots all 3 services healthy.
4. `README.md` quick-start works on a fresh clone (`./run_local.sh`).
5. `PHASE.md` (this file) is updated with the date and any newly-discovered gaps.
6. A short summary is posted in the team chat / changelog.

---

## 10. Suggested Next-Sprint Order

If you have one week of focused time, work in this order to maximize value:

1. **B3** Marketing winback boundary (½ day) — the one remaining open bug.
2. **P5.26** Daily `pg_dump` cron + restore runbook (½ day) — needed
   before any real customer goes live (was P4.8).
3. ~~**P5.13 + P5.14** Map-based address picker + delivery pin (1–2 days)~~ ✅ Done
4. **P5.19** Razorpay UPI (2 days) — the highest-impact v3.0 feature for
   a real shop (the current UPI option shows a manual QR code only).
5. **P5.27** Android APK via Capacitor (2 days) — once UPI lands, the
   APK is the delivery vehicle for repeat customers.

After that, the project is production-hardened and the remaining v3.0
work (legal pages, Hindi toggle, loyalty points, multi-shop) can be
prioritized by user demand.

---

## 11. Quick Stats (as of 2026-09-01)

| Metric | Value |
|--------|-------|
| Backend Python files | 42 (added `app/routes/geocode.py` for the Maps proxy) |
| Backend lines of code (excl. venv) | ~4 900 |
| Frontend JSX files | 29 (added `AddressPicker.jsx`) |
| Frontend JS files | 3 (`usePolling`, `useCountdown`, `index`) |
| Frontend lines of code (excl. node_modules) | ~4 600 |
| DB models | 14 (added `ComboPack`, `ComboPackItem`, `Address`) |
| API endpoints | **65** across 12 blueprints (added `/api/geocode/reverse`) |
| Background processes | 2 (worker, scheduler) |
| Docker services | 3 (db, backend, frontend) |
| Test functions | **109** (unit + integration + e2e), ~30 s on CI |
| Notification sounds | 9 (`/assets/sounds/01..09_*.mp3`) |
| Documentation files | 7 in `docs/` + README.md + tests/README.md + migrations/notes.md |

