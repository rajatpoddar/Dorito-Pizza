# Migration notes

> **Schema evolution log** for the Dorito backend.
>
> Required by `RULES.md` §8: "Migrations must mention the change in the PR
> description and the `migrations/notes.md` if the change is non-trivial."
>
> **Two coexisting mechanisms** — be aware of which one you're touching:
>
> 1. **Auto-heal** in `app/utils/schema_helpers.py` (`REQUIRED_COLUMNS`).
>    Runs on every app boot. Adds a column with a safe default if it's
>    missing. Used for backwards-compatible additive changes (new
>    nullable columns, new tables the app seeds itself).
> 2. **Alembic** in `migrations/versions/`. Authoritative for anything
>    destructive (column rename, type change, NOT NULL without default,
>    backfill). The directory is intentionally empty today — every
>    schema change so far has been additive and handled by auto-heal.
>
> When you add a new column: prefer auto-heal if it's a plain nullable /
> defaulted column. Reach for Alembic the moment you need to drop,
> rename, change a type, or backfill data. If you do create an Alembic
> revision, append the entry below.

## Index

| Date | ID | Change | Mechanism | Author | Backwards-compatible |
|------|----|--------|-----------|--------|---------------------|
| 2026-08-28 | (none) | Initial schema for v1 + v2 (10 tables, 50+ endpoints) | `seed.py` + auto-heal | Dorito team | — |
| 2026-08-28 | SH-1 | `orders.delivery_otp VARCHAR(4)` for delivery verification | auto-heal | yes |
| 2026-08-28 | SH-2 | `orders.offer_id INTEGER` + `orders.offer_code VARCHAR(30)` + `orders.discount_amount NUMERIC(10,2) DEFAULT 0` for Phase 2 offers | auto-heal | yes |
| 2026-08-28 | SH-3 | `users.last_login_at TIMESTAMP` + `users.marketing_optin BOOLEAN DEFAULT 1` for Phase 3 marketing | auto-heal | yes |
| 2026-08-28 | SH-4 | `categories.image_url VARCHAR(255)` so the menu grid can show per-item artwork | auto-heal | yes |
| 2026-08-28 | SH-5 | `shop_settings.is_shop_open BOOLEAN DEFAULT 1` + `shop_settings.closed_message VARCHAR(255) DEFAULT 'Shop is currently closed…'` so the manager can flip a "closed" switch | auto-heal | yes |

## When to write an entry here

Add a one-line row above whenever you:

- Add a column (auto-heal or Alembic).
- Rename a column or table.
- Change a column type.
- Drop a column.
- Create an index that wasn't there before.
- Backfill any data in a migration.

The row only needs: date, short ID, the *what*, the *how*, and your
name (or a "yes/no" on backwards-compat). Long-form reasoning goes in
the PR description, not here.
