#!/usr/bin/env bash
# dev-down.sh — Stop Docker services (data is preserved)
# Usage: pnpm dev:down
#        pnpm dev:down --clean   (also removes volumes)
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

COMPOSE="docker compose -f docker/docker-compose.dev.yml"

if [[ "${1:-}" == "--clean" ]]; then
  echo -e "${CYAN}${BOLD}▶ Stopping Docker and removing volumes${RESET}"
  $COMPOSE down -v --remove-orphans
  echo -e "${GREEN}✓ Services stopped and volumes removed${RESET}"
else
  echo -e "${CYAN}${BOLD}▶ Stopping Docker services (data preserved)${RESET}"
  $COMPOSE down
  echo -e "${GREEN}✓ Services stopped${RESET}"
  echo -e "  Data is preserved. Run ${BOLD}pnpm dev:up${RESET} to restart."
  echo -e "  Use ${BOLD}pnpm dev:down --clean${RESET} to also wipe volumes."
fi
