"""Structured JSON logging (P4.6).

Per RULES.md §6: server-side logs must include request id, method, path,
user id (if any), status, latency, exception class & message. We
emit each log line as a single-line JSON object so the log shipper
(Filebeat, Vector, etc.) can index it without regex gymnastics.

We do NOT replace Flask's default logger — we install a formatter
on the root + named loggers and a `before_request` / `after_request`
hook that attaches a request-id to `g` so every `app.logger` call
inside the request automatically carries the correlation id.
"""
from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from typing import Any

from flask import Flask, g, request


# Fields that should NEVER appear in a log line, even if a caller
# passes them via `extra=`. Defence in depth on top of
# app/utils/phone.py:mask_for_log.
REDACT_KEYS = {"phone", "password", "otp", "delivery_otp", "authorization", "cookie"}


class JsonFormatter(logging.Formatter):
    """Render every log record as a single-line JSON object.

    Always-on fields: timestamp, level, logger, message.
    Per-record fields: anything passed via `extra=...`.
    """

    STD_ATTRS = {
        "name", "msg", "args", "levelname", "levelno", "pathname",
        "filename", "module", "exc_info", "exc_text", "stack_info",
        "lineno", "funcName", "created", "msecs", "relativeCreated",
        "thread", "threadName", "processName", "process", "message",
        "asctime", "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in self.STD_ATTRS or key.startswith("_"):
                continue
            if key.lower() in REDACT_KEYS:
                payload[key] = "[REDACTED]"
            else:
                payload[key] = _safe(value)
        rid = getattr(g, "request_id", None) if _has_app_ctx() else None
        if rid:
            payload["request_id"] = rid
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def _safe(value: Any) -> Any:
    """Recursively redact dict keys that match REDACT_KEYS."""
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if k.lower() in REDACT_KEYS else _safe(v))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_safe(v) for v in value)
    return value


def _has_app_ctx() -> bool:
    try:
        from flask import has_app_context, has_request_context
        return has_app_context() and has_request_context()
    except Exception:  # noqa: BLE001
        return False


def install_json_logging(app: Flask, level: int = logging.INFO) -> None:
    """Install the JsonFormatter on the root + werkzeug loggers.

    Idempotent at the **root handler** level (we only install the
    JsonFormatter once per process). The per-request middleware is
    always installed on the given app — multiple test apps each get
    their own after_request hook.
    """
    root = logging.getLogger()
    if not any(
        isinstance(h.formatter, JsonFormatter)
        for h in root.handlers
        if h.formatter is not None
    ):
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.setFormatter(JsonFormatter())
        root.handlers = [handler]
        root.setLevel(level)
        logging.getLogger("werkzeug").setLevel(logging.WARNING)

    # Always wire the request middleware onto the new app. We tag
    # the app so we don't double-register if `create_app` is called
    # twice on the same instance.
    if not getattr(app, "_json_logging_installed", False):
        _install_request_middleware(app)
        app._json_logging_installed = True  # noqa: SLF001


def _install_request_middleware(app: Flask) -> None:
    """Attach request id, latency, user id to every log line emitted
    during the request, AND emit one structured access-log line per
    request.
    """

    @app.before_request
    def _start_timer_and_id():
        g.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        g.request_started_at = time.monotonic()

    @app.after_request
    def _emit_access_log(resp):
        try:
            latency_ms = int((time.monotonic() - g.request_started_at) * 1000)
        except Exception:  # noqa: BLE001
            latency_ms = -1
        try:
            from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
        except Exception:  # noqa: BLE001
            user_id = None

        app.logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.path,
                "status": resp.status_code,
                "latency_ms": latency_ms,
                "user_id": user_id,
                "remote_addr": request.remote_addr,
            },
        )
        resp.headers["X-Request-ID"] = g.request_id
        return resp

    @app.errorhandler(Exception)
    def _log_unhandled(exc):
        """Last-resort handler for anything that escaped a route's
        try/except. Per RULES.md §6: never swallow; log + return 500.
        """
        app.logger.exception("unhandled_exception", extra={"exc_class": type(exc).__name__})
        from flask import jsonify
        resp = jsonify(error="Something went wrong on our side. Please try again.")
        resp.status_code = 500
        return resp
