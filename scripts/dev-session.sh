#!/usr/bin/env bash
# dev-session.sh — wrap a real-project work session with automatic DB backups.
#
#   pnpm dev:session
#
# 1. snapshots the dev DB (pre-sessione)
# 2. runs `pnpm dev` (web + ws-server) in the foreground
# 3. on exit (Ctrl+C included) snapshots again (post-sessione)
#
# The post backup is best-effort: if postgres is already down at exit it warns
# instead of failing. A hard kill of the terminal skips it — the pre-session
# snapshot is the safety net that matters.
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

if ! docker compose -f docker/docker-compose.dev.yml exec -T postgres pg_isready -U oh-writers >/dev/null 2>&1; then
  echo -e "${RED}✗ Postgres is not up. Run 'pnpm dev:up' first.${RESET}" >&2
  exit 1
fi

echo -e "${GREEN}▶ Pre-session backup…${RESET}"
bash scripts/backup-dev-db.sh pre-sessione

post_backup() {
  echo ""
  echo -e "${GREEN}▶ Post-session backup…${RESET}"
  if bash scripts/backup-dev-db.sh post-sessione; then
    echo -e "${GREEN}✓ Session closed, both snapshots in backups/${RESET}"
  else
    echo -e "${YELLOW}! Post-session backup failed (postgres down?) — the pre-session snapshot is still in backups/${RESET}"
  fi
}
trap post_backup EXIT

echo -e "${GREEN}▶ Starting dev stack (Ctrl+C to end the session)…${RESET}"
pnpm dev
