"""WhatsApp outbox worker — paced sender (ban-safe).

Run:  python -m app.worker
Picks queued messages and sends them via Evolution API with min interval + jitter.
"""
import time

from app import create_app
from app.models import WhatsAppOutbox
from app.services.whatsapp import process_outbox


def main() -> None:
    app = create_app()
    print("📮 WhatsApp worker started (outbox pacing on)…")
    while True:
        try:
            sent = process_outbox(app, batch_limit=20)
            if sent:
                print(f"   sent {sent} message(s)")
        except Exception as exc:  # noqa: BLE001
            print("   worker error:", exc)
        time.sleep(3)


if __name__ == "__main__":
    main()
