#!/usr/bin/env bash
# dev-nuke.sh — Full clean slate: wipe node_modules + Docker volumes, then reinstall
# Usage: pnpm dev:nuke
#
# Use when:
#   - pnpm install is broken or produces weird peer dep errors
#   - You switched Node/pnpm version
#   - Something is mysteriously broken and a clean start is faster than debugging
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

COMPOSE="docker compose -f docker/docker-compose.dev.yml"

step() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}! $1${RESET}"; }

echo -e "${RED}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║             FULL NUKE WARNING            ║"
echo "  ║                                          ║"
echo "  ║  This will delete:                       ║"
echo "  ║    • All node_modules                    ║"
echo "  ║    • Docker volumes (all DB data)        ║"
echo "  ║    • pnpm store cache for this project   ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "  Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }
fi

# ── 1. Stop Docker ────────────────────────────────────────────────────────────

step "Stopping Docker and removing volumes"
$COMPOSE down -v --remove-orphans 2>/dev/null || warn "Docker was not running — skipping"
ok "Docker cleaned"

# ── 2. Remove node_modules ────────────────────────────────────────────────────

step "Removing node_modules"

# Find all node_modules directories (exclude Docker volumes and .git)
find . \
  -name "node_modules" \
  -type d \
  -not -path "./.git/*" \
  -prune \
  -exec rm -rf {} + 2>/dev/null || true

ok "node_modules removed"

# ── 3. Remove build artifacts ─────────────────────────────────────────────────

step "Removing build artifacts"

find . \
  \( -name "dist" -o -name ".output" -o -name ".vinxi" \) \
  -type d \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -prune \
  -exec rm -rf {} + 2>/dev/null || true

ok "Build artifacts removed"

# ── 4. Fresh install ──────────────────────────────────────────────────────────

step "Installing dependencies (fresh)"
pnpm install
ok "Dependencies installed"

# ── 5. Restart Docker ─────────────────────────────────────────────────────────

step "Starting Docker services"
$COMPOSE up -d

echo -e "${DIM}  Waiting for postgres...${RESET}"
retries=20
until $COMPOSE exec -T postgres pg_isready -U oh-writers -d oh-writers_dev -q 2>/dev/null; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && { echo -e "${RED}✗ Postgres timeout${RESET}"; exit 1; }
  sleep 1
done
ok "Postgres ready"

# ── 6. Migrate + seed ─────────────────────────────────────────────────────────

step "Applying migrations"
source scripts/_load-env.sh
pnpm db:migrate
ok "Migrations applied"

step "Seeding database"
pnpm db:seed
ok "Seed data loaded"

# ── Done ──────────────────────────────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Nuke complete — environment is pristine${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Run ${BOLD}pnpm dev${RESET} to start the apps."
echo ""
