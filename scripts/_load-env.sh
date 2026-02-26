#!/usr/bin/env bash
# _load-env.sh — Source .env into the current shell
# Usage: source scripts/_load-env.sh
#
# Exports every non-comment line from .env so child processes
# (drizzle-kit, tsx, etc.) inherit DATABASE_URL and other vars.

if [[ ! -f ".env" ]]; then
  echo "Warning: .env not found — environment variables may be missing." >&2
  return 0
fi

set -o allexport
# shellcheck source=../.env
source .env
set +o allexport
