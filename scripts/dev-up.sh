#!/usr/bin/env bash
# dev-up.sh — Start the full local dev environment (fully containerised)
# Usage: pnpm dev:up
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

COMPOSE="docker compose -f docker/docker-compose.dev.yml"

step() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}! $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}" >&2; exit 1; }

# ── 0. Preflight checks ──────────────────────────────────────────────────────

step "Checking prerequisites"

command -v docker >/dev/null 2>&1 || fail "Docker not found. Install Docker Desktop."

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker Desktop first."
fi

if [[ ! -f "apps/web/.env" ]]; then
  warn "apps/web/.env not found — copying from apps/web/.env.example"
  cp apps/web/.env.example apps/web/.env
  warn "Review apps/web/.env before continuing (secrets are placeholders)."
fi

ok "Prerequisites OK"

# ── 0b. Git hooks ─────────────────────────────────────────────────────────────

git config core.hooksPath .githooks 2>/dev/null && ok "Git hooks configured" || true

# ── 1. Build images (if needed) ───────────────────────────────────────────────

step "Building dev images"
$COMPOSE build --quiet app ws-server
ok "Images ready"

# ── 2. Start infra (postgres, redis, langfuse stack) ─────────────────────────

step "Starting infrastructure"
$COMPOSE up -d postgres redis langfuse-postgres langfuse-redis langfuse-clickhouse langfuse-minio

# Wait for Postgres
echo -e "${DIM}  Waiting for postgres...${RESET}"
retries=30
until $COMPOSE exec -T postgres pg_isready -U oh-writers -d oh-writers_dev -q 2>/dev/null; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && fail "Postgres did not become healthy in time."
  sleep 1
done
ok "Postgres ready"

# Wait for Redis
echo -e "${DIM}  Waiting for redis...${RESET}"
retries=10
until $COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && fail "Redis did not become healthy in time."
  sleep 1
done
ok "Redis ready"

# ── 3. Migrations + seed ─────────────────────────────────────────────────────

step "Applying database migrations"

# Run migrations from inside the app container so DATABASE_URL resolves
# to the Docker network hostname (postgres:5432), not localhost.
$COMPOSE run --rm --no-deps \
  -e DATABASE_URL=postgresql://oh-writers:oh-writers@postgres:5432/oh-writers_dev \
  app pnpm db:migrate
ok "Migrations applied"

# Seed only on first run (check if the users table is empty).
# This creates: Valerio user, "Non fa ridere" project, screenplay, soggetto,
# scaletta, scene breakdown, budget, schedule — the full dev fixture set.
step "Checking seed data"
USER_COUNT=$($COMPOSE exec -T postgres \
  psql -U oh-writers -d oh-writers_dev -tAc "SELECT COUNT(*) FROM \"user\";" 2>/dev/null || echo "0")
USER_COUNT=$(echo "$USER_COUNT" | tr -d '[:space:]')
if [[ "$USER_COUNT" == "0" ]]; then
  echo -e "${DIM}  No users found — running seed...${RESET}"
  $COMPOSE run --rm --no-deps \
    -e DATABASE_URL=postgresql://oh-writers:oh-writers@postgres:5432/oh-writers_dev \
    app pnpm db:seed
  ok "Seed complete (valerio@ohwriters.it / La casa...)"
else
  ok "Seed data already present ($USER_COUNT user(s))"
fi

# ── 4. Start Langfuse ─────────────────────────────────────────────────────────

step "Starting Langfuse"
$COMPOSE up -d langfuse-worker langfuse-web
echo -e "${DIM}  Waiting for Langfuse web...${RESET}"
retries=30
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null | grep -q "200\|302"; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && warn "Langfuse did not start in time — traces will buffer and retry." && break
  sleep 2
done
ok "Langfuse ready → http://localhost:3001"

# ── 5. Start apps ─────────────────────────────────────────────────────────────

step "Starting app + ws-server"
$COMPOSE up -d app ws-server

echo -e "\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Oh Writers — full dev stack running${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}Web app${RESET}      →  http://localhost:3000"
echo -e "  ${BOLD}WS server${RESET}    →  http://localhost:1234"
echo -e "  ${BOLD}Langfuse${RESET}     →  http://localhost:3001"
echo -e ""
echo -e "  ${DIM}Tailing logs... Press Ctrl+C to detach (containers keep running).${RESET}"
echo -e "  ${DIM}Run 'pnpm dev:down' to stop everything.${RESET}"
echo ""

# Tail app + ws-server logs — Ctrl+C detaches without stopping containers
$COMPOSE logs -f app ws-server
