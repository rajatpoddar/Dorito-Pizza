"""Pytest fixtures shared across the unit / integration / e2e suites.

Test pyramid (RULES.md §7):
- `tests/unit/`      → pure functions, no Flask, no DB. < 50 ms each.
- `tests/integration/`→ `app.test_client()` + in-memory SQLite. < 1 s each.
- `tests/e2e/`        → full lifecycle including the WhatsApp worker. < 30 s.

Select via marker, e.g. `pytest -m integration`. Default in pyproject.toml
is `-m unit` so a bare `pytest` only runs the fast suite; CI runs the
rest on PRs (`-m "not e2e"`) and the full suite on main.
"""
import os
import sys

import pytest

# Make `app` importable when pytest is run from the repo root (CI) or
# from `backend/` (dev) — same trick the existing scripts use.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKEND = os.path.dirname(_ROOT)
for p in (_BACKEND, _ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

# Force a deterministic config BEFORE any `from app import ...` so the
# import-time `create_app` calls inside other test files don't pick up
# the dev defaults.
os.environ.setdefault("FLASK_CONFIG", "test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-do-not-use-in-prod")
os.environ.setdefault("SECRET_KEY", "test-flask-secret-do-not-use-in-prod")
os.environ.setdefault("EVOLUTION_API_KEY", "")  # worker must skip, not call


@pytest.fixture
def app():
    """One Flask app per test, with a fresh in-memory SQLite schema.

    We deliberately use function scope (not session) for the app + DB.
    With an in-memory SQLite, sharing a connection across tests in
    different threads (gunicorn worker style) is fragile — and SQLAlchemy
    relationships can return detached instances once a context exits,
    which is a constant source of `DetachedInstanceError` in tests.
    Paying ~150 ms per test for a clean app is worth it.
    """
    from app import create_app
    from app.extensions import db

    app = create_app()
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def _clean_db(app):
    """Truncate every table at the start of every test.

    `app` is function-scoped so this is technically a no-op (the DB was
    just created), but we keep it as a belt-and-braces guard for the
    case where a future change makes `app` session-scoped again.
    """
    from app.extensions import db

    with app.app_context():
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()
    yield


@pytest.fixture
def client(app):
    return app.test_client()
