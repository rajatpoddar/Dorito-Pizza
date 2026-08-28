"""Dorito Pizza and Bakery — application factory."""
import logging
import os
import threading

from flask import Flask, jsonify

from config import get_config
from app.extensions import cors, db, jwt, migrate


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
            log.warning("worker boot probe failed: %s", exc)
        while True:
            try:
                with app.app_context():
                    process_outbox(app, batch_limit=10)
            except Exception as exc:  # noqa: BLE001
                log.warning("worker loop error: %s", exc)
            time.sleep(3)

    t = threading.Thread(target=_loop, name="wa-outbox-worker", daemon=True)
    t.start()
    app.logger.info("📮 in-process WhatsApp outbox worker started")
