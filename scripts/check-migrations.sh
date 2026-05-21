#!/usr/bin/env bash
# check-migrations.sh — Verify every .sql migration is registered in _journal.json.
#
# Catches the "I generated a migration but forgot to commit drizzle/meta" bug
# (bug #5 in the 2026-05-21 CI postmortem). Runs in <100ms; in pre-push.
#
# Exit 0 → journal consistent.
# Exit 1 → drift detected; output explains exactly what.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRIZZLE_DIR="$ROOT/packages/db/drizzle"
JOURNAL="$DRIZZLE_DIR/meta/_journal.json"

if [[ ! -f "$JOURNAL" ]]; then
  echo "✗ Missing $JOURNAL" >&2
  exit 1
fi

python3 - "$DRIZZLE_DIR" "$JOURNAL" <<'PY'
import json, sys
from pathlib import Path

drizzle_dir, journal_path = sys.argv[1], sys.argv[2]
sql_tags = sorted(p.stem for p in Path(drizzle_dir).glob("*.sql"))

with open(journal_path) as f:
    journal = json.load(f)

entries = journal.get("entries", [])
journal_tags = [e["tag"] for e in entries]
journal_idxs = [e["idx"] for e in entries]

errors = []

missing = sorted(set(sql_tags) - set(journal_tags))
if missing:
    errors.append("SQL files with no journal entry:\n  - " + "\n  - ".join(missing))

orphan = sorted(set(journal_tags) - set(sql_tags))
if orphan:
    errors.append("Journal entries with no .sql file:\n  - " + "\n  - ".join(orphan))

dup_tags = sorted({t for t in journal_tags if journal_tags.count(t) > 1})
if dup_tags:
    errors.append("Duplicate tags in journal:\n  - " + "\n  - ".join(dup_tags))

dup_idxs = sorted({i for i in journal_idxs if journal_idxs.count(i) > 1})
if dup_idxs:
    errors.append("Duplicate idx values in journal:\n  - " + "\n  - ".join(map(str, dup_idxs)))

if errors:
    print("\n✗ Migration journal is inconsistent:\n", file=sys.stderr)
    for e in errors:
        print(e + "\n", file=sys.stderr)
    print("Fix: edit packages/db/drizzle/meta/_journal.json or rename the .sql file.", file=sys.stderr)
    sys.exit(1)

print(f"✓ Migrations consistent ({len(sql_tags)} files, {len(entries)} journal entries)")
PY
