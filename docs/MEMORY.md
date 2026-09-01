# 🧠 Project Memory - Dorito Pizza and Bakery

> **Working memory** for AI agents and human contributors. Read this FIRST when
> picking up the project after a break. It captures the **why** behind non-obvious
> decisions, the **state of the world** today, and the **landmines** to avoid.

> ⚠️ This file is **opinionated and informal**. For the formal spec, see `PRD.md`,
> `ARCHITECTURE.md`, `RULES.md`, `PHASE.md`, `DESIGN.md`, `PLAN.md`.

**Last refreshed:** 2026-09-01 (Phase 5.9: notification flow hardened — every status transition fires WhatsApp + in-app + sound; manager activity feed + staff bell)

---

## 1. One-paragraph elevator pitch

Dorito is a 4-in-1 food-ordering platform for a single restaurant in Palojori,
Jharkhand. One Flask + PostgreSQL backend + one React SPA expose four role-specific
experiences: a customer ordering app with WhatsApp OTP login, a manager admin
panel, a kitchen display system, and a delivery agent app. The whole thing ships
in 3 Docker containers, runs in production on a small VPS, and is currently being
hardened with CI/CD and a UPI gateway.

---

## 2. The 30-second mental model

```
React SPA ──► /api/* (Flask 3 + SQLAlchemy)
                │
                ├── Postgres (prod) or SQLite (dev)
                │
                ├── worker.py  (polls whatsapp_outbox → Evolution API)
                └── scheduler.py (every 30 min 9-9 IST → reorder/winback)
```

- **All real-time = polling.** 5 s on customer, 4 s on kitchen, 5 s on delivery.
  No WebSockets. This is intentional and stable.
- **All money math = server-side.** Never trust the client.
- **All WhatsApp = outbox + worker.** Routes enqueue, worker drains at 2.5 s/msg.

---

## 3. Critical invariants (DO NOT BREAK)

1. **Order status flow is a single source of truth** — see `PLAN.md` §1. The DB
   enum and the JS `STATUS_FLOW` constant must stay in sync. New statuses are a
   schema migration + a PR touching both `models/order.py` and `constants.js`.
2. **Prices live in `menu_items.price` and are snapshotted into `order_items`
   at purchase time.** Never derive a historical price from current menu data.
3. **JWT secret** (`JWT_SECRET_KEY`) is the only thing standing between an
   attacker and every customer's order history. Rotate quarterly. Never commit.
4. **OTP codes are SHA-256 + salt at rest.** Raw codes are never stored.
5. **WhatsApp send rate is 2.5 s + jitter.** Going faster gets the shop's number
   banned by WhatsApp/Meta. This is non-negotiable.
6. **Server recomputes totals on every checkout.** The frontend's totals are
   display-only. If they disagree, the server wins.
7. **Guest orders (no JWT) get linked to the user on first OTP verify.** This is
   done in `auth.py` after `verifyOtp` succeeds. Don't refactor it away.
8. **Shop closed = NO new orders.** `ShopSettings.is_shop_open` is the master
   switch. `POST /api/orders` MUST return 503 + `closed: true` + the friendly
   `closed_message` when False. In-flight kitchen/delivery consoles keep
   working. Don't remove the gate when refactoring `routes/orders.py`.
9. **Service-worker cache must NEVER cache `/assets/hero/*`.** Those PNGs
   are the marketing slides the shop owner drops in place (same URL, new
   bytes). Cache-first for them is a real UX bug — first paint shows the
   new image, then the SW swaps in the cached old one. The list lives in
   `NEVER_CACHE_PREFIXES` in `public/sw.js`; add to it for any future
   "drop-in replacement" asset. The CACHE name is versioned
   (`'dorito-' + BUILD`); bump BUILD on every deploy to clear stale
   entries for existing users.
10. **Hero image priority = HERO_IMAGES > item.image_url, NOT the other way
    around.** The `/assets/menu/*.png` in `MenuItem.image_url` are the
    opaque item thumbnails for the menu grid; the `/assets/hero/*.png`
    are the curated marketing slides. If we honoured `item.image_url`
    first, every item that already had a DB photo would silently fall
    back to that opaque thumbnail and the new transparent hero slide
    would never show. See `heroImageFor()` in `src/constants.js`.
