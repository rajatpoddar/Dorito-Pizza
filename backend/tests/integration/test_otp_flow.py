"""Integration tests for the WhatsApp OTP login + signup flow.

Lives separately from `test_phase2_workflows.py` so the OTP surface
(which is the entry point for *every* customer) is its own focused
test file. Required by RULES.md §5.5 (OTP hashing, attempt cap,
resend cooldown) and §5.8 (the rate limiter added in P4.7 piggybacks
on the same endpoints).
"""
import pytest

from app.extensions import db
from app.models import OtpCode, User


def _send(client, phone):
    return client.post("/api/auth/otp/send", json={"phone": phone})


def _verify(client, phone, code, name=None):
    payload = {"phone": phone, "code": code}
    if name:
        payload["name"] = name
    return client.post("/api/auth/otp/verify", json=payload)


# ---- happy path -------------------------------------------------------------

@pytest.mark.integration
class TestOtpSend:
    def test_send_creates_otp_row(self, app, client):
        r = _send(client, "9876543210")
        assert r.status_code in (200, 201), r.get_json()
        body = r.get_json()
        # The dev/test path returns the code inline so the frontend
        # can render it. In prod with WA configured, `sent` is True
        # and `debug_otp` is None.
        assert body.get("sent") is True
        with app.app_context():
            row = OtpCode.query.filter_by(phone="9876543210").first()
            assert row is not None
            assert row.purpose == "login"
            assert row.consumed_at is None

    def test_send_normalises_phone_with_country_code(self, app, client):
        """+91 / 91 prefixes must be stripped before storage (RULES §5.9)."""
        r = _send(client, "+91 98765 43210")
        assert r.status_code in (200, 201)
        with app.app_context():
            assert OtpCode.query.filter_by(phone="9876543210").first() is not None

    def test_send_rejects_invalid_phone(self, app, client):
        r = _send(client, "12345")
        assert r.status_code == 400

    def test_send_enforces_resend_cooldown_at_model_level(self, app, client):
        """The route layer blocks with 429; here we assert the model
        contract that `OtpCode.issue` invalidates prior unconsumed
        rows for the same phone (RULES §5.5: only one live OTP per
        phone at a time).
        """
        from app.models import OtpCode as M
        with app.app_context():
            M.issue("9988776655", 600)
            first = M.query.filter_by(phone="9988776655").order_by(M.id.desc()).first()
            assert first is not None
            assert first.consumed_at is None
            M.issue("9988776655", 600)
            rows = M.query.filter_by(phone="9988776655").order_by(M.id.asc()).all()
            # First row should now be consumed by the second issue call.
            assert rows[0].consumed_at is not None
            assert rows[1].consumed_at is None


@pytest.mark.integration
class TestOtpVerify:
    def test_verify_with_wrong_code_returns_401(self, app, client):
        _send(client, "9876522222")
        r = _verify(client, "9876522222", "000000")
        assert r.status_code == 401

    def test_verify_with_short_code_returns_400(self, app, client):
        r = _verify(client, "9876533333", "123")
        assert r.status_code == 400

    def test_verify_attempts_are_capped(self, app, client):
        """RULES §5.5: max 5 verify attempts before the code is invalidated."""
        from app.models import OtpCode as M
        M.issue("9876555555", 600)
        # 5 wrong attempts
        for _ in range(5):
            r = _verify(client, "9876555555", "000000")
            assert r.status_code in (400, 401)
        # 6th attempt should be locked out (consumed_at set or attempts >= 5)
        r = _verify(client, "9876555555", "000000")
        assert r.status_code in (400, 401)
        with app.app_context():
            row = M.query.filter_by(phone="9876555555").order_by(M.id.desc()).first()
            assert row.attempts >= 5 or row.consumed_at is not None


