#!/usr/bin/env bash
# ponytail: one-shot local script — reads .env.fly-secrets.local (gitignored)
# and pushes secrets to both Fly apps. Not meant to run in CI; re-run by hand
# whenever a connection string rotates.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.fly-secrets.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy your Neon/Upstash connection strings into it first." >&2
  exit 1
fi

# Parse line-by-line instead of `source`ing the file: connection strings
# contain unquoted `&` (query string separators), which bash would otherwise
# interpret as "run in background", silently truncating the value.
DATABASE_URL=$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
REDIS_URL=$(grep -m1 '^REDIS_URL=' "$ENV_FILE" | cut -d= -f2-)
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
REDIS_URL="${REDIS_URL%\"}"
REDIS_URL="${REDIS_URL#\"}"

: "${DATABASE_URL:?Set DATABASE_URL in $ENV_FILE}"
: "${REDIS_URL:?Set REDIS_URL in $ENV_FILE}"

BETTER_AUTH_SECRET=$(openssl rand -base64 32)
WS_INTERNAL_SECRET=$(openssl rand -base64 32)

echo "Setting secrets on oh-writers-web..."
fly secrets set --config fly.web.toml \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  BETTER_AUTH_URL="https://app.ohwriters.com" \
  WS_URL="wss://ws.ohwriters.com" \
  WS_INTERNAL_SECRET="$WS_INTERNAL_SECRET"

echo "Setting secrets on oh-writers-ws-server..."
fly secrets set --config fly.ws-server.toml \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  WS_INTERNAL_SECRET="$WS_INTERNAL_SECRET"

echo "Done. Delete $ENV_FILE now that the secrets are on Fly."
