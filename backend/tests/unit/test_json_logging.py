"""Unit tests for the structured JSON logging formatter (P4.6).

Pure-logic tests — no Flask app, no DB. They just feed records
through `JsonFormatter` and assert the output is valid JSON with
the right shape.
"""
import io
import json
import logging

import pytest

from app.utils.logging_config import JsonFormatter


def _make_logger(formatter: JsonFormatter) -> tuple[logging.Logger, io.StringIO]:
    """Build a logger that writes to an in-memory stream."""
    buf = io.StringIO()
    handler = logging.StreamHandler(stream=buf)
    handler.setFormatter(formatter)
    log = logging.getLogger(f"test.{id(buf)}")
    log.handlers = [handler]
    log.setLevel(logging.DEBUG)
    log.propagate = False
    return log, buf


@pytest.mark.unit
class TestJsonFormatter:
    def test_basic_record_is_valid_json(self):
        log, buf = _make_logger(JsonFormatter())
        log.info("hello world")
        line = buf.getvalue().strip()
        data = json.loads(line)
        assert data["message"] == "hello world"
        assert data["level"] == "INFO"
        assert "ts" in data
        assert data["logger"].startswith("test.")

    def test_extra_fields_are_included(self):
        log, buf = _make_logger(JsonFormatter())
        log.info("user_login", extra={"user_id": 42, "role": "manager"})
        data = json.loads(buf.getvalue().strip())
        assert data["user_id"] == 42
        assert data["role"] == "manager"

    def test_redacts_phone_password_otp_keys(self):
        log, buf = _make_logger(JsonFormatter())
        log.info(
            "otp_sent",
            extra={"phone": "9876543210", "password": "hunter2", "otp": "123456"},
        )
        data = json.loads(buf.getvalue().strip())
        assert data["phone"] == "[REDACTED]"
        assert data["password"] == "[REDACTED]"
        assert data["otp"] == "[REDACTED]"

    def test_redacts_nested_dict_keys(self):
        log, buf = _make_logger(JsonFormatter())
        log.info(
            "weird",
            extra={"user": {"name": "Alice", "phone": "9876543210", "id": 7}},
        )
        data = json.loads(buf.getvalue().strip())
        assert data["user"]["name"] == "Alice"
        assert data["user"]["phone"] == "[REDACTED]"
        assert data["user"]["id"] == 7

    def test_exception_includes_traceback_string(self):
        log, buf = _make_logger(JsonFormatter())
        try:
            raise ValueError("boom")
        except ValueError:
            log.exception("bad_thing")
        data = json.loads(buf.getvalue().strip())
        assert data["level"] == "ERROR"
        assert "ValueError" in data["exc"]
        assert "boom" in data["exc"]

    def test_non_json_serializable_extra_is_stringified(self):
        """Don't crash the request just because someone passed a
        non-JSON-serialisable object via `extra=`. We fall back to
        `str(value)`.
        """
        from datetime import datetime

        class Weird:
            def __repr__(self): return "<Weird>"

        log, buf = _make_logger(JsonFormatter())
        log.info("odd", extra={"when": datetime(2026, 8, 28), "obj": Weird()})
        # Must be valid JSON, even if the inner values are str()'d.
        data = json.loads(buf.getvalue().strip())
        assert "2026" in str(data["when"])
        assert "Weird" in str(data["obj"])
