#!/usr/bin/env bash
# ponytail: one-shot local script — reads .env.fly-secrets.local (gitignored)
# and pushes SMTP secrets (Resend relay) to the web app. Only the web app
# sends mail (packages/auth), so ws-server doesn't need these.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.fly-secrets.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy your Resend API key into it first." >&2
  exit 1
fi

RESEND_API_KEY=$(grep -m1 '^RESEND_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
RESEND_API_KEY="${RESEND_API_KEY%\"}"
RESEND_API_KEY="${RESEND_API_KEY#\"}"

: "${RESEND_API_KEY:?Set RESEND_API_KEY in $ENV_FILE}"

echo "Setting SMTP secrets on oh-writers-web..."
fly secrets set --config fly.web.toml \
  SMTP_HOST="smtp.resend.com" \
  SMTP_PORT="587" \
  SMTP_SECURE="false" \
  SMTP_USER="resend" \
  SMTP_PASS="$RESEND_API_KEY" \
  MAIL_FROM="Oh Writers <no-reply@ohwriters.com>"

echo "Done. Delete $ENV_FILE now that the secret is on Fly."
