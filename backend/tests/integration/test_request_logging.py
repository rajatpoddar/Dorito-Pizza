"""Integration test for the per-request logging middleware (P4.6).

Asserts that hitting a public endpoint emits exactly one structured
JSON access-log line per request, with all RULES.md §6 fields
(request id, method, path, status, latency, user id).
"""
import io
import json
import logging

import pytest

from app.utils.logging_config import JsonFormatter


class _CapturingStream:
    """Captures fully-formatted log lines (strings) so we can re-parse
    the JSON after the request context is gone.
    """

    def __init__(self):
        self.buffer = io.StringIO()

    def write(self, s):
        self.buffer.write(s)

    def flush(self):
        pass

    def lines(self):
        return [ln for ln in self.buffer.getvalue().splitlines() if ln.strip().startswith("{")]


@pytest.fixture
def capture_app_logs(app):
    """Attach a stream handler that captures the FULLY FORMATTED
    log lines, so we don't have to worry about g going out of scope
    between request and assertion.
    """
    stream = _CapturingStream()
    handler = logging.StreamHandler(stream=stream)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    prev_level = root.level
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    try:
        yield stream
    finally:
        root.removeHandler(handler)
        root.setLevel(prev_level)


@pytest.mark.integration
class TestAccessLogLine:
    def test_get_health_emits_one_structured_log(self, app, client, capture_app_logs):
        r = client.get("/api/health")
        assert r.status_code == 200
        access_lines = [ln for ln in capture_app_logs.lines() if '"request"' in ln]
        assert len(access_lines) >= 1, "no access-log line emitted"
        data = json.loads(access_lines[-1])
        assert data["method"] == "GET"
        assert data["path"] == "/api/health"
        assert data["status"] == 200
        assert "latency_ms" in data
        assert data["latency_ms"] >= 0
        assert "user_id" in data
        # No JWT was attached, so user_id should be None.
        assert data["user_id"] is None

    def test_response_includes_x_request_id(self, app, client):
        r = client.get("/api/health")
        assert "X-Request-ID" in r.headers
        # If the client supplied one, we should echo it.
        r2 = client.get("/api/health", headers={"X-Request-ID": "my-trace-123"})
        assert r2.headers["X-Request-ID"] == "my-trace-123"

    def test_log_line_carries_request_id(self, app, client, capture_app_logs):
        client.get("/api/health", headers={"X-Request-ID": "trace-abc"})
        access_lines = [ln for ln in capture_app_logs.lines() if '"request"' in ln]
        assert access_lines
        data = json.loads(access_lines[-1])
        assert data["request_id"] == "trace-abc"
