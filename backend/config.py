"""Application configuration objects."""
import os


class BaseConfig:
    """Shared configuration."""
    SECRET_KEY = os.getenv("SECRET_KEY", "dorito-flask-secret-key-change-in-production")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

    # --- JWT ---
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dorito-jwt-secret-key-change-in-production")
    JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 24 * 30  # 30 days (mobile app friendly)

    # --- Business constants ---
    SHOP_NAME = "Dorito Pizza and Bakery"
    SHOP_ADDRESS = "Jamtara Road, Palojori, Deoghar, Jharkhand 814146"
    SHOP_PHONE_1 = "6202965250"
    SHOP_PHONE_2 = "9939794303"

    # --- WhatsApp (Evolution API) ---
    EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL", "http://100.98.94.128:8087")
    EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY", "")  # from manager panel
    EVOLUTION_INSTANCE = os.getenv("EVOLUTION_INSTANCE", "Dorito")
    WA_MIN_INTERVAL = float(os.getenv("WA_MIN_INTERVAL", "4.0"))  # anti-ban pacing (s)

    # --- Uploads (menu item images etc.) ---
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "")  # resolved in create_app
    UPLOAD_MAX_BYTES = 5 * 1024 * 1024  # 5 MB per file
    UPLOAD_ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "gif"}

    # --- OTP ---
    OTP_LENGTH = 6
    OTP_EXPIRY_SECONDS = 600          # 10 min
    OTP_MAX_PER_WINDOW = 2            # max 2 sends per 10 min per phone (anti-spam)
    OTP_RESEND_COOLDOWN = 90          # s — friendlier than 60s, cuts double-OTPs
    OTP_DEBUG = os.getenv("OTP_DEBUG", "0") == "1"  # return OTP in response (dev only)

    # --- Marketing ---
    MARKETING_WINDOW_START = 9        # 09:00 IST
    MARKETING_WINDOW_END = 21         # 21:00 IST
    BROADCAST_CAP = 200               # max recipients per broadcast run
    TRACK_BASE_URL = os.getenv("TRACK_BASE_URL", "http://localhost:3000")

    # --- Background worker (WhatsApp outbox) ---
    WORKER_ENABLED = os.getenv("DORITO_DISABLE_WORKER", "0") != "1"


class DevConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://dorito:dorito@localhost:5432/dorito",
    )


class DockerConfig(BaseConfig):
    """Used inside containers (compose sets FLASK_CONFIG=docker)."""
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://dorito:dorito@db:5432/dorito",
    )


class TestConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL",
        "sqlite:///:memory:",
    )
    # Disable rate limiting in tests so test_client calls don't bleed
    # into the per-IP bucket across tests. Re-enable explicitly in
    # the rate-limiter test file when we want to assert 429s.
    RATELIMIT_ENABLED = False


config_by_name = {
    "dev": DevConfig,
    "docker": DockerConfig,
    "test": TestConfig,
}


def get_config():
    """Return config class based on FLASK_CONFIG env var (default: dev)."""
    return config_by_name.get(os.getenv("FLASK_CONFIG", "dev").lower(), DevConfig)
