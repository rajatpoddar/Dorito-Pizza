"""Lite auto-migration: add missing columns to existing tables on boot.

Keeps older local databases (e.g. .local_dev.db from v1) compatible with the
v2 schema without a full Alembic setup. Works on SQLite and PostgreSQL.
"""


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


# (table, column, ddl_sqlite, ddl_postgresql)
REQUIRED_COLUMNS = [
    ("orders", "delivery_otp", "VARCHAR(4)", "VARCHAR(4)"),
    ("orders", "offer_id", "INTEGER", "INTEGER"),
    ("orders", "offer_code", "VARCHAR(30)", "VARCHAR(30)"),
    ("orders", "discount_amount", "NUMERIC(10,2) DEFAULT 0", "NUMERIC(10,2) DEFAULT 0"),
    ("orders", "reject_reason", "VARCHAR(255)", "VARCHAR(255)"),
    ("users", "last_login_at", "TIMESTAMP", "TIMESTAMPTZ"),
    ("users", "marketing_optin", "BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE"),
    ("categories", "image_url", "VARCHAR(255)", "VARCHAR(255)"),
    ("menu_items", "is_veg", "BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE"),
    # Shop availability switch — when False, /api/orders POST returns 503.
    # Default TRUE so existing rows / fresh DBs continue accepting orders
    # until the manager explicitly closes the shop.
    ("shop_settings", "is_shop_open", "BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE"),
    (
        "shop_settings", "closed_message",
        "VARCHAR(255) DEFAULT 'Shop is currently closed. Please come back during business hours.'",
        "VARCHAR(255) DEFAULT 'Shop is currently closed. Please come back during business hours.'",
    ),
]


def ensure_schema(db) -> None:
    """Create missing columns listed in REQUIRED_COLUMNS (no-op otherwise)."""
    from sqlalchemy import inspect, text

    try:
        inspector = inspect(db.engine)
        existing_tables = set(inspector.get_table_names())
        is_sqlite = db.engine.dialect.name == "sqlite"

        for table, column, ddl_sqlite, ddl_pg in REQUIRED_COLUMNS:
            if table not in existing_tables:
                continue
            cols = {c["name"] for c in inspector.get_columns(table)}
            if column in cols:
                continue
            ddl = ddl_sqlite if is_sqlite else ddl_pg
            db.session.execute(
                text(f"ALTER TABLE {_quote_ident(table)} ADD COLUMN {_quote_ident(column)} {ddl}")
            )
        db.session.commit()
    except Exception:  # noqa: BLE001 — never block app boot on migration hiccups
        db.session.rollback()
