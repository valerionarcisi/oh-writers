#!/usr/bin/env bash
# ponytail: one-shot local script — mirrors fly-secrets-set.sh but targets the
# beta apps with their own Neon branch + Upstash database (isolated from
# prod). Re-run by hand whenever a beta connection string rotates.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.fly-secrets.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy your Neon beta branch + Upstash beta connection strings into it first." >&2
  exit 1
fi

DATABASE_URL=$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
REDIS_URL=$(grep -m1 '^REDIS_URL=' "$ENV_FILE" | cut -d= -f2-)
RESEND_API_KEY=$(grep -m1 '^RESEND_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
REDIS_URL="${REDIS_URL%\"}"
REDIS_URL="${REDIS_URL#\"}"
RESEND_API_KEY="${RESEND_API_KEY%\"}"
RESEND_API_KEY="${RESEND_API_KEY#\"}"

: "${DATABASE_URL:?Set DATABASE_URL (Neon beta branch) in $ENV_FILE}"
: "${REDIS_URL:?Set REDIS_URL (Upstash beta) in $ENV_FILE}"
: "${RESEND_API_KEY:?Set RESEND_API_KEY (same key as prod, reused for staging) in $ENV_FILE}"

BETTER_AUTH_SECRET=$(openssl rand -base64 32)
WS_INTERNAL_SECRET=$(openssl rand -base64 32)

echo "Setting secrets on oh-writers-web-beta..."
fly secrets set --config fly.web.beta.toml \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  BETTER_AUTH_URL="https://beta.ohwriters.com" \
  WS_URL="wss://ws-beta.ohwriters.com" \
  WS_INTERNAL_SECRET="$WS_INTERNAL_SECRET" \
  SMTP_HOST="smtp.resend.com" \
  SMTP_PORT="587" \
  SMTP_SECURE="false" \
  SMTP_USER="resend" \
  SMTP_PASS="$RESEND_API_KEY" \
  MAIL_FROM="Oh Writers Beta <no-reply@ohwriters.com>"

echo "Setting secrets on oh-writers-ws-server-beta..."
fly secrets set --config fly.ws-server.beta.toml \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  WS_INTERNAL_SECRET="$WS_INTERNAL_SECRET"

echo "Done. Delete $ENV_FILE now that the secrets are on Fly."
