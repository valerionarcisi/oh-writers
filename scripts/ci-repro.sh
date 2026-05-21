#!/usr/bin/env bash
# ci-repro.sh — Reproduce the GitHub Actions `e2e-mock` job locally.
#
# Mirrors .github/workflows/qa.yml step-for-step against a freshly-dropped
# oh-writers_test DB. Use this BEFORE pushing to main to catch the entire
# class of "works locally, fails in CI" bugs (missing journal entries,
# fresh-DB migration ordering, unbuilt workspace packages, etc.).
#
# Usage: pnpm ci:repro
# Wall time: <90s on a warm machine (deps cached, postgres already up).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker/docker-compose.dev.yml"
if ! $COMPOSE ps postgres --status running --quiet | grep -q .; then
  echo "✗ postgres container is not running. Run: pnpm dev:up" >&2
  exit 1
fi

# Mirror CI env vars (qa.yml `e2e-mock` job)
export DATABASE_URL="postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test"
export DATABASE_URL_TEST="$DATABASE_URL"
export MOCK_AI=true
export LLM_FIRST_BREAKDOWN=false
export BETTER_AUTH_SECRET=ci-test-secret-min-32-chars-padding
export BETTER_AUTH_URL=http://localhost:3002
export CI=true

start=$SECONDS
set -x

# Drop + recreate test DB (fresh-DB semantics catches migration ordering bugs)
$COMPOSE exec -T postgres psql -U oh-writers -d oh-writers_dev -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname = 'oh-writers_test' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "oh-writers_test";
CREATE DATABASE "oh-writers_test" OWNER "oh-writers";
SQL

# Cheap fail-fast: journal integrity (~50ms)
bash scripts/check-migrations.sh

# Workspace packages (CI builds them; local dev does not)
pnpm --filter './packages/*' build

# Playwright browsers (no-op if cached)
pnpm exec playwright install chromium >/dev/null

# Migrate + seed against the empty DB
pnpm db:migrate
pnpm db:seed:reset

# Same invocation as the qa.yml step
pnpm test:e2e --project=mock-ui

set +x
echo ""
echo "✓ ci:repro passed in $((SECONDS - start))s — safe to push to main."
