"""Unit tests for the Sentry integration (P4.5).

These don't actually talk to Sentry — they just assert that the
integration is opt-in and doesn't break the app when `SENTRY_DSN`
is empty (the default in dev / test / CI).
"""
import pytest

from app import create_app
from app.utils.sentry import _scrub_event, init_sentry


@pytest.mark.unit
class TestSentryOptIn:
    def test_init_without_dsn_is_noop(self):
        """The default case: SENTRY_DSN is empty, so init_sentry must
        not raise and must NOT register the Sentry SDK on the app.
        """
        import os
        os.environ.pop("SENTRY_DSN", None)
        app = create_app()
        # The sentinel we set in init_sentry must be absent.
        assert not app.extensions.get("sentry_initialized", False)

    def test_init_app_does_not_explode_with_dsn_set(self, monkeypatch):
        """If a (fake) DSN is set, init_sentry should not raise.

        We don't assert that the SDK is fully wired — that requires
        a real DSN and network. We just assert the call is safe.
        """
        # Use a syntactically-valid but unroutable DSN so the SDK
        # accepts the init but never actually talks to a server.
        monkeypatch.setenv("SENTRY_DSN", "https://public@example.com/1")
        app = create_app()
        # No exception → pass.
        assert True

    def test_scrub_event_strips_authorization_header(self):
        event = {
            "request": {
                "headers": {"Authorization": "Bearer abc.def.ghi", "User-Agent": "test"},
            }
        }
        out = _scrub_event(event, hint=None)
        assert out["request"]["headers"]["Authorization"] == "[REDACTED]"
        # Non-PII headers should pass through.
        assert out["request"]["headers"]["User-Agent"] == "test"

    def test_scrub_event_strips_otp_extras(self):
        event = {"extra": {"otp": "123456", "phone": "9876543210", "user_id": 7}}
        out = _scrub_event(event, hint=None)
        assert out["extra"]["otp"] == "[REDACTED]"
        assert out["extra"]["phone"] == "[REDACTED]"
        assert out["extra"]["user_id"] == 7

    def test_scrub_event_handles_missing_sections(self):
        """Belt-and-braces: don't crash on partial events."""
        # No request, no extra — should pass through.
        out = _scrub_event({"level": "error"}, hint=None)
        assert out["level"] == "error"
