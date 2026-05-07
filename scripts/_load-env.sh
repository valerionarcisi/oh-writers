#!/usr/bin/env bash
# _load-env.sh — Source apps/web/.env into the current shell
# Usage: source scripts/_load-env.sh
#
# apps/web/.env is the single source of truth for all environment variables.
# Vinxi reads it automatically; scripts (drizzle-kit, tsx, etc.) use this
# helper to inherit the same values so DATABASE_URL and friends stay in sync.

ENV_FILE="apps/web/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Warning: $ENV_FILE not found — environment variables may be missing." >&2
  return 0
fi

set -o allexport
# shellcheck source=../apps/web/.env
source "$ENV_FILE"
set +o allexport
