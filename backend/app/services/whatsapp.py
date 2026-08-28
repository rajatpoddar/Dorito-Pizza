"""WhatsApp messaging via Evolution API — ban-safe, outbox-based.

Messages are never sent inline from request handlers; they are queued in the
`whatsapp_outbox` table and a paced worker (app/worker.py) delivers them.
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
from datetime import datetime, timezone

from flask import current_app

from app.extensions import db
from app.models import Order, WhatsAppOutbox


# ----------------------------------------------------------------- helpers
def normalise_phone(raw: str) -> str:
    """To Evolution format: country code + number, digits only (91XXXXXXXXXX)."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "91" + digits
    elif digits.startswith("0") and len(digits) == 11:
        digits = "91" + digits[1:]
    return digits


def _post_json(url: str, payload: dict, api_key: str, timeout: int = 15):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Content-Type": "application/json", "apikey": api_key},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode() or "{}")


def _get_json(url: str, api_key: str, timeout: int = 10):
    req = urllib.request.Request(url, headers={"apikey": api_key})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode() or "{}")


# ----------------------------------------------------------------- queueing
def queue_message(phone: str, message: str, kind: str, order_id: int | None = None) -> WhatsAppOutbox:
    """Add a message to the outbox (sent by the worker with rate limiting)."""
    row = WhatsAppOutbox(
        phone=normalise_phone(phone),
        message=message.strip(),
        kind=kind,
        order_id=order_id,
    )
    db.session.add(row)
    db.session.commit()
    return row


def instance_status() -> dict:
    """Probe Evolution API instance connection state (for the manager panel)."""
    cfg = current_app.config
    api_key = cfg.get("EVOLUTION_API_KEY", "")
    if not api_key:
        return {"connected": False, "reason": "EVOLUTION_API_KEY not configured"}
    url = f"{cfg['EVOLUTION_API_URL']}/instance/connectionState/{cfg['EVOLUTION_INSTANCE']}"
    try:
        _, data = _get_json(url, api_key)
        state = (data.get("instance") or {}).get("state", "unknown")
        return {"connected": state == "open", "state": state}
    except Exception as exc:  # noqa: BLE001
        return {"connected": False, "reason": str(exc)[:200]}


# ----------------------------------------------------------------- sending
# Max attempts before giving up. After this, the row is marked failed and
# the user must request a new OTP. Bounded to avoid hammering Evolution
# (and getting the WhatsApp number rate-limited or banned).
MAX_DELIVERY_ATTEMPTS = 3


def _is_retryable_error(exc_msg: str) -> bool:
    """Some failures (HTTP 5xx, connection drops) are worth retrying. Others
    (HTTP 400, "Connection Closed" on every retry) signal the WhatsApp
    session is dead — retrying just spams Evolution. Only retry transient
    errors. Permanent ones fail fast."""
    low = exc_msg.lower()
    # permanent: phone disconnected from WhatsApp, invalid number, auth issue
    permanent_markers = (
        "connection closed",
        "forbidden",
        "unauthorized",
        "not found",
        "invalid number",
        "phone not registered",
    )
    return not any(m in low for m in permanent_markers)


def send_one(row: WhatsAppOutbox) -> bool:
    """Attempt to send a single outbox row. Returns True when sent."""
    cfg = current_app.config
    api_key = cfg.get("EVOLUTION_API_KEY", "")
    if not api_key:
        row.mark(WhatsAppOutbox.STATUS_SKIPPED, "EVOLUTION_API_KEY not configured")
        db.session.commit()
        return False

    # Hard cap: don't hammer Evolution forever. After MAX_DELIVERY_ATTEMPTS
    # we mark as failed and stop trying — protects against ban.
    if row.attempts >= MAX_DELIVERY_ATTEMPTS:
        row.status = WhatsAppOutbox.STATUS_FAILED
        if not row.error:
            row.error = f"max {MAX_DELIVERY_ATTEMPTS} delivery attempts reached"
        db.session.commit()
        return False

    url = f"{cfg['EVOLUTION_API_URL']}/message/sendText/{cfg['EVOLUTION_INSTANCE']}"
    row.status = WhatsAppOutbox.STATUS_SENDING
    row.picked_at = datetime.now(timezone.utc)
    row.attempts += 1
    db.session.commit()
    try:
        _post_json(url, {"number": row.phone, "text": row.message}, api_key)
        row.mark(WhatsAppOutbox.STATUS_SENT)
        db.session.commit()
        return True
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)[:290]
        row.error = msg
        # Decide: retry or fail-fast
        permanent = not _is_retryable_error(msg)
        if row.attempts >= MAX_DELIVERY_ATTEMPTS or permanent:
            row.status = WhatsAppOutbox.STATUS_FAILED
            if permanent:
                # mark attempts to max so we don't re-queue on next pass
                row.attempts = MAX_DELIVERY_ATTEMPTS
        else:
            row.status = WhatsAppOutbox.STATUS_QUEUED
        db.session.commit()
        return False


