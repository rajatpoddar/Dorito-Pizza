#!/usr/bin/env python3
"""Idempotent schema patches for the Dorito DB.

Why this exists
---------------
The app uses `db.create_all()` which only creates *new* tables — it never
adds columns to existing ones. This script is the safety net for those
manual ALTERs and is safe to run multiple times (skips columns that
already exist).

Run with the same env as the backend:
    cd backend && ./.venv/bin/python ../scripts/migrate_db.py
"""
import os
import sys

# Allow running from repo root
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend")
sys.path.insert(0, BACKEND)

# Load backend/.env if present
env_path = os.path.join(BACKEND, ".env")
if os.path.exists(env_path):
    with open(env_path) as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402


# Each patch: (table, column_def) where column_def is a full
# "COLUMN_NAME TYPE ..." that SQLite understands.
PATCHES = [
    ("orders", "delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0"),
]


def has_column(table: str, column: str, conn) -> bool:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def main():
    app = create_app()
    with app.app_context():
        conn = db.session.connection().connection.dbapi_connection
        applied = 0
        for table, defn in PATCHES:
            col_name = defn.split()[0]
            if has_column(table, col_name, conn):
                print(f"   ↷  {table}.{col_name} already exists — skipping")
                continue
            sql = f"ALTER TABLE {table} ADD COLUMN {defn}"
            print(f"   +  {sql}")
            db.session.execute(db.text(sql))
            applied += 1
        if applied:
            db.session.commit()
            print(f"✅ Applied {applied} patch(es)")
        else:
            print("✅ Schema already up to date — nothing to do")


if __name__ == "__main__":
    main()
