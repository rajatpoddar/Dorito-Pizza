"""Authentication routes — register / login / OTP (WhatsApp) / me."""
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required

from app.extensions import db, limiter
from app.models import Order, OtpCode, User
from app.services import whatsapp
from app.utils.decorators import db_get_current_user
from app.utils.phone import is_valid_indian_mobile, normalise_to_10
from app.utils.ratelimit import (
    AUTH_LOGIN,
    AUTH_OTP_SEND,
    AUTH_OTP_VERIFY,
    AUTH_REGISTER,
    limit as rl_limit,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# Backwards-compatible alias for any in-tree callers (the inline helper
# was removed when we moved the rule to utils/phone.py).
_normalise_phone = normalise_to_10


def _aware(dt):
    """SQLite can return naive datetimes — assume they are UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@auth_bp.post("/register")
@rl_limit(limiter, AUTH_REGISTER)
def register():
    """Customer self-signup (kept for compatibility; OTP login preferred)."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = _normalise_phone(data.get("phone", ""))
    password = data.get("password") or ""

    if not name or not phone or not password:
        return jsonify(error="name, phone and password are required"), 400
    if not is_valid_indian_mobile(phone):
        return jsonify(error="Enter a valid 10-digit Indian mobile number"), 400
    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters"), 400
    if User.query.filter_by(phone=phone).first():
        return jsonify(error="This mobile number is already registered"), 409

    user = User(name=name, phone=phone, role=User.ROLE_CUSTOMER)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify(access_token=token, user=user.to_dict()), 201


@auth_bp.post("/login")
@rl_limit(limiter, AUTH_LOGIN)
def login():
    """Password login (staff). Customers should use WhatsApp OTP."""
    data = request.get_json(silent=True) or {}
    phone = _normalise_phone(data.get("phone", ""))
    password = data.get("password") or ""

    if not phone or not password:
        return jsonify(error="Phone and password are required"), 400

    user = User.query.filter_by(phone=phone).first()
    if user is None or not user.check_password(password):
        return jsonify(error="Invalid phone number or password"), 401
    if not user.is_active:
        return jsonify(error="This account has been deactivated"), 403

    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify(access_token=token, user=user.to_dict())


# ----------------------------------------------------------------- OTP login
@auth_bp.post("/otp/send")
@rl_limit(limiter, AUTH_OTP_SEND)
def otp_send():
    """Send a 6-digit login OTP on WhatsApp."""
    data = request.get_json(silent=True) or {}
    phone = _normalise_phone(data.get("phone", ""))
    if len(phone) != 10:
        return jsonify(error="Enter a valid 10-digit mobile number"), 400

    user = User.query.filter_by(phone=phone).first()
    if user and not user.is_active:
        return jsonify(error="This account has been deactivated"), 403

    cfg = current_app.config
    now = datetime.now(timezone.utc)

    # rate limit: max sends per window + resend cooldown
    # Count only active (not consumed, not expired) OTPs to avoid
    # counting failed verifications twice.
    recent_window_start = now - timedelta(seconds=cfg["OTP_EXPIRY_SECONDS"])
    recent = OtpCode.query.filter(
        OtpCode.phone == phone,
        OtpCode.created_at >= recent_window_start,
    ).count()
    if recent >= cfg["OTP_MAX_PER_WINDOW"]:
        return jsonify(
            error="Bahut zyada OTP requests. 10 min baad koshish karein."
        ), 429
    # Resend cooldown — separate from max-per-window. 90s is friendlier
    # than 60s and reduces double-OTPs.
    last = OtpCode.query.filter_by(phone=phone).order_by(OtpCode.id.desc()).first()
    if last and (now - _aware(last.created_at)).total_seconds() < cfg["OTP_RESEND_COOLDOWN"]:
        wait = int(cfg["OTP_RESEND_COOLDOWN"] - (now - _aware(last.created_at)).total_seconds())
        return jsonify(
            error=f"Thoda rukein — {wait}s baad resend karein.",
            retry_after=wait,
        ), 429

    code, _row = OtpCode.issue(phone, cfg["OTP_EXPIRY_SECONDS"])
    row = whatsapp.queue_message(phone, whatsapp.otp_message(code),
                                 kind=whatsapp.WhatsAppOutbox.KIND_OTP)
    db.session.commit()

    # -------------------------------------------------------------- dev fallback
    # If Evolution API isn't configured (no API key), the worker will mark the
    # outbox row as `skipped`. In that case we return the code inline so the
    # frontend can render it as a banner — keeps the OTP flow usable in dev
    # when no WhatsApp bridge is set up. OTP_DEBUG=1 always returns the code.
    wa_configured = bool(cfg.get("EVOLUTION_API_KEY"))
    debug = bool(cfg.get("OTP_DEBUG", False) or not wa_configured)
    if debug and row.status == whatsapp.WhatsAppOutbox.STATUS_QUEUED and not wa_configured:
        # be honest: it will never leave the outbox. mark as skipped now.
        try:
            row.status = whatsapp.WhatsAppOutbox.STATUS_SKIPPED
            row.error = "EVOLUTION_API_KEY not configured"
            db.session.commit()
        except Exception:  # noqa: BLE001
            db.session.rollback()

    return jsonify(
        sent=True,
        wa_status=row.status,
        wa_configured=wa_configured,
        debug_otp=code if debug else None,
        is_new_user=user is None,
    )


@auth_bp.post("/otp/verify")
@rl_limit(limiter, AUTH_OTP_VERIFY)
def otp_verify():
    """Verify OTP → JWT. New numbers become customers; old guest orders get linked."""
    data = request.get_json(silent=True) or {}
    phone = _normalise_phone(data.get("phone", ""))
    code = re.sub(r"\D", "", data.get("code", ""))
    name = (data.get("name") or "").strip()

    if len(phone) != 10 or len(code) != 6:
        return jsonify(error="Phone and 6-digit OTP required"), 400

    ok, err = OtpCode.verify(phone, code)
    if not ok:
        return jsonify(error=err), 401

    now = datetime.now(timezone.utc)
    user = User.query.filter_by(phone=phone).first()
    is_new = False
    if user is None:
        is_new = True
        user = User(name=name or f"Customer {phone[-4:]}", phone=phone, role=User.ROLE_CUSTOMER)
        user.last_login_at = now
        db.session.add(user)
        db.session.flush()
    elif not user.is_active:
        return jsonify(error="This account has been deactivated"), 403
    else:
        if name:
            user.name = name
        user.last_login_at = now

    # ---- data persistence: link all previous guest orders to this account ----
    linked = (
        Order.query.filter_by(customer_phone=phone, customer_id=None)
        .update({"customer_id": user.id})
    )
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify(access_token=token, user=user.to_dict(),
                   is_new_user=is_new, linked_orders=linked)


@auth_bp.get("/me")
@jwt_required()
def me():
    user = db_get_current_user()
    if user is None:
        return jsonify(error="User not found"), 404
    return jsonify(user=user.to_dict())


@auth_bp.put("/me/preferences")
def update_preferences():
    """Update per-user preferences (currently: marketing opt-in flag).

    Customers can opt-out of WhatsApp marketing at any time. Staff may also
    update their own flag (useful when testing the campaign system). Returns
    the full updated user dict so the client can refresh its state.
    """
    from flask_jwt_extended import verify_jwt_in_request

    verify_jwt_in_request()
    user = db_get_current_user()
    if user is None:
        return jsonify(error="User not found"), 404
    if not user.is_active:
        return jsonify(error="This account has been deactivated"), 403

    data = request.get_json(silent=True) or {}
    if "marketing_optin" in data:
        if not isinstance(data["marketing_optin"], bool):
            return jsonify(error="marketing_optin must be true or false"), 400
        user.marketing_optin = data["marketing_optin"]

    db.session.commit()
    return jsonify(user=user.to_dict())
