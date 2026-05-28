#!/usr/bin/env bash
# dev-up.sh — Start core dev infrastructure (postgres + redis only)
#
# App + ws-server run NATIVELY on the host via `pnpm dev` (lighter on Mac
# resources than running them inside Docker). Langfuse is opt-in via
# `pnpm dev:up:langfuse` — kept off by default to save RAM/CPU.
#
# Usage:
#   pnpm dev:up           # start postgres + redis, apply migrations + seed
#   pnpm dev              # then run the app natively (separate terminal)
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

# ── 1. Start infra (postgres + redis only) ───────────────────────────────────

step "Starting core infrastructure (postgres + redis)"
$COMPOSE up -d postgres redis

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

# ── 2. Migrations + seed ─────────────────────────────────────────────────────

step "Applying database migrations"
pnpm db:migrate
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
  pnpm db:seed
  ok "Seed complete (valerio@ohwriters.it / La casa...)"
else
  ok "Seed data already present ($USER_COUNT user(s))"
fi

# ── 3. Done ──────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Oh Writers — core infra running${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}Postgres${RESET}  →  localhost:5432"
echo -e "  ${BOLD}Redis${RESET}     →  localhost:6379"
echo -e ""
echo -e "  Next: run the app natively (lighter than Docker):"
echo -e "    ${BOLD}pnpm dev${RESET}            ${DIM}# web (3000) + ws-server (1234)${RESET}"
echo -e ""
echo -e "  Optional — AI trace dashboard (heavy, opt-in):"
echo -e "    ${BOLD}pnpm dev:up:langfuse${RESET}    ${DIM}# start Langfuse stack${RESET}"
echo -e "    ${BOLD}pnpm dev:down:langfuse${RESET}  ${DIM}# stop it again${RESET}"
echo -e ""
echo -e "  Stop infra: ${BOLD}pnpm dev:down${RESET}"
echo ""
