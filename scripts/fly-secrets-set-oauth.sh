#!/usr/bin/env bash
# ponytail: one-shot local script — reads .env.oauth.local (gitignored) and
# pushes GOOGLE_/GITHUB_ CLIENT_ID+SECRET to both prod and beta web apps.
# `fly secrets set` merges into existing secrets, it never wipes the rest.
# Both environments share ONE Google app and ONE GitHub app (each provider
# lets you register multiple redirect URIs on a single OAuth client — no
# need for a separate app per environment). Re-run by hand if a value rotates.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.oauth.local"
if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<'EOF'
Missing .env.oauth.local — create it first with:

  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  GITHUB_CLIENT_ID=...
  GITHUB_CLIENT_SECRET=...

Google Cloud Console (console.cloud.google.com) -> APIs & Services ->
Credentials -> Create OAuth client ID (Web application). Authorized redirect
URIs, add BOTH:
  https://app.ohwriters.com/api/auth/callback/google
  https://beta.ohwriters.com/api/auth/callback/google

GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App.
GitHub only accepts ONE callback URL per app, so register the prod app first
with:
  Homepage URL:              https://app.ohwriters.com
  Authorization callback URL: https://app.ohwriters.com/api/auth/callback/github
then create a SECOND GitHub OAuth app for beta with:
  Homepage URL:              https://beta.ohwriters.com
  Authorization callback URL: https://beta.ohwriters.com/api/auth/callback/github
and put the beta app's id/secret in GITHUB_CLIENT_ID_BETA / GITHUB_CLIENT_SECRET_BETA
below GOOGLE_CLIENT_SECRET in the same file (optional — omit to leave GitHub
off on beta and only enable it on prod).
EOF
  exit 1
fi

read_var() {
  local value
  value=$(grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2-)
  value="${value%\"}"
  value="${value#\"}"
  echo "$value"
}

GOOGLE_CLIENT_ID=$(read_var GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_SECRET=$(read_var GOOGLE_CLIENT_SECRET)
GITHUB_CLIENT_ID=$(read_var GITHUB_CLIENT_ID)
GITHUB_CLIENT_SECRET=$(read_var GITHUB_CLIENT_SECRET)
GITHUB_CLIENT_ID_BETA=$(read_var GITHUB_CLIENT_ID_BETA)
GITHUB_CLIENT_SECRET_BETA=$(read_var GITHUB_CLIENT_SECRET_BETA)

: "${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in $ENV_FILE}"
: "${GOOGLE_CLIENT_SECRET:?Set GOOGLE_CLIENT_SECRET in $ENV_FILE}"
: "${GITHUB_CLIENT_ID:?Set GITHUB_CLIENT_ID in $ENV_FILE}"
: "${GITHUB_CLIENT_SECRET:?Set GITHUB_CLIENT_SECRET in $ENV_FILE}"

echo "Setting OAuth secrets on oh-writers-web (production)..."
fly secrets set --config fly.web.toml \
  GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" \
  GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET"

echo "Setting OAuth secrets on oh-writers-web-beta..."
if [[ -n "$GITHUB_CLIENT_ID_BETA" ]]; then
  fly secrets set --config fly.web.beta.toml \
    GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
    GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
    GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID_BETA" \
    GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET_BETA"
else
  echo "  (GITHUB_CLIENT_ID_BETA not set — enabling Google only on beta, GitHub stays prod-only)"
  fly secrets set --config fly.web.beta.toml \
    GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
    GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET"
fi

echo "Done. Delete $ENV_FILE now that the secrets are on Fly."
