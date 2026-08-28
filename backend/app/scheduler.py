"""Marketing scheduler — automatic, history-based WhatsApp campaigns.

Run:  python -m app.scheduler
Every 30 min (only 09:00–21:00 IST):
  • reorder_7d  — customer whose last order was exactly 7 days ago
  • winback_14d — no order in 14–30 days (once per ISO week per user)
All sends are logged in marketing_logs (unique per phone+kind+period).
"""
import time
from datetime import datetime, timedelta, timezone

from app import create_app
from app.extensions import db
from app.models import MarketingLog, Order, User
from app.services.whatsapp import queue_message


def _ist_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)


def _utc_aware(dt: datetime) -> datetime:
    """SQLite may hand back naive datetimes — assume UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _last_order_by_phone():
    rows = (
        db.session.query(Order.customer_phone, db.func.max(Order.created_at))
        .filter(Order.status != Order.STATUS_CANCELLED)
        .group_by(Order.customer_phone)
        .all()
    )
    return {phone: _utc_aware(ts) for phone, ts in rows}


def run_campaigns(app) -> dict:
    now_ist = _ist_now()
    if not (app.config["MARKETING_WINDOW_START"] <= now_ist.hour < app.config["MARKETING_WINDOW_END"]):
        return {"skipped": "outside marketing window (09–21 IST)"}

    track = app.config.get("TRACK_BASE_URL", "")
    today = now_ist.date()
    week_key = f"{today.isocalendar().year}-W{today.isocalendar().week:02d}"
    day_key = today.isoformat()
    stats = {"reorder_7d": 0, "winback_14d": 0}

    last_orders = _last_order_by_phone()

    for phone, last_ts in last_orders.items():
        if not last_ts:
            continue
        user = User.query.filter_by(phone=phone).first()
        if user and (not user.is_active or not user.marketing_optin):
            continue
        days = (now_ist.date() - last_ts.astimezone(timezone.utc).date()).days

        # --- reorder nudge: exactly 7 days since last order ---
        if days == 7:
            msg = (
                "🍕 *Dorito Pizza and Bakery*\n\n"
                "Aapka favourite pizza/burger ek hafte se miss kar raha hai 😋\n"
                f"Aaj order karein: {track}\n\n"
                "📍 Jamtara Road, Palojori, Deoghar\n"
                "_Reply STOP to opt out_"
            )
            if _queue_once(user, phone, "reorder_7d", day_key, msg):
                stats["reorder_7d"] += 1

        # --- winback: 14–30 days silent, once per week ---
        elif 14 <= days <= 30:
            msg = (
                "🍕 *Dorito Pizza and Bakery*\n\n"
                f"Humne {days} din se aapko nahi dekha! 🥺\n"
                "Aaiye phir se maze karein — garam-garam pizza sirf ek call door.\n"
                f"Order karein: {track}\n\n"
                "📍 Jamtara Road, Palojori, Deoghar\n"
                "_Reply STOP to opt out_"
            )
            if _queue_once(user, phone, "winback_14d", week_key, msg):
                stats["winback_14d"] += 1

    return stats


def _queue_once(user, phone: str, kind: str, period_key: str, message: str) -> bool:
    """Queue a marketing message only if not already sent for this period."""
    exists = MarketingLog.query.filter_by(phone=phone, kind=kind, period_key=period_key).first()
    if exists:
        return False
    queue_message(phone, message, kind="marketing")
    db.session.add(MarketingLog(user_id=user.id if user else None, phone=phone,
                                kind=kind, period_key=period_key))
    db.session.commit()
    return True


def main() -> None:
    app = create_app()
    print("📣 Marketing scheduler started (every 30 min, 09–21 IST)…")
    while True:
        try:
            with app.app_context():
                stats = run_campaigns(app)
            if stats:
                print("   campaigns:", stats)
        except Exception as exc:  # noqa: BLE001
            print("   scheduler error:", exc)
        time.sleep(1800)


if __name__ == "__main__":
    main()
