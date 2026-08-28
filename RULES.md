# 📏 Project Rules & Conventions - Dorito Pizza and Bakery

> Single source of truth for code style, file layout, git hygiene, and project-specific
> guard-rails. New code (human or AI) MUST follow this document; inconsistencies are
> treated as bugs and must be fixed before review.

---

## 1. Code Style Guidelines

### 1.1 Backend (Python / Flask)
- **Python 3.11+**, **4-space indentation** (PEP 8).
- **Naming:** `snake_case` for files / functions / variables, `PascalCase` for classes,
  `UPPER_SNAKE_CASE` for module-level constants.
- **Docstrings:** every module, class, and public function MUST have one.
- **Type hints:** Python 3.11+ syntax (`list[str]`, `dict[str, int]`, `X | None`).
- **Line length:** 88 (Black default). Wrap with parentheses, not backslashes.
- **Imports:** three groups, blank line between: standard library → third-party → local.
- **Exceptions:** always catch a **specific** exception type. No bare `except:`.
- **Logging:** use `current_app.logger` inside request context, `logging.getLogger(__name__)`
  in modules / workers.
- **No print statements** in production code — use `logger` or `current_app.logger`.

### 1.2 Frontend (React / JavaScript)
- **JSX**, **2-space indentation**, single quotes for strings.
- **Components:** functional + hooks only (no class components).
- **Naming:** `PascalCase` for components / files (`MenuItemCard.jsx`),
  `camelCase` for hooks / utilities (`useCart`, `formatPrice`).
- **Hooks order:** `useState` → `useEffect` → `useMemo` → `useCallback` → custom hooks.
- **State:** keep derived values out of state; compute in render or `useMemo`.
- **Effects:** always specify dependency array. No missing-deps warnings allowed.
- **No `console.log`** in committed code — use the logger / devtools.
- **Accessibility:** every `img` needs `alt`, every icon-only button needs `aria-label`.

### 1.3 Database / Migrations
- Every model change MUST come with a migration file in
  `backend/migrations/versions/`. Never edit the DB by hand in production.
- Column renames go in **two** migrations: add new + backfill + drop old.
- All FK columns must be **indexed**. All `phone` and `order_number` columns are `unique`.

---

## 2. File & Folder Naming

| Asset | Convention | Example |
|-------|------------|---------|
| Python module | `snake_case.py` | `order_service.py` |
| React page | `PascalCase.jsx` inside `pages/<role>/` | `MenuPage.jsx` |
| Reusable React | `PascalCase.jsx` in `components/` | `Navbar.jsx` |
| Hook | `useXxx.js` in `hooks/` (or co-located) | `useOrders.js` |
| API client method | `camelCase` verb-noun | `createOrder`, `getMyOrders` |
| DB model class | `PascalCase`, singular | `class Order`, `class OrderItem` |
| DB table | `snake_case`, plural | `orders`, `order_items` |
| Migration | timestamped slug | `2026_08_27_add_offer_tables.py` |
| Env var | `UPPER_SNAKE_CASE` | `EVOLUTION_API_KEY` |

---

## 3. API Design Rules

- **Prefix:** every endpoint under `/api`. No exceptions.
- **JSON only** request & response bodies. `Content-Type: application/json`.
- **HTTP verbs:** `GET` = read, `POST` = create, `PUT/PATCH` = update, `DELETE` = remove.
- **Status codes:** `200/201/204` success, `400/401/403/404/409/422/429` client errors,
  `500` server error (always logged with stack trace).
- **Error envelope:** `{ "error": "human_message", "code": "machine_code" }`.
- **Pagination:** list endpoints with >20 items MUST accept `?page=` & `?per_page=`.
- **Auth header:** `Authorization: Bearer <jwt>` for all protected routes.
- **Never trust the client** for prices, totals, discounts, status transitions, OTP
  verification, or role assignment. **Always recompute server-side.**

---

## 4. Git & Branching Workflow

