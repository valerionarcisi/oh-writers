#!/usr/bin/env bash
# backup-dev-db.sh — snapshot the dev database before/after a real-project session.
#
# Usage:
#   pnpm db:backup                 # writes backups/oh-writers_dev-<timestamp>.sql.gz
#   pnpm db:backup my-label        # writes backups/oh-writers_dev-<timestamp>-my-label.sql.gz
#
# Restore (DESTRUCTIVE — replaces the dev DB):
#   gunzip -c backups/<file>.sql.gz | docker compose -f docker/docker-compose.dev.yml \
#     exec -T postgres psql -U oh-writers -d oh-writers_dev
set -euo pipefail

COMPOSE="docker compose -f docker/docker-compose.dev.yml"
BACKUP_DIR="backups"
LABEL="${1:-}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="oh-writers_dev-${STAMP}${LABEL:+-$LABEL}.sql.gz"

mkdir -p "$BACKUP_DIR"
$COMPOSE exec -T postgres pg_dump -U oh-writers --clean --if-exists oh-writers_dev \
  | gzip > "$BACKUP_DIR/$NAME"

SIZE="$(du -h "$BACKUP_DIR/$NAME" | cut -f1)"
echo "✓ Backup written: $BACKUP_DIR/$NAME ($SIZE)"
