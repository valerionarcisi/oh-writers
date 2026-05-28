#!/usr/bin/env bash
# dev-down-langfuse.sh — Stop the opt-in Langfuse stack (data preserved)
#
# Usage:
#   pnpm dev:down:langfuse           # stop containers, keep volumes
#   pnpm dev:down:langfuse --clean   # also remove volumes (wipes traces)
set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

COMPOSE="docker compose -f docker/docker-compose.langfuse.yml"

if [[ "${1:-}" == "--clean" ]]; then
  echo -e "${CYAN}${BOLD}▶ Stopping Langfuse and removing volumes${RESET}"
  $COMPOSE down -v --remove-orphans
  echo -e "${GREEN}✓ Langfuse stopped and volumes removed${RESET}"
else
  echo -e "${CYAN}${BOLD}▶ Stopping Langfuse (data preserved)${RESET}"
  $COMPOSE down
  echo -e "${GREEN}✓ Langfuse stopped${RESET}"
fi
