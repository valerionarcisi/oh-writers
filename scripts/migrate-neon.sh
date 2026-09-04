#!/usr/bin/env bash
# ponytail: one-shot local script — runs drizzle-kit migrate against both the
# prod and beta Neon databases, reading direct (non-pooled) connection
# strings from a gitignored local file. Re-run whenever a new migration is
# added and needs to reach either environment.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.migrate.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy the Neon direct connection strings into it first." >&2
  exit 1
fi

PROD_URL=$(grep -m1 '^PROD_DATABASE_URL_DIRECT=' "$ENV_FILE" | cut -d= -f2-)
BETA_URL=$(grep -m1 '^BETA_DATABASE_URL_DIRECT=' "$ENV_FILE" | cut -d= -f2-)
PROD_URL="${PROD_URL%\"}"
PROD_URL="${PROD_URL#\"}"
BETA_URL="${BETA_URL%\"}"
BETA_URL="${BETA_URL#\"}"

: "${PROD_URL:?Set PROD_DATABASE_URL_DIRECT in $ENV_FILE}"
: "${BETA_URL:?Set BETA_DATABASE_URL_DIRECT in $ENV_FILE}"

echo "Migrating production database..."
DATABASE_URL="$PROD_URL" pnpm db:migrate

echo "Migrating beta database..."
DATABASE_URL="$BETA_URL" pnpm db:migrate

echo "Done. Delete $ENV_FILE now that migrations have run."
