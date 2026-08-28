"""Singleton extension instances (imported everywhere, initialised in factory)."""
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()

# Rate limiter (P4.7). Storage defaults to in-memory; the limits and
# key function are configured in app/__init__.py once we have the app
# object. See RULES.md §5.8 for the policy.
limiter = Limiter(
    key_func=lambda: "global",  # overridden in create_app per-endpoint
    default_limits=[],           # no global default — we opt in per route
)