def _as_aware(dt):
    """SQLite returns naive datetimes; MySQL/Postgres return aware ones.
    Normalise so we can safely subtract from datetime.now(timezone.utc)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def process_outbox(app, batch_limit: int = 25) -> int:
    """Send queued messages with pacing + anti-ban backoff.

    Backoff schedule between attempts of the same row:
      attempt 1 → wait 30s before attempt 2
      attempt 2 → wait 2 min before attempt 3
      attempt 3 → permanent fail (no more retries)

    The WA worker loop sleeps only 3s, so most passes will see the row
    still in `picked_at` cooldown and skip it naturally.
    """
    import random

    sent = 0
    with app.app_context():
        now = datetime.now(timezone.utc)
        # Backoff windows (seconds) for attempts 1→2, 2→3
        BACKOFF = (30, 120)

        # rescue rows stuck in `sending` for >5 min (e.g. after a crash)
        stuck_cutoff = now.timestamp() - 300
        stuck = (
            WhatsAppOutbox.query.filter(WhatsAppOutbox.status == WhatsAppOutbox.STATUS_SENDING)
            .all()
        )
        for row in stuck:
            picked = _as_aware(row.picked_at)
            if picked and picked.timestamp() < stuck_cutoff:
                row.status = WhatsAppOutbox.STATUS_QUEUED
        db.session.commit()

        # Pull queued rows that are past their backoff window.
        # MySQL/SQLite portable: fetch all queued (cheap, small table) and
        # filter in Python — avoids SQL dialect differences for datetime math.
        rows = (
            WhatsAppOutbox.query.filter(WhatsAppOutbox.status == WhatsAppOutbox.STATUS_QUEUED)
            .order_by(WhatsAppOutbox.id)
            .limit(batch_limit)
            .all()
        )
        eligible = []
        for row in rows:
            if row.attempts == 0 or row.picked_at is None:
                eligible.append(row)
                continue
            picked = _as_aware(row.picked_at)
            wait_idx = min(row.attempts - 1, len(BACKOFF) - 1)
            wait_secs = BACKOFF[wait_idx]
            elapsed = (now - picked).total_seconds()
            if elapsed >= wait_secs:
                eligible.append(row)
            # else: still in cooldown, leave it queued, will be picked next pass

        if not eligible:
            return 0

        min_interval = float(app.config.get("WA_MIN_INTERVAL", 2.5))
        for i, row in enumerate(eligible):
            if i:
                time.sleep(min_interval + random.uniform(0, 1.2))  # pacing + jitter
            if send_one(row):
                sent += 1
    return sent


# ----------------------------------------------------------------- templates
def _shop_footer() -> str:
    cfg = current_app.config
    return f"📍 {cfg['SHOP_ADDRESS']}"


def otp_message(code: str) -> str:
    return (
        "🍕 *Dorito Pizza and Bakery*\n\n"
        f"Aapka login OTP: *{code}*\n"
        "⏳ 10 minute valid hai. Kisi se share na karein.\n\n"
        f"{_shop_footer()}"
    )


def order_confirmed_message(order: Order) -> str:
    cfg = current_app.config
    lines = "\n".join(f"• {i.item_name} × {i.quantity}" for i in order.items)
    pay = "Cash on Delivery" if order.payment_mode == "cod" else "UPI"
    discount = float(order.discount_amount or 0)
    track = f"{cfg.get('TRACK_BASE_URL', '')}/track/{order.id}?phone={order.customer_phone}"
    msg = (
        "🍕 *Dorito Pizza and Bakery*\n\n"
        "✅ Order confirm ho gaya! 🎉\n"
        f"🧾 Order: *{order.order_number}*\n{lines}\n"
        + (f"Discount: -₹{discount:.0f}\n" if discount else "")
        + f"💰 Total: ₹{float(order.total_amount):.0f} ({pay})\n\n"
        f"🛵 *Delivery OTP: {order.delivery_otp}*\n"
        "Delivery ke time ye OTP driver ko dikhayein.\n\n"
        f"🔎 Track karein: {track}\n"
        f"{_shop_footer()}"
    )
    return msg


def out_for_delivery_message(order: Order) -> str:
    return (
        "🍕 *Dorito Pizza and Bakery*\n\n"
        f"🛵 Aapka order *{order.order_number}* nikal chuka hai!\n"
        f"Driver jaldi pahunchega. OTP ready rakhein: *{order.delivery_otp}*\n\n"
        f"{_shop_footer()}"
    )


def delivered_message(order: Order) -> str:
    cfg = current_app.config
    pay = "Cash" if order.payment_mode == "cod" else "UPI"
    track = f"{cfg.get('TRACK_BASE_URL', '')}/"
    return (
        "🍕 *Dorito Pizza and Bakery*\n\n"
        f"✅ Order *{order.order_number}* deliver ho gaya!\n"
        f"💰 Payment ₹{float(order.total_amount):.0f} received ({pay}).\n"
        "Dhanyavaad! Phir se order karein 🙏\n"
        f"🔗 Order again: {track}\n"
        f"{_shop_footer()}"
    )
