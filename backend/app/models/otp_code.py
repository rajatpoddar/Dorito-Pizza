"""OTP codes for WhatsApp login (hashed at rest)."""
import hashlib
import os
from datetime import datetime, timedelta, timezone

from app.extensions import db


class OtpCode(db.Model):
    __tablename__ = "otp_codes"

    id = db.Column(db.Integer, primary_key=True)
    phone = db.Column(db.String(15), nullable=False, index=True)
    code_hash = db.Column(db.String(64), nullable=False)
    purpose = db.Column(db.String(20), nullable=False, default="login")  # login
    attempts = db.Column(db.Integer, nullable=False, default=0)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    consumed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # ---------- helpers ----------
    @staticmethod
    def hash_code(code: str) -> str:
        salt = os.getenv("OTP_SALT", "dorito-otp-salt")
        return hashlib.sha256(f"{salt}:{code}".encode()).hexdigest()

    @classmethod
    def issue(cls, phone: str, ttl_seconds: int) -> tuple[str, "OtpCode"]:
        """Create a new OTP (consumes old ones). Returns (plain_code, row)."""
        import secrets

        code = f"{secrets.randbelow(10 ** 6):06d}"
        cls.query.filter_by(phone=phone, purpose="login", consumed_at=None).update(
            {"consumed_at": datetime.now(timezone.utc)}
        )
        row = cls(
            phone=phone,
            code_hash=cls.hash_code(code),
            purpose="login",
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
        )
        db.session.add(row)
        return code, row

    @classmethod
    def verify(cls, phone: str, code: str, max_attempts: int = 5) -> tuple[bool, str]:
        """Check an OTP. Returns (ok, error_message)."""
        row = (
            cls.query.filter_by(phone=phone, purpose="login", consumed_at=None)
            .order_by(cls.id.desc())
            .first()
        )
        now = datetime.now(timezone.utc)
        expires = row.expires_at if row and row.expires_at.tzinfo else (
            row.expires_at.replace(tzinfo=timezone.utc) if row else None
        )
        if row is None:
            return False, "No OTP requested. Pehle OTP bhejein."
        if expires < now:
            return False, "OTP expire ho gaya. Naya OTP bhejein."
        if row.attempts >= max_attempts:
            return False, "Bahut zyada galat attempts. Naya OTP bhejein."
        if row.code_hash != cls.hash_code(code):
            row.attempts += 1
            db.session.commit()
            return False, "Galat OTP. Dobara koshish karein."
        row.consumed_at = now
        db.session.commit()
        return True, ""
