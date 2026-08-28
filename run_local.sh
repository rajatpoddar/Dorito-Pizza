#!/bin/bash
# ============================================================================
#  Dorito Pizza and Bakery — local development runner (NO Docker needed)
#
#  Usage:
#    ./run_local.sh              # SQLite DB (zero setup — recommended)
#    ./run_local.sh --postgres   # use local PostgreSQL (must be running)
#    ./run_local.sh --reset      # wipe menu/users and reseed
#
#  Starts:
#    • Backend  (Flask)  → http://localhost:5000   (logs: .logs/backend.log)
#    • Frontend (Vite)   → http://localhost:3000   (logs: .logs/frontend.log)
#
#  Press Ctrl+C to stop BOTH servers.
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT=5000
RESET_FLAG=""

# ----------------------------- parse flags ---------------------------------
for arg in "$@"; do
  case "$arg" in
    --postgres) export USE_POSTGRES=1 ;;
    --reset)    RESET_FLAG="--reset" ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

# ----------------------------- database ------------------------------------
if [ "${USE_POSTGRES:-0}" = "1" ]; then
  export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg2://dorito:dorito@localhost:5432/dorito}"
  DB_LABEL="PostgreSQL (localhost:5432/dorito)"
  echo "ℹ  Using $DB_LABEL — make sure it is running (or: docker compose up db)"
else
  export DATABASE_URL="sqlite:///$ROOT/.local_dev.db"
  DB_LABEL="SQLite (.local_dev.db)"
fi

# --------------------------- load backend .env ----------------------------
if [ -f "$ROOT/backend/.env" ]; then
  echo "   • loading backend/.env"
  set -a; source "$ROOT/backend/.env"; set +a
fi

# --------------------------- sanity checks ---------------------------------
command -v python3 > /dev/null || { echo "❌ python3 not found — install Python 3.11+"; exit 1; }
command -v npm     > /dev/null || { echo "❌ npm not found — install Node.js 18+"; exit 1; }

echo "🍕 Dorito Pizza and Bakery — local runner"
echo "   Database : $DB_LABEL"

# --------------------------- backend setup ---------------------------------
echo "⚙️  Setting up backend…"
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  echo "   • created virtualenv (.venv)"
fi
if ! ./.venv/bin/python -c "import flask, flask_sqlalchemy, flask_jwt_extended" 2> /dev/null; then
  echo "   • installing Python dependencies…"
  ./.venv/bin/pip install -q --disable-pip-version-check -r requirements.txt
fi

# free the port if a stale backend is still running
if lsof -ti ":$BACKEND_PORT" > /dev/null 2>&1; then
  echo "   • port $BACKEND_PORT busy — stopping old process"
  lsof -ti ":$BACKEND_PORT" | xargs kill -9 2> /dev/null || true
  sleep 1
fi

echo "   • seeding database (menu + staff, idempotent)…"
if ! FLASK_RELOADER=0 ./.venv/bin/python seed.py $RESET_FLAG > "$LOG_DIR/seed.log" 2>&1; then
  echo "❌ Seeding failed — see .logs/seed.log"; tail -5 "$LOG_DIR/seed.log"; exit 1
fi
tail -1 "$LOG_DIR/seed.log"

# --------------------------- frontend setup --------------------------------
echo "⚙️  Setting up frontend…"
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  echo "   • installing npm packages (first run only)…"
  npm install --no-fund --no-audit --loglevel=error
fi

# ----------------------------- start all -----------------------------------
echo "🚀 Starting backend on :${BACKEND_PORT}..."
cd "$ROOT/backend"
FLASK_RELOADER=0 nohup ./.venv/bin/python wsgi.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# wait for /api/health (max 30s)
HEALTH_OK=0
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
    HEALTH_OK=1; break
  fi
  sleep 1
done
if [ "$HEALTH_OK" != "1" ]; then
  echo "❌ Backend did not start — last log lines:"
  tail -10 "$LOG_DIR/backend.log"
  kill "$BACKEND_PID" 2> /dev/null
  exit 1
fi
echo "✅ Backend  → http://localhost:$BACKEND_PORT/api/health"

echo "🚀 Starting frontend (Vite)…"
cd "$ROOT/frontend"
nohup ./node_modules/.bin/vite --host > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 3

# ------------------------- stop everything on exit --------------------------
cleanup() {
  echo ""
  echo "🛑 Stopping servers…"
  kill "$BACKEND_PID" "$FRONTEND_PID" "${TAIL_PID:-}" 2> /dev/null
  pkill -f "wsgi.py" 2> /dev/null
  pkill -f "node_modules/.bin/vite" 2> /dev/null
  sleep 1
  echo "👋 Done. Logs are in .logs/"
}
trap cleanup EXIT INT TERM

cat <<'BANNER'

============================================================
  🍕 DORITO PIZZA AND BAKERY — running locally
============================================================
  Customer app :  http://localhost:3000
  Manager      :  http://localhost:3000/admin   (6202965250 / Manager@123)
  Kitchen KDS  :  http://localhost:3000/kitchen (9939794303 / Cook@123)
  Delivery     :  http://localhost:3000/delivery(9000000001 / Agent@123)
  API direct   :  http://localhost:5000/api/health

  Live logs below (Ctrl+C to stop both servers)
============================================================
BANNER

tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &
TAIL_PID=$!
# `wait` is signal-interruptible (unlike a foreground tail), so Ctrl+C /
# SIGTERM immediately triggers the cleanup trap above.
wait "$TAIL_PID"
