"""Integration tests for the Flask-Limiter wiring (P4.7).

Per RULES.md §5.8: every public auth/OTP endpoint behind a limiter
(3 per 10 min by default). Here we assert that the decorators are
actually attached and that exceeding the bucket returns 429 + JSON.

The default test config (`TestConfig.RATELIMIT_ENABLED = False`)
disables the limiter so the rest of the suite can hammer endpoints
without bleeding across tests. THIS test re-enables it by building
a fresh app with the config flipped *before* `limiter.init_app` runs.
"""
import pytest

from app import create_app
from app.extensions import limiter
from config import TestConfig


@pytest.fixture
def app_with_limiter():
    """A fresh app with the rate limiter ENABLED.

    We build a custom TestConfig (subclass of TestConfig) that flips
    RATELIMIT_ENABLED on. Flask-Limiter reads this config the first
    time `init_app` is called; once enabled, it stays enabled for
    the lifetime of the limiter singleton, so we MUST use a fresh
    `create_app(...)` per test to avoid state bleed.
    """
    class _RatelimitOnTestConfig(TestConfig):
        RATELIMIT_ENABLED = True

    app = create_app(_RatelimitOnTestConfig)
    # Belt-and-braces: if the test ever re-uses the limiter singleton,
    # clear its storage so the bucket starts empty.
    if hasattr(limiter, "_storage") and limiter._storage:
        try:
            limiter._storage.reset()
        except Exception:  # noqa: BLE001
            pass
    yield app
    if hasattr(limiter, "_storage") and limiter._storage:
        try:
            limiter._storage.reset()
        except Exception:  # noqa: BLE001
            pass


@pytest.fixture
def rl_client(app_with_limiter):
    return app_with_limiter.test_client()


@pytest.mark.integration
class TestOtpSendLimiter:
    def test_first_three_succeeds_fourth_429(self, app_with_limiter, rl_client):
        # 3 sends are allowed (the policy is "3 per 10 minutes")
        for i in range(3):
            r = rl_client.post(
                "/api/auth/otp/send",
                json={"phone": f"98765{i:05d}"},  # unique per attempt
            )
            # The endpoint may return 200/201 on success or 400 (bad
            # phone) — either way, the limiter is what we care about,
            # not the route's payload validation.
            assert r.status_code in (200, 201, 400), r.get_json()
            assert r.status_code != 429, f"request {i+1} should not be limited"

        # 4th call must be 429
        r = rl_client.post(
            "/api/auth/otp/send",
            json={"phone": "9876599999"},
        )
        assert r.status_code == 429
        body = r.get_json()
        assert "error" in body
        assert "Too many" in body["error"] or "rate" in body["error"].lower()

    def test_429_response_is_json_not_html(self, app_with_limiter, rl_client):
        # Burn the bucket.
        for i in range(3):
            rl_client.post(
                "/api/auth/otp/send",
                json={"phone": f"98766{i:05d}"},
            )
        r = rl_client.post(
            "/api/auth/otp/send",
            json={"phone": "9876699999"},
        )
        assert r.status_code == 429
        # The handler in app/__init__.py returns jsonify(...) so the
        # body MUST be JSON, not the default Flask-Limiter HTML page.
        assert r.is_json
        assert r.get_json()["error"]


@pytest.mark.integration
class TestRegistrationLimiter:
    def test_register_5_allowed_6_blocked(self, app_with_limiter, rl_client):
        for i in range(5):
            r = rl_client.post(
                "/api/auth/register",
                json={
                    "name": f"User {i}",
                    "phone": f"98767{i:05d}",
                    "password": "Test@123",
                },
            )
            assert r.status_code in (201, 400, 409), r.get_json()
            assert r.status_code != 429
        r = rl_client.post(
            "/api/auth/register",
            json={"name": "Spammer", "phone": "9876799999", "password": "Test@123"},
        )
        assert r.status_code == 429


@pytest.mark.integration
class TestLoginLimiter:
    def test_login_10_allowed_11_blocked(self, app_with_limiter, rl_client):
        for i in range(10):
            r = rl_client.post(
                "/api/auth/login",
                json={"phone": f"98768{i:05d}", "password": "wrong"},
            )
            # We expect 401 (bad creds) for all 10 — the limiter lets
            # them through.
            assert r.status_code == 401, r.get_json()
        # 11th attempt should be 429.
        r = rl_client.post(
            "/api/auth/login",
            json={"phone": "9876899999", "password": "wrong"},
        )
        assert r.status_code == 429
