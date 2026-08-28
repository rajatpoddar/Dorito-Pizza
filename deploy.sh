#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# 🍕 Dorito Pizza — One-command deploy
#
# Usage:
#   git clone https://github.com/rajatpoddar/Dorito-Pizza.git
#   cd Dorito-Pizza
#   bash deploy.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Theme ───────────────────────────────────────────────────────
# Use $'...' syntax so escape chars are baked in at assignment time.
# This works on every shell (bash, dash, zsh) without echo -e.
BOLD=$'\033[1m'
DIM=$'\033[2m'
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
MAGENTA=$'\033[0;35m'
WHITE=$'\033[1;37m'
BG_GREEN=$'\033[42m'
BG_RED=$'\033[41m'
NC=$'\033[0m'

banner() {
    printf "${MAGENTA}${BOLD}"
    printf "\n"
    printf "  ╔══════════════════════════════════════════════════════╗\n"
    printf "  ║                                                      ║\n"
    printf "  ║       🍕  D O R I T O   P I Z Z A  🍕               ║\n"
    printf "  ║       ─────────────────────────────                  ║\n"
    printf "  ║       One-Command Deploy Script                      ║\n"
    printf "  ║                                                      ║\n"
    printf "  ╚══════════════════════════════════════════════════════╝\n"
    printf "%s" "${NC}"
}

step()   { printf "\n  ${CYAN}${BOLD}▸ %s${NC}\n" "$1"; }
info()   { printf "    ${GREEN}✔${NC} %s\n" "$1"; }
warn()   { printf "    ${YELLOW}⚠${NC} %s\n" "$1"; }
fail()   { printf "    ${RED}✘${NC} %s\n" "$1" >&2; }
label()  { printf "    ${DIM}%-22s${NC} %s\n" "$1" "$2"; }
sep()    { printf "  ${DIM}──────────────────────────────────────────────────────${NC}\n"; }
die()    { printf "\n  ${BG_RED}${WHITE}${BOLD} FATAL ${NC} ${RED}%s${NC}\n\n" "$1" >&2; exit 1; }

# ── Banner ──────────────────────────────────────────────────────
banner

# ── Pre-flight checks ──────────────────────────────────────────
step "Pre-flight checks"

missing=0
for cmd in docker openssl curl git; do
    if command -v "$cmd" >/dev/null 2>&1; then
        ver=$($cmd --version 2>/dev/null | head -1 | awk '{print $1,$2,$3}')
        label "$cmd" "${GREEN}found${NC} ${DIM}($ver)${NC}"
    else
        label "$cmd" "${RED}NOT FOUND${NC}"
        missing=1
    fi
done

if ! docker compose version >/dev/null 2>&1; then
    label "docker compose" "${RED}NOT FOUND (v2 required)${NC}"
    missing=1
else
    dc_ver=$(docker compose version --short 2>/dev/null || echo "?")
    label "docker compose" "${GREEN}found${NC} ${DIM}(v$dc_ver)${NC}"
fi

[ "$missing" -eq 1 ] && die "Missing required tools. Install them and retry."
info "All prerequisites satisfied"

# ── Auto git pull ──────────────────────────────────────────────
step "Pulling latest code"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "none")
    git fetch origin main --quiet 2>/dev/null || true
    REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "none")

    if [ "$LOCAL" = "$REMOTE" ]; then
        info "Already up-to-date ${DIM}($(git rev-parse --short HEAD))${NC}"
    else
        BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "?")
        info "Pulling ${BEHIND} new commit(s) …"
        git pull origin main --quiet 2>/dev/null || die "git pull failed — check permissions"
        NEW_SHA=$(git rev-parse --short HEAD)
        info "Updated to ${GREEN}${NEW_SHA}${NC}"
    fi
else
    warn "Not a git repo — skipping pull"
fi

# ── Stop existing containers ───────────────────────────────────
step "Stopping existing containers"

if docker compose ps --status running 2>/dev/null | grep -q "dorito-"; then
    info "Found running Dorito containers — stopping …"
    docker compose down --remove-orphans 2>/dev/null || true
    # Wait a moment for ports to be released
    sleep 2
    info "Previous containers stopped"
else
    info "No existing containers running"
fi

# ── Port detection ──────────────────────────────────────────────
step "Detecting free ports"

port_is_used() {
    netstat -tlnp 2>/dev/null | grep -qE ":${1} " && return 0 || return 1
}

find_free_port() {
    local -a candidates=("$@")
    for p in "${candidates[@]}"; do
        if ! port_is_used "$p"; then
            echo "$p"; return 0
        fi
    done
    die "All candidate ports occupied: ${candidates[*]}"
}

resolve_port() {
    local var_name=$1; shift
    local -a candidates=("$@")
    local current_val="${!var_name:-}"

    if [ -n "$current_val" ] && ! port_is_used "$current_val"; then
        echo "$current_val"; return 0
    fi
    find_free_port "${candidates[@]}"
}

BACKEND_PORT=$(resolve_port BACKEND_PORT 8555 8556 8557 8558 8559 8560)
FRONTEND_PORT=$(resolve_port FRONTEND_PORT 8580 8581 8582 8583 8584 8585)
DB_PORT=$(resolve_port DB_PORT 5433 5434 5435 5437 5438 5439)

