"""WSGI entrypoint: gunicorn -w 4 -b 0.0.0.0:5000 wsgi:application"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()  # load backend/.env if python-dotenv is installed
except ImportError:
    pass  # env vars loaded by shell or run_local.sh

from app import create_app

application = create_app()

if __name__ == "__main__":
    application.run(
        host="0.0.0.0",
        port=5000,
        # run_local.sh disables the reloader so Ctrl+C stops everything cleanly
        use_reloader=os.getenv("FLASK_RELOADER", "1") == "1",
    )
