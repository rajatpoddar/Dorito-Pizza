"""Rate-limit policy — single source of truth (P4.7).

Per RULES.md §5.8: every public auth/OTP endpoint behind a limiter
(3 per 10 min by default, configurable). The decorators are applied
to the routes in `routes/auth.py` and `routes/orders.py`; this
module exists so the limits can be tuned in one place (and later
driven by env vars without grepping through the route handlers).

Limits are applied per client IP (key function in app/__init__.py).
Storage is in-memory; for multi-worker prod set RATELIMIT_STORAGE_URI
to a Redis URL so the counts are shared.
"""
from flask_limiter import Limiter

# Decorator factory: returns a decorator that applies the named limit
# using the shared `limiter` singleton from app.extensions. Using
# `Limiter.limit(...)` would also work, but the named constants below
# make grepping the policy painless.


# Standard buckets per RULES.md §5.8.
AUTH_OTP_SEND = "3 per 10 minutes"        # /api/auth/otp/send
AUTH_OTP_VERIFY = "10 per 10 minutes"     # /api/auth/otp/verify
AUTH_LOGIN = "10 per 10 minutes"          # /api/auth/login (password)
AUTH_REGISTER = "5 per 10 minutes"        # /api/auth/register
ORDERS_GUEST_CHECKOUT = "10 per 10 minutes"  # POST /api/orders (guest)


def limit(limiter: Limiter, policy: str):
    """Apply a named policy via the shared limiter singleton.

    Usage in a route file:

        from app.extensions import limiter
        from app.utils.ratelimit import limit, AUTH_LOGIN

        @bp.post("/login")
        @limit(limiter, AUTH_LOGIN)
        def login(): ...
    """
    return limiter.limit(policy)
