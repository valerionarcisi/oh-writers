#!/usr/bin/env bash
# ponytail: manual deploy wrapper — CI doesn't deploy yet (see CLAUDE.md
# "Deploy & Release"), so this is the one command a human runs. Deploys
# web then ws-server for the chosen environment, one `fly deploy` each.
set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "prod" && "$ENV" != "beta" ]]; then
  echo "Usage: $0 <prod|beta>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [[ "$ENV" == "prod" ]]; then
  WEB_CONFIG="fly.web.toml"
  WS_CONFIG="fly.ws-server.toml"
  echo "About to deploy to PRODUCTION (app.ohwriters.com)."
  read -r -p "Type 'prod' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "prod" ]]; then
    echo "Aborted."
    exit 1
  fi
else
  WEB_CONFIG="fly.web.beta.toml"
  WS_CONFIG="fly.ws-server.beta.toml"
fi

echo "Deploying web ($WEB_CONFIG)..."
fly deploy --config "$WEB_CONFIG"

echo "Deploying ws-server ($WS_CONFIG)..."
fly deploy --config "$WS_CONFIG"

echo "Done — $ENV deployed."