11. **OTP codes have a `purpose` (`login` or `phone_update`).** Codes
    are NOT interchangeable — a `login` OTP for `X` must not satisfy a
    `phone_update` request for `X` (and vice-versa). `OtpCode.issue()`
    and `OtpCode.verify()` both take `purpose`; the model indexes by
    `(phone, purpose, consumed_at)`. If you add a new OTP flow, give
    it its own `purpose` value, never reuse `login`.
12. **Manager must ACCEPT an order before it appears on the KDS.**
    The status flow is `pending → accepted → preparing → ready →
    out_for_delivery → delivered`. The kitchen only sees `accepted`+
    orders; `POST /api/admin/orders/:id/accept` is the gate. Manager
    can also `reject` a `pending` order with a `reason` (required) —
    that fires WhatsApp + in-app notif. Do NOT skip the accepted step
    in any new "fast path" — it is the demo's wow moment (customer
    sees their order go from "pending" to "accepted" in real time).
13. **Every status transition fires THREE channels in parallel.**
    `routes/admin.py` (accept/reject), `routes/kitchen.py` (advance),
    `routes/delivery.py` (start_delivery/deliver) all call BOTH
    `notify_svc.notify_order_event()` (customer in-app bell) AND
    `whatsapp.queue_message()` (outbox). Adding a new transition
    without firing both is a silent bug — the customer / staff console
    goes dark. Tests in `tests/integration/test_notification_flow.py`
    pin every transition.
