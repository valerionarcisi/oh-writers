#!/usr/bin/env bash
# dev-up-langfuse.sh — Start the opt-in Langfuse stack
#
# Heavy stack (~6 containers, RAM-hungry). Only start when actively
# debugging AI traces. Stop with `pnpm dev:down:langfuse`.
#
# Usage: pnpm dev:up:langfuse
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

COMPOSE="docker compose -f docker/docker-compose.langfuse.yml"

step() { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}! $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker not found."
docker info >/dev/null 2>&1 || fail "Docker daemon is not running."

step "Starting Langfuse infra (clickhouse, minio, redis, postgres)"
$COMPOSE up -d langfuse-postgres langfuse-redis langfuse-clickhouse langfuse-minio

step "Starting Langfuse worker + web"
$COMPOSE up -d langfuse-worker langfuse-web

echo -e "${DIM}  Waiting for Langfuse web...${RESET}"
retries=30
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null | grep -q "200\|302"; do
  retries=$((retries - 1))
  [[ $retries -le 0 ]] && warn "Langfuse did not start in time — traces will buffer and retry." && break
  sleep 2
done
ok "Langfuse ready → http://localhost:3001"

echo -e "\n${GREEN}${BOLD}Langfuse running.${RESET} Stop with ${BOLD}pnpm dev:down:langfuse${RESET}."
