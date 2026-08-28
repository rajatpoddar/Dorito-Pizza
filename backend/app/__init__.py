"""Dorito Pizza and Bakery — application factory."""
import logging
import os
import threading

from flask import Flask, jsonify, request

from config import get_config
from app.extensions import cors, db, jwt, limiter, migrate


def _rate_limit_key():
    """Key function for Flask-Limiter. Per RULES.md §5.8: rate limit
    public auth/OTP endpoints by client IP. `request.remote_addr` is
    the direct connection IP; in production behind nginx/Cloudflare
    we trust `X-Forwarded-For` (set `RATELIMIT_TRUSTED_HOSTS=1` in
    the env if behind a reverse proxy you control).
    """
    return request.remote_addr or "unknown"


def create_app(config_object=None):
    """Create and configure the Flask application."""
    app = Flask(__name__, static_folder=None)  # we serve /uploads manually
    app.config.from_object(config_object or get_config())

    # --- uploads: ensure folder exists, expose via /uploads/<path> ---
    upload_root = app.config.get("UPLOAD_FOLDER") or os.path.join(
        app.instance_path, "uploads"
    )
    os.makedirs(upload_root, exist_ok=True)
    app.config["UPLOAD_FOLDER"] = upload_root

    from flask import send_from_directory
    @app.route("/uploads/<path:filename>")
    def _serve_upload(filename):
        # Basic path-traversal guard: forbid ".." segments.
        if ".." in filename.split("/"):
            return jsonify(error="bad path"), 400
        return send_from_directory(upload_root, filename, max_age=3600)

    # --- initialise extensions ---
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    # Rate limiter (P4.7) — storage is in-memory; for a multi-worker
    # production deploy swap to Redis (set RATELIMIT_STORAGE_URI=redis://...).
    limiter.init_app(app)
    limiter._key_func = _rate_limit_key  # noqa: SLF001 — Limiter has no public setter

    # --- 429 handler — return JSON, not HTML ---
    @app.errorhandler(429)
    def _rate_limited(err):
        # flask-limiter attaches Retry-After automatically; preserve it.
        retry = err.description if hasattr(err, "description") else None
        resp = jsonify(error="Too many requests. Please slow down.", retry_after=retry)
        resp.status_code = 429
        return resp

    # --- Sentry (P4.5): only initializes when SENTRY_DSN is set ---
    from app.utils.sentry import init_sentry
    init_sentry(app)

    # --- Structured JSON logging (P4.6) — install BEFORE the routes
    #     so the per-request middleware is wired first. ---------------
    from app.utils.logging_config import install_json_logging
    install_json_logging(app)

    # --- import models so Flask-Migrate can see them ---
    from app import models  # noqa: F401

    with app.app_context():
        # create missing tables + add new columns (safe on existing DBs)
        db.create_all()
        from app.utils.schema_helpers import ensure_schema
        ensure_schema(db)

    # --- register blueprints ---
    from app.routes import register_blueprints
    register_blueprints(app)

    # --- health check (used by docker healthcheck) ---
    @app.route("/api/health")
    def health():
        wa_ok = bool(app.config.get("EVOLUTION_API_KEY"))
        return jsonify(
            status="ok",
            shop=app.config["SHOP_NAME"],
            whatsapp_configured=wa_ok,
        )

    # --- JWT error handlers (consistent JSON responses) ---
    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify(error="Authorization required", detail=reason), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify(error="Invalid token", detail=reason), 401

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return jsonify(error="Token has expired"), 401

    # --- Start the in-process WhatsApp worker (so OTPs actually deliver) ---
    # For dev/CI/single-process deploys this replaces the standalone
    # `python -m app.worker` command. In production with gunicorn workers
    # set DORITO_DISABLE_WORKER=1 on all but one worker, or use the
    # dedicated worker process for pacing control.
    if app.config.get("WORKER_ENABLED", True) and os.getenv("DORITO_DISABLE_WORKER", "0") != "1":
        _start_inprocess_worker(app)
        app.logger.info("inprocess_worker_started")

    return app


# ---------------------------------------------------------------- in-proc worker
_worker_lock = threading.Lock()
_worker_started = False


def _start_inprocess_worker(app: Flask) -> None:
    """Spin up a single daemon thread that drains the WhatsApp outbox.

    Threaded so we don't need a second command/process for the most common
    dev/single-VM deployment. Set DORITO_DISABLE_WORKER=1 to opt out (e.g.
    when running gunicorn with multiple workers — let one dedicated worker
    process own the outbox to avoid duplicate sends).
    """
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        _worker_started = True

    from app.services.whatsapp import process_outbox  # local import: avoid app not ready

    def _loop():
        import time
        log = logging.getLogger("dorito.worker")
        # one probe at boot so logs show the outcome immediately
        try:
            with app.app_context():
                process_outbox(app, batch_limit=5)
        except Exception as exc:  # noqa: BLE001
            log.warning("worker_boot_probe_failed", exc_info=True,
                        extra={"exc_class": type(exc).__name__})
        while True:
            try:
                with app.app_context():
                    process_outbox(app, batch_limit=10)
            except Exception as exc:  # noqa: BLE001
                log.warning("worker_loop_error", exc_info=True,
                            extra={"exc_class": type(exc).__name__})
            time.sleep(3)

    t = threading.Thread(target=_loop, name="wa-outbox-worker", daemon=True)
    t.start()
    app.logger.info("inprocess_worker_started", extra={"pacing_s": app.config.get("WA_MIN_INTERVAL", 4.0)})
