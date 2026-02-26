#!/usr/bin/env bash
# dev-check.sh — Pre-PR sanity check (typecheck + lint + tests)
# Usage: pnpm dev:check
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

step()   { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
ok()     { echo -e "${GREEN}✓ $1${RESET}"; }
fail()   { echo -e "${RED}✗ $1${RESET}"; }

passed=0
failed=0
failures=()

run() {
  local label="$1"; shift
  step "$label"
  if "$@"; then
    ok "$label passed"
    passed=$((passed + 1))
  else
    fail "$label failed"
    failed=$((failed + 1))
    failures+=("$label")
  fi
}

start_time=$SECONDS

run "Typecheck"  pnpm typecheck
run "Lint"       pnpm lint
run "Tests"      pnpm test

elapsed=$((SECONDS - start_time))

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [[ $failed -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  All checks passed ($passed/$((passed + failed))) — ${elapsed}s${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  ${DIM}Safe to push and open a PR.${RESET}"
else
  echo -e "${RED}${BOLD}  $failed check(s) failed — ${elapsed}s${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  for f in "${failures[@]}"; do
    echo -e "  ${RED}✗ $f${RESET}"
  done
  exit 1
fi
