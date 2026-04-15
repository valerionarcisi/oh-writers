#!/usr/bin/env bash
# test-db-setup.sh — One-time setup for the E2E test database.
#
# Run this once after `pnpm dev:up` on an existing Docker volume that was
# created before the postgres-init script was added. New volumes get
# oh-writers_test auto-created by docker/postgres-init/01-test-db.sql.
#
# Usage: pnpm test:setup
set -euo pipefail

COMPOSE="docker compose -f docker/docker-compose.dev.yml"
TEST_DB_URL="${DATABASE_URL_TEST:-postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test}"

step() { echo -e "\n\033[1;36m▶ $1\033[0m"; }
ok()   { echo -e "\033[0;32m✓ $1\033[0m"; }

step "Creating oh-writers_test database"
$COMPOSE exec -T postgres \
  psql -U oh-writers -d oh-writers_dev \
  -c "CREATE DATABASE \"oh-writers_test\" OWNER \"oh-writers\"" \
  2>/dev/null && ok "Database created" || ok "Already exists — skipping"

step "Running migrations on oh-writers_test"
DATABASE_URL="$TEST_DB_URL" pnpm db:migrate
ok "Migrations applied"

step "Seeding oh-writers_test"
DATABASE_URL="$TEST_DB_URL" pnpm --filter @oh-writers/db seed:reset
ok "Seed complete"

echo -e "\n\033[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
echo -e "\033[1;32m  Test database ready. Run: pnpm test\033[0m"
echo -e "\033[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
