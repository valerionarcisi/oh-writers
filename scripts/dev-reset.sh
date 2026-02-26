#!/usr/bin/env bash
# dev-reset.sh — Wipe the database and start fresh with seed data
# Usage: pnpm dev:reset
#
# What this does:
#   1. Stops and removes Docker volumes (all DB data is lost)
#   2. Recreates Postgres + Redis
#   3. Applies all migrations
#   4. Seeds with realistic sample data
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
fail() { echo -e "${RED}✗ $1${RESET}" >&2; exit 1; }

# ── Confirmation ──────────────────────────────────────────────────────────────

echo -e "${RED}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         DATABASE RESET WARNING           ║"
echo "  ║                                          ║"
echo "  ║  All local data will be permanently      ║"
echo "  ║  deleted and replaced with seed data.    ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "  Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }
fi

# ── 1. Stop and wipe volumes ──────────────────────────────────────────────────

step "Stopping Docker and removing volumes"

$COMPOSE down -v --remove-orphans
ok "Volumes wiped"

# ── 2. Recreate services ──────────────────────────────────────────────────────

step "Starting fresh Docker services"

$COMPOSE up -d

# Wait for Postgres
echo -e "${DIM}  Waiting for postgres...${RESET}"
retries=20
until $COMPOSE exec -T postgres pg_isready -U oh-writers -d oh-writers_dev -q 2>/dev/null; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && fail "Postgres did not become healthy."
  sleep 1
done
ok "Postgres ready"

# Wait for Redis
retries=10
until $COMPOSE exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && fail "Redis did not become healthy."
  sleep 1
done
ok "Redis ready"

# ── 3. Migrate ────────────────────────────────────────────────────────────────

step "Applying migrations"

source scripts/_load-env.sh
pnpm db:migrate
ok "Migrations applied"

# ── 4. Seed ───────────────────────────────────────────────────────────────────

step "Seeding database"

pnpm db:seed
ok "Seed data loaded"

# ── Done ──────────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Database reset complete${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Seed users:"
echo -e "    ${BOLD}admin@ohwriters.dev${RESET}    (owner of Brutalist Studio)"
echo -e "    ${BOLD}writer1@ohwriters.dev${RESET}  (editor)"
echo -e "    ${BOLD}writer2@ohwriters.dev${RESET}  (viewer)"
echo -e ""
echo -e "  Run ${BOLD}pnpm dev:up${RESET} to start the apps."
echo ""