label "Backend (Flask)"  "${GREEN}:${BACKEND_PORT}${NC}"
label "Frontend (nginx)" "${GREEN}:${FRONTEND_PORT}${NC}"
label "Database (PG)"    "${GREEN}:${DB_PORT}${NC}"
info "Port allocation complete"

# ── .env generation ─────────────────────────────────────────────
step "Environment configuration"

if [ ! -f .env ]; then
    info "No .env found — generating fresh config …"
    SECRET_KEY=$(openssl rand -hex 32)
    JWT_SECRET_KEY=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')

    cat > .env <<ENVEOF
# ── Dorito Pizza — Auto-generated by deploy.sh ──
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

SECRET_KEY=${SECRET_KEY}
JWT_SECRET_KEY=${JWT_SECRET_KEY}
POSTGRES_USER=dorito
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=dorito
DATABASE_URL=postgresql+psycopg2://dorito:${POSTGRES_PASSWORD}@db:5432/dorito

BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
DB_PORT=${DB_PORT}

SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
GIT_COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
ENVEOF

    label "Secrets" "${GREEN}generated${NC} ${DIM}(32-char keys)${NC}"
    label "DB pass" "${GREEN}random 24-char${NC}"
else
    info "Existing .env found — updating ports …"
    for var in BACKEND_PORT FRONTEND_PORT DB_PORT; do
        val="${!var}"
        if grep -q "^${var}=" .env; then
            sed -i.bak "s|^${var}=.*|${var}=${val}|" .env
            rm -f .env.bak
        else
            echo "${var}=${val}" >> .env
        fi
    done
    label "Ports" "${GREEN}updated in .env${NC}"
fi

# ── Build ───────────────────────────────────────────────────────
step "Building Docker images"

echo -e "    ${DIM}This may take a few minutes on first run …${NC}"
echo ""

docker compose build 2>&1 | while IFS= read -r line; do
    if echo "$line" | grep -qE "DONE|ERROR"; then
        printf "    ${DIM}%s${NC}\n" "$line"
    fi
done

info "Images built successfully"

# ── Launch ──────────────────────────────────────────────────────
step "Starting containers"

docker compose up -d 2>&1 | while IFS= read -r line; do
    if echo "$line" | grep -qE "Created|Started|Recreated"; then
        container=$(echo "$line" | sed 's/.*Container \([^ ]*\).*/\1/')
        printf "    ${GREEN}✔${NC} %s\n" "$container"
    fi
done

# ── Health check ────────────────────────────────────────────────
step "Waiting for backend health check"

HEALTH_URL="http://localhost:${BACKEND_PORT}/api/health"
dots=""
for i in $(seq 1 60); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        printf "    ${GREEN}✔${NC} Backend healthy ${GREEN}(took %ds)${NC}\n" "$((i*2))"
        break
    fi
    if [ "$i" -eq 60 ]; then
        printf "\n    ${RED}✘ Backend did not respond in 120s${NC}\n"
        printf "    ${DIM}Run: docker compose logs backend${NC}\n"
        die "Health check failed"
    fi
    dots="${dots}."
    printf "\r    ${YELLOW}⏳${NC} Waiting%s    " "$dots"
    sleep 2
done
echo ""

# ── Container status ────────────────────────────────────────────
step "Container status"

printf "\n"
printf "    ${BOLD}%-28s %-12s %-18s${NC}\n" "CONTAINER" "STATUS" "PORTS"
sep
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | tail -n +2 | while IFS= read -r line; do
    name=$(echo "$line" | awk '{print $1}')
    status=$(echo "$line" | awk '{print $2}')
    ports=$(echo "$line" | awk '{print $3}')
    if echo "$status" | grep -qi "up"; then
        printf "    ${GREEN}%-28s${NC} ${GREEN}%-12s${NC} ${DIM}%-18s${NC}\n" "$name" "RUNNING" "$ports"
    else
        printf "    ${RED}%-28s${NC} ${RED}%-12s${NC} ${DIM}%-18s${NC}\n" "$name" "STOPPED" "$ports"
    fi
done
printf "\n"

# ── Summary ─────────────────────────────────────────────────────
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

printf "\n"
printf "  ${BG_GREEN}${WHITE}${BOLD} 🍕  DEPLOYMENT COMPLETE ${NC}\n"
printf "\n"
printf "  ${BOLD}Frontend:${NC}  ${CYAN}http://%s:%s${NC}\n" "$SERVER_IP" "$FRONTEND_PORT"
printf "  ${BOLD}Backend:${NC}   ${CYAN}http://%s:%s/api/health${NC}\n" "$SERVER_IP" "$BACKEND_PORT"
printf "  ${BOLD}DB (dev):${NC}  ${DIM}localhost:%s${NC}\n" "$DB_PORT"
printf "\n"
printf "  ${DIM}Useful commands:${NC}\n"
printf "    ${YELLOW}docker compose logs -f${NC}        ${DIM}# tail all logs${NC}\n"
printf "    ${YELLOW}docker compose logs backend${NC}   ${DIM}# backend only${NC}\n"
printf "    ${YELLOW}docker compose down${NC}           ${DIM}# stop everything${NC}\n"
printf "    ${YELLOW}bash deploy.sh${NC}                ${DIM}# rebuild & restart${NC}\n"
printf "\n"