- **Default branch:** `main` (always deployable). No direct commits.
- **Branch naming:** `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`.
- **Commits:** Conventional Commits. Subject ≤ 72 chars, imperative mood.
- **PRs:** MUST pass CI and require **1 approval** before merge. Squash-merge to `main`.
- **No secrets** in commits. `.env` is in `.gitignore`.
- **Migrations** in their own commit (no mixed feature+migration PRs).


---

## 5. Security Rules

1. **No secrets in source.** Pull from environment (`os.environ`, `python-dotenv`).
2. **No raw SQL.** Use SQLAlchemy ORM. Raw SQL only with parameterized `text()` and
   a code-review note explaining why.
3. **All user input validated server-side.** Treat client as hostile.
4. **Passwords:** hashed with `werkzeug.security.generate_password_hash` (pbkdf2:sha256).
   Never store plaintext, never email back, never log.
5. **OTPs:** hashed at rest with SHA-256 + per-row salt. Max 5 verify attempts, then
   the code is invalidated. 10-minute expiry. 60-second resend cooldown.
   Max 3 sends per phone per 10 minutes.
6. **JWT:** HS256, 30-day expiry, `JWT_SECRET_KEY` from env, rotated quarterly.
   `Authorization: Bearer ...` only — no cookies, no query-string tokens.
7. **CORS:** allow only the frontend origin(s) declared in `FRONTEND_ORIGINS`. No `*`
   in production.
8. **Rate limiting:** every public auth/OTP endpoint behind a limiter
   (3 per 10 min by default, configurable).
9. **Phone numbers:** normalize to E.164-ish `91XXXXXXXXXX` before storage. Strip
   spaces, dashes, parens. Reject if not 10 digits after country code.
10. **PII logs:** never log full phone numbers, OTPs, or addresses — mask them
    (`98****5432`, `****1234`).
11. **Dependencies:** `pip-audit` and `npm audit` in CI. High/Critical CVEs block merge.

---

## 6. Error Handling & Logging

- **Never swallow exceptions.** Catch → log with stack trace → re-raise or return 500.
- **User-facing messages** must be friendly and never leak internals
  ("Something went wrong on our side, please try again").
- **Server-side logs** must include: request id, method, path, user id (if any),
  status, latency, exception class & message.
- **5xx alerts** are sent to the on-call channel (see `docs/RUNBOOK.md` once added).
- **Worker logs** (`worker.py`, `scheduler.py`) rotate daily, keep 14 days.

---

## 7. Testing Rules

- **Every bug fix** ships with a regression test that fails before the fix and passes after.
- **Every new endpoint** ships with at least one happy-path + one auth-failure test.
- **Test pyramid:** 70% unit, 20% integration (route-level), 10% end-to-end (smoke).
- **Naming:** `test_<unit>_<scenario>_<expected>.py` → e.g. `test_create_order_missing_phone_400.py`.
- **Database:** tests use SQLite in-memory + `db.create_all()`. No shared state between tests.
- **No real WhatsApp calls in tests.** Mock `services.whatsapp.send_via_evolution` and
  assert on the outbox row instead.
- **Coverage gate:** PRs must not drop overall coverage below 70 %.

---

## 8. Documentation Rules

- **Every new feature** updates at least one of: `PRD.md`, `ARCHITECTURE.md`, `PHASE.md`,
  or adds a section to `RULES.md`.
- **Public APIs** must have a docstring + an entry in `PHASE.md` → "API inventory".
- **Migrations** must mention the change in the PR description and the
  `migrations/notes.md` if the change is non-trivial.
- **README** is the entry point — keep the quick-start ≤ 5 commands.

---

## 9. Performance & Reliability Budgets

| Metric | Budget |
|--------|--------|
| `GET /api/menu/items` p95 latency | < 250 ms |
| `POST /api/orders` p95 latency | < 600 ms (excludes WA send) |
| Page load (3G) | < 3 s |
| API error rate (5xx) | < 0.5 % of requests |
| WhatsApp outbox drain rate | ≥ 1 msg / 2.5 s sustained |
| Order polling interval (customer) | 5 s |
| Order polling interval (kitchen) | 4 s |

