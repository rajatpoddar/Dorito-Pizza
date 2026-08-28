"""WhatsApp outbox worker — paced sender (ban-safe).

Run:  python -m app.worker
Picks queued messages and sends them via Evolution API with min interval + jitter.
"""
import logging
import time

from app import create_app
from app.models import WhatsAppOutbox
from app.services.whatsapp import process_outbox


_log = logging.getLogger("dorito.worker")


def main() -> None:
    app = create_app()
    _log.info("worker_started", extra={"pacing_s": app.config.get("WA_MIN_INTERVAL", 4.0)})
    while True:
        try:
            sent = process_outbox(app, batch_limit=20)
            if sent:
                _log.info("outbox_drain", extra={"sent": sent})
        except Exception as exc:  # noqa: BLE001
            _log.warning("worker_loop_error", exc_info=True, extra={"exc_class": type(exc).__name__})
        time.sleep(3)


if __name__ == "__main__":
    main()