14. **`notify_role(role, ...)` fans out to every ACTIVE user of that
    role, not just the actor.** Used so when a manager accepts an
    order, all cooks hear a beep; when kitchen marks ready, all
    delivery agents hear a beep. Returns the recipient count. Inactive
    users are skipped (deactivated staff don't get spammed).

---

## 4. Where things live (cheat sheet)

| Looking for… | Open this |
|--------------|-----------|
| API endpoint table | `PHASE.md` §8 |
| Order status enum | `models/order.py` + `frontend/src/constants.js` |
| Auth flow | `backend/app/routes/auth.py` + `frontend/src/context/AuthContext.jsx` |
| WhatsApp send logic | `backend/app/services/whatsapp.py` + `worker.py` |
| Outbox table | `models/whatsapp_outbox.py` |
| Marketing campaigns | `services/whatsapp.py` (templates + `validate_template`/`render_template`) + `scheduler.py` (timing) |
| Marketing opt-in UI | `frontend/src/pages/customer/AccountPage.jsx` + `PUT /api/auth/me/preferences` |
| Broadcast UI | `frontend/src/pages/admin/MarketingPage.jsx` (live template check + click-to-insert chips) |
| Shop open/closed | `ShopSettings.is_shop_open` + `closed_message`; `POST /api/orders` returns 503 when off; `ShopContext` polls `/api/settings` every 60 s |
| Menu seed data | `backend/seed.py` |
| Combo packs | `backend/app/models/combo_pack.py` + `frontend/src/components/ComboPackCard.jsx` |
| Saved addresses | `backend/app/models/address.py` + `backend/app/routes/addresses.py` + `frontend/src/pages/customer/AccountPage.jsx` + `CheckoutPage.jsx` |
| Manager accept/reject | `backend/app/routes/admin.py` (`/orders/:id/accept|reject`) + `frontend/src/pages/admin/ManageOrdersPage.jsx` |
| Profile update (name + phone) | `frontend/src/pages/customer/AccountPage.jsx` + `PUT /api/auth/me/profile` |
| Notification sounds | `frontend/public/sounds/*.mp3` + played by `ManageOrdersPage`, `KitchenDisplayPage`, `DeliveryPage` |
| Notification bell (customer + staff) | `frontend/src/components/NotificationBell.jsx` + `GET /api/notifications` |
| Manager activity feed | `GET /api/admin/dashboard/recent-activity` + dashboard's `📣 Live Activity` card |
| `notify_role()` fan-out | `backend/app/services/notify.py` (helper) — fires on accept (→ cooks) + ready (→ delivery) + delivered (→ manager) |
| Brand colors | `frontend/tailwind.config.js` |
| Customer pages | `frontend/src/pages/customer/` |
| Admin pages | `frontend/src/pages/admin/` |
| KDS page | `frontend/src/pages/kitchen/` |
| Delivery page | `frontend/src/pages/delivery/` |
| API base URL | `frontend/src/api/client.js` |
| Axios JWT interceptor | `frontend/src/api/client.js` |
| Deploy script | `deploy.sh` (one-command, auto `.env`, picks ports, builds) |


---

## 5. Environment variables (the full set)

Loaded by `python-dotenv` from `backend/.env` in dev, real env vars in Docker.

| Var | Default | Purpose |
|-----|---------|---------|
| `FLASK_ENV` | `development` | selects config class |
| `SECRET_KEY` | random | Flask session secret |
| `JWT_SECRET_KEY` | random | JWT signing key (**rotate quarterly**) |
| `DATABASE_URL` | sqlite:///../.local_dev.db | SQLAlchemy URI |
| `FRONTEND_ORIGINS` | `http://localhost:3000` | CORS allowlist (comma-separated) |
| `EVOLUTION_API_URL` | `http://localhost:8080` | Evolution API base URL |
| `EVOLUTION_API_KEY` | — | Evolution API instance key |
| `EVOLUTION_INSTANCE` | `dorito` | Evolution instance name |
| `SHOP_UPI_ID` | `dorito@upi` | shown on UPI payment screen |
| `WA_MIN_INTERVAL` | `2.5` | seconds between WA sends |
| `WA_JITTER_MS` | `750` | random jitter in ms |
| `OTP_TTL_SECONDS` | `600` | OTP validity |
| `OTP_MAX_ATTEMPTS` | `5` | wrong-OTP cap before invalidation |
| `OTP_RESEND_COOLDOWN` | `60` | seconds |
| `OTP_SEND_WINDOW` | `600` | seconds for rate-limit window |
| `OTP_SEND_MAX` | `3` | sends per window per phone |
| `MARKETING_BATCH_MAX` | `200` | max recipients per broadcast |
| `MARKETING_RUN_WINDOW` | `09:00-21:00` | IST active hours |
| `LOG_LEVEL` | `INFO` | root log level |

Any new env var MUST be added to `backend/.env.example` **and** documented in
`RULES.md` if it's security-sensitive.

---

## 6. Known quirks / landmines

- **Schema auto-heal** (`utils/schema_helpers.py`) silently `ALTER TABLE ADD COLUMN`
  on startup for SQLite dev. Don't be alarmed by migration-vs-runtime divergence in
  dev. Production uses real Alembic migrations and that path is NOT taken.
- **Polling storm risk:** if the user opens 5 tabs of `/track/:id`, the backend
  serves 5 × (1 / 5 s) = 1 req/s. Acceptable. Do NOT add per-component timers
  that aren't throttled.
- **All frontend polling goes through `usePolling`** (in
  `frontend/src/hooks/`). It auto-pauses when the tab is hidden and
  fires immediately on focus, so backgrounded tabs don't burn API
  calls. Raw `setInterval` in components is a bug — RULES.md §11. The
  one exception is `main.jsx`'s service-worker update tick, which is
  an app-level loop outside React.
- **Rate limiting is in-memory by default** (Flask-Limiter, P4.7).
  The bucket lives in the gunicorn worker process, so a multi-worker
  prod deploy needs `RATELIMIT_STORAGE_URI=redis://...` to share
  state — otherwise each worker has its own count and the effective
  limit is N × the configured value. The 5 protected endpoints and
  their per-IP quotas live in `app/utils/ratelimit.py`.
- **Coverage gate floor is 60%** as of 2026-08-28. The number lives
  in `pyproject.toml` under `[tool.coverage.report] fail_under`. Bump
  it up in lockstep with new tests, never down. The CI step is
  `pytest --cov=app --cov-report=xml --cov-branch --cov-fail-under=60`
  (the `--cov-fail-under` is read from pyproject, not the CLI).
- **Sentry is opt-in.** If `SENTRY_DSN` is empty (the default in dev
  and CI), the SDK is not loaded and there is zero network traffic
  to Sentry. Set the env var in your prod `.env` to start capturing.
  We strip request bodies (`max_request_body_size="never"`) and PII
  (`send_default_pii=False` + a `before_send` scrubber) per RULES §5.10
  so an OTP body can never accidentally end up in the Sentry feed.
- **Logs are JSON to stdout.** `app/utils/logging_config.py` installs
  a `JsonFormatter` on the root logger and a per-request middleware
  that stamps `flask.g.request_id` (echoed in the `X-Request-ID`
  response header). Every `app.logger.info("evt", extra={"foo": 1})`
  becomes one JSON line; `extra` keys matching `phone|otp|password`
  are redacted to `[REDACTED]`. The `worker.py` and `scheduler.py`
  loggers are named (`dorito.worker`, `dorito.scheduler`) so a log
  shipper can filter by them.
- **`marketing_logs` dedup** uses `unique(phone, kind, period_key)`. A bug at
  month boundary (B3 in `PHASE.md`) can double-fire the winback — keep an eye.
- **Worker process** (`python -m app.worker`) must run **separately** from
  gunicorn. If you put it in a request handler, the WA rate-limit breaks.
- **Scheduler** (`python -m app.scheduler`) is single-instance only. If you scale
  gunicorn to N workers, do NOT scale the scheduler the same way. It uses
  in-process locks to prevent double-runs.
- **PostgreSQL-specific:** the migration order is sensitive (FK constraints).
  Don't try to be clever with `--sql` mode in production. Just `flask db upgrade`.
- **CORS** is allowlist-based via `FRONTEND_ORIGINS`. `*` is rejected in prod.
- **JWT in localStorage** is the deliberate trade-off for stateless server + no
  cookie domain issues. The risk is XSS — see `RULES.md` §5.4. We mitigate with
  strict input handling and no `dangerouslySetInnerHTML`.
- **Time zone:** every datetime in the DB is **stored naive UTC** in dev (SQLite)
  and **TZ-aware UTC** in prod (Postgres). The frontend formats with
  `Intl.DateTimeFormat` in the user's locale. This is messy but works.

---

## 7. How to do common things

### 7.1 Add a new menu item
1. Add the row to `backend/seed.py` inside the appropriate category.
2. Run `python seed.py` (or just hit the admin menu UI which does the same
   thing via `POST /api/admin/menu-items`).
3. The new item appears on the customer menu within 5 s (next poll).

### 7.2 Add a new API endpoint
1. Add the route in `backend/app/routes/<role>.py`.
2. Use `@jwt_required()` + `@roles_required(...)` decorators.
3. Validate input with manual checks (no `flask-pydantic` yet).
4. Wrap business logic in a function in `services/` if >20 lines.
5. Add the row to `PHASE.md` §8 (API inventory).
6. Add a test in `backend/tests/`.

### 7.3 Add a new WhatsApp template
1. Open `backend/app/services/whatsapp.py`.
2. Add a function `render_<name>(ctx) -> str` and a `TEMPLATES` entry.
3. Enqueue from the relevant route with `outbox_queue(...)`.
4. Worker picks it up on the next drain.

### 7.4 Run the test suite
```bash
cd backend
source .venv/bin/activate
FLASK_CONFIG=test pytest tests/ -v        # full suite (29 unit + 32 integration + 1 e2e + 4 rate-limit, ~18.7 s)
FLASK_CONFIG=test pytest tests/ -m unit   # fast feedback only
FLASK_CONFIG=test pytest tests/ --cov=app # with coverage report
```
- Tests are split into `tests/unit/`, `tests/integration/`, `tests/e2e/`
  per RULES.md §7's pyramid. See `tests/README.md`.
- `tests/lifecycle_test.py` and `tests/phase2_test.py` are legacy
  scripts that the new tiers replaced — still runnable as
  `python tests/lifecycle_test.py` for backward compat, but excluded
  from pytest collection.
- Phone normalisation is tested in `tests/unit/test_phone_normalise.py`;
  always edit `app/utils/phone.py` rather than re-introducing inline
  copies in routes.
- Rate-limiter tests live in `tests/integration/test_rate_limiter.py`
  and build their own app with `RATELIMIT_ENABLED=True` so the rest
  of the suite can hammer endpoints without bleeding into the bucket.

### 7.5 Reset the dev database
```bash
rm -f .local_dev.db backend/.local_dev.db
cd backend && source .venv/bin/activate
DATABASE_URL="sqlite:////<project_root>/.local_dev.db" python seed.py
```
> **Note:** After adding new DB columns (like `is_veg`), you MUST delete the old
> `.local_dev.db` and re-seed. Schema auto-heal helps but a clean seed is safer.

### 7.6 Tail backend logs (Docker)
```bash
docker compose logs -f backend
```

### 7.7 Tail the outbox in the DB
```bash
docker compose exec db psql -U dorito -c \
  "SELECT id, phone, kind, status, created_at FROM whatsapp_outbox ORDER BY id DESC LIMIT 20;"
```


---

## 8. Recent decisions (and WHY)

| Date | Decision | Why |
|------|----------|-----|
| 2026-08-25 | Polling, not WebSockets | nginx + Docker already in place; zero new services |
| 2026-08-25 | Evolution API, not WhatsApp Cloud | existing setup; cheaper for low volume |
| 2026-08-25 | JWT in localStorage, not httpOnly cookie | stateless backend, no CSRF surface |
| 2026-08-25 | SQLAlchemy ORM, no raw SQL | safety > perf at this scale |
| 2026-08-25 | Single Docker compose, no k8s | shop is 1 server, 1 shop |
| 2026-08-26 | Tailwind, no CSS-in-JS | simpler build, smaller bundle, no runtime cost |
| 2026-08-27 | Server-computed money, always | never trust the client |
| 2026-08-27 | Worker + scheduler as separate procs | scale independently, no event-loop conflict |
| 2026-08-27 | Outbox pattern for WA | survives API downtime, audit trail, rate-limit |
| 2026-08-28 | This MEMORY.md file | to onboard new contributors / AI agents fast |
| 2026-08-31 | `is_veg` on MenuItem | Veg/non-veg badge on every menu card + admin |
| 2026-08-31 | Combo packs | `ComboPack` + `ComboPackItem` models; admin CRUD + customer menu section |
| 2026-09-01 | Manager accept/reject flow | `Order.STATUS_ACCEPTED` + `STATUS_REJECTED`; gates KDS so kitchen never sees raw `pending` |
| 2026-09-01 | Customer saved addresses | `Address` model (max 5/user, auto-default); full UI on Account page + checkout quick-select |
| 2026-09-01 | OTP `purpose` (login vs phone_update) | phone-update OTP is a separate code from login OTP; rate-limited separately |
| 2026-09-01 | Notification sounds | 9 mp3s in `public/sounds/` played on staff consoles for new orders, accept/reject, kitchen tickets, delivery updates |
| 2026-09-01 | `deploy.sh` rewrite | one-command VPS deploy: random `.env`, free-port detection, live build output, healthcheck wait |
| 2026-09-01 | Notification hardening | every status transition fires WhatsApp (`order_accepted`/`preparing`/`ready`/`order_rejected`/`delivered`) + in-app notif (`notify_role` fan-out to cooks/delivery) + sound on relevant console; manager dashboard got a Live Activity feed + WA outbox tail; NotificationBell in navbar for all roles |
| 2026-09-01 | Per-status sound on frontend | `ManageOrdersPage` now has 5 distinct sounds (new/accepted/rejected/ready/delivered) keyed off `prevStatusRef` so they fire only on the actual transition, not on every poll |

---

## 9. Things we explicitly chose NOT to do (and why)

- ❌ **Microservices** — overhead not justified at this scale.
- ❌ **GraphQL** — REST + JSON is enough, fewer tools, fewer bugs.
- ❌ **Redux / Zustand** — Context + localStorage is enough for our state size.
- ❌ **Next.js / SSR** — SPA + PWA is simpler and SEO is not a goal.
- ❌ **Server-Sent Events** — polling is fine at our volume.
- ❌ **Redis / Celery** — Postgres + a Python worker is enough until we hit
  > 100 orders/min. Then revisit.
- ❌ **Kubernetes** — Docker compose is sufficient.
- ❌ **A fancy ORM query builder** — SQLAlchemy 2.0 Core is already plenty.

---

## 9.5  Landmines (read this before changing auth / outbox code)

1. **`picked_at` is timezone-naive on SQLite** (driver returns naive) but
   `datetime.now(timezone.utc)` is aware. Subtracting them raises
   `can't subtract offset-naive and offset-aware datetimes` and **silently
   kills the worker loop** (only the print to stderr surfaces, easy to miss).
   Always normalise via `_as_aware(dt)` before any datetime math on
   `WhatsAppOutbox.picked_at`. (Found 28-Aug-2026 during outage.)
2. **Evolution API returns HTTP 500 with body `Connection Closed`** when the
   source WhatsApp number's session is dead/disconnected. The code can't
   recover from this — retrying just spams Evolution and could trigger
   WhatsApp's anti-ban throttling. Detect via
   `_is_retryable_error("connection closed")` and fail fast (skip retries).
3. **OTP rate limit must be per active window, not lifetime** — counting ALL
   codes for a phone (consumed, expired, failed) means after a few days the
   user gets locked out forever. Use a 10-min sliding window via
   `OtpCode.created_at >= now - OTP_EXPIRY_SECONDS`.
4. **Do not call `WhatsAppOutbox.query.get(id)`** — use
   `db.session.get(WhatsAppOutbox, id)` (SQLAlchemy 2.0 deprecates the old
   API and warns loudly on every call).
5. **Never `app.config[...]` without a default** in `services/whatsapp.py` —
   `EVOLUTION_API_KEY` is optional in dev (debug OTP path), so use `.get()`
   with a falsy default.
6. **The in-process worker (`__init__.py` background thread) is also started
   by `wsgi.py`** — if you launch Flask via `flask run` or gunicorn, you
   might get TWO workers. Prefer `python wsgi.py` for local dev.

---

## 10. Open questions for the team

1. **UPI vs COD ratio** — analytics shows ~95 % COD. Is the UPI integration
   (Razorpay) still worth building, or should we double down on COD UX?
2. **Should `/admin/menu` support image upload?** Today it's URL-only. The shop
   owner is currently uploading to Imgur. (Tracked as P5.4.)
3. **Push notifications (web push API)?** Useful for delivery agents when an
   order is assigned. (Tracked as P5.8.)
4. **Loyalty / rewards points?** Several customers asked. (Tracked as P5.9.)
5. **Multi-shop / franchise support?** Not on the roadmap; only relevant if the
   owner opens a second location. (Tracked as P5.10.)

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| **KDS** | Kitchen Display System (`/kitchen`) |
| **KOT** | Kitchen Order Ticket (printed slip) — not implemented, see P5.5 |
| **OTP** | One-Time Password (6-digit for login, 4-digit for delivery) |
| **E.164** | International phone format (`+CountryCodeNumber`) |
| **Outbox** | DB table of pending WhatsApp messages (`whatsapp_outbox`) |
| **Pacing** | The 2.5 s send interval we impose on the worker |
| **CMP** | Customer (role) |
| **MGR** | Manager (role) |
| **COOK** | Cook / kitchen staff (role) |
| **DLV** | Delivery agent (role) |
| **Desi UX** | Hinglish copy + Indian-rupee pricing + Indian phone normalization |
| **Snapshot price** | The price copied into `order_items.price` at checkout, so the |
|  | order total never changes if the menu later does |

---

## 12. Onboarding checklist (new contributor / AI agent)

When you first touch this project, do these in order:

1. Read `README.md` (5 min).
2. Read this `MEMORY.md` (5 min).
3. Read `PHASE.md` §0 + §10 to know what's done and what's next (5 min).
4. Skim `ARCHITECTURE.md` and `RULES.md` (10 min).
5. `git clone` → `./run_local.sh` → open `http://localhost:3000` (10 min).
6. Log in as the demo customer (`9000000002` / `Customer@123`) and place a
   test order end-to-end (5 min).
7. Open the manager panel (`/admin`, login `6202965250` / `Manager@123`) and
   assign yourself as the agent, then mark delivered (5 min).
8. Now you're ready to pick up a task from `PHASE.md` §4–§5.

If you skip steps 1–3 you'll waste hours rediscovering things this file exists
to prevent.