- Any change that breaches a budget MUST include a profiling note in the PR.
- Database queries touching `orders` MUST be index-supported (see `models/order.py`).

---

## 10. Deployment & Environment Rules

- **Three environments:** `development` (SQLite, local), `docker` (PostgreSQL in compose),
  `production` (PostgreSQL + nginx + gunicorn). Selected by `FLASK_ENV`.
- **Configuration:** `backend/config.py` reads from env; never hard-code secrets.
- **Database migrations** run automatically on backend container start (gunicorn
  `preload` hook). In dev, run `flask db upgrade` manually.
- **Worker & scheduler** run as **separate processes** (`python -m app.worker`,
  `python -m app.scheduler`). They share the DB but never the Flask request context.
- **Health check:** `/api/health` MUST return 200 with `{ "status": "ok", "db": "ok" }`
  if the DB is reachable, else 503. Used by Docker `HEALTHCHECK`.
- **Backups:** PostgreSQL volume `pgdata` is backed up daily. Restore is a documented
  runbook (TODO in v3.0).
- **Zero-downtime deploys** are NOT required at current scale. Restart policy
  `unless-stopped` is acceptable.


---

## 11. Frontend-Specific Rules

- **Routes** live in `App.jsx`. Each role has a prefix (`/admin`, `/kitchen`, `/delivery`).
- **Protected routes** use the `<RequireRole role="...">` wrapper from
  `components/RequireRole.jsx`.
- **API calls** go through `api/client.js` (the axios instance with JWT interceptor).
  Never instantiate axios in a component.
- **Polling** uses the `usePolling(callback, intervalMs)` hook — no raw `setInterval`
  in components (cleanup is easy to forget).
- **Loading & error states** are mandatory on every async surface. Use the
  `<Spinner />` and `<ErrorBanner />` shared components.
- **Tailwind:** only utility classes in JSX. No `@apply` blocks (keeps CSS surface small).
  Custom colors come from `tailwind.config.js` brand palette.
- **Images** in `public/images/menu/` are committed SVGs. No binary uploads to the repo.

---

## 12. WhatsApp / Evolution API Specific Rules

- **Never** call the Evolution API synchronously from a request handler. Always
  enqueue into `whatsapp_outbox` and let `worker.py` send.
- **Minimum send interval** is 2.5 s + random jitter (0–750 ms). Configurable in
  `services/whatsapp.py`.
- **Message templates** live in `services/whatsapp.py` as constants — never inline
  strings in routes.
- **Phone normalization** happens at the boundary (`utils/phone.py`); downstream
  code assumes E.164.
- **Marketing broadcasts** are capped at 200 messages per batch and 1 batch per
  30 minutes (enforced by `scheduler.py`).
- **Audit trail:** every send attempt writes a row to `whatsapp_outbox` with
  status `queued | sent | failed | rate_limited` and the response body (truncated).

---

## 13. Code Review Checklist

A PR is "ready to merge" only when all of these are ✅:

- [ ] CI is green (lint, type-check, tests).
- [ ] No new TODO/FIXME without a linked issue.
- [ ] No commented-out code (delete it; git remembers).
- [ ] No unrelated formatting / whitespace changes.
- [ ] New env vars documented in `backend/.env.example` AND `README.md`.
- [ ] New endpoints reflected in `PHASE.md` API table.
- [ ] Database changes have a migration and are backwards-compatible.
- [ ] At least one reviewer approved.
- [ ] Branch is up to date with `main`.

---

## 14. Anti-Patterns (Forbidden)

- ❌ Business logic inside Flask route handlers (move to `services/`).
- ❌ Computing money on the client.
- ❌ Storing OTPs / passwords in plain text.
- ❌ Using `localStorage` for sensitive PII beyond JWT (e.g. no passwords).
- ❌ Catching `Exception` and returning 200.
- ❌ Hard-coded URLs, ports, or secrets in source.
- ❌ Mixing migrations with feature code in one commit.
- ❌ Adding a dependency without an ADR (Architecture Decision Record) entry.
- ❌ Disabling tests to make CI green.
- ❌ Force-pushing to `main`.

