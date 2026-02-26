#!/usr/bin/env bash
# dev-up.sh — Start the full local dev environment
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
command -v pnpm   >/dev/null 2>&1 || fail "pnpm not found. Run: corepack enable pnpm"

node_version=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])" 2>/dev/null || echo "0")
if [[ "$node_version" -lt 22 ]]; then
  fail "Node.js 22+ required. Found: $(node -v 2>/dev/null || echo 'none')"
fi

if [[ ! -f ".env" ]]; then
  warn ".env not found — copying from .env.example"
  cp .env.example .env
  warn "Review .env before continuing (secrets are placeholders)."
fi

ok "Prerequisites OK"

# ── 0b. Git hooks ─────────────────────────────────────────────────────────────

git config core.hooksPath .githooks 2>/dev/null && ok "Git hooks configured" || true

# ── 1. Docker ─────────────────────────────────────────────────────────────────

step "Starting Docker services (postgres + redis)"

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker Desktop first."
fi

$COMPOSE up -d

# Wait for Postgres
echo -e "${DIM}  Waiting for postgres...${RESET}"
retries=20
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

# ── 2. Dependencies ───────────────────────────────────────────────────────────

step "Installing dependencies"

# Always run — pnpm is a no-op when the lockfile is unchanged,
# so this correctly handles both first-run and post-git-pull scenarios.
pnpm install
ok "Dependencies up to date"

# ── 3. Migrations ─────────────────────────────────────────────────────────────

step "Applying database migrations"

source scripts/_load-env.sh

pnpm db:migrate
ok "Migrations applied"

# ── 4. Start apps ─────────────────────────────────────────────────────────────

echo -e "\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Oh Writers — dev environment ready${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}Web app${RESET}    →  http://localhost:3000"
echo -e "  ${BOLD}WS server${RESET}  →  http://localhost:1234"
echo -e "  ${BOLD}Health${RESET}     →  http://localhost:1234/health"
echo -e ""
echo -e "  ${DIM}Press Ctrl+C to stop the apps (Docker keeps running).${RESET}"
echo -e "  ${DIM}Run 'pnpm dev:down' to also stop Docker.${RESET}"
echo ""

pnpm dev
