#!/usr/bin/env bash
# fleet-check.sh — deterministic quality gate for the agent fleet.
#
# Splits the fleet's "is this work acceptable?" question into the part a script
# can answer (this file) so the AI judges only spend tokens on what they can't:
# UX-friendliness, design fidelity, architectural coherence.
#
# Two layers:
#   1. build-green  — reuses dev-check.sh (typecheck + lint + tests)
#   2. guardrails   — greps for CLAUDE.md hard-no violations, with file:line output
#
# Usage:
#   pnpm fleet:check                 # guardrails on whole tree, no build (fast)
#   pnpm fleet:check --diff <base>   # guardrails only on files changed vs <base>
#   pnpm fleet:check --build         # also run the full build-green layer
#   pnpm fleet:check --build --diff origin/main
#
# Exit 0 = clean, 1 = violations (lists them). Meant to be called by every agent
# before it reports done, and by the Lead at the gate.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="apps/web/app"

BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; DIM='\033[2m'; RESET='\033[0m'

# --- args ---------------------------------------------------------------
RUN_BUILD=0
DIFF_BASE=""
STAGED=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)  RUN_BUILD=1; shift ;;
    --staged) STAGED=1; shift ;;
    --diff)   DIFF_BASE="${2:?--diff needs a base ref}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

cd "$ROOT"

# Domain vocabulary: Italian terms that are the product's ubiquitous language,
# NOT a violation of the English-identifiers rule. Extend deliberately.
DOMAIN_TERMS='soggetto|sinossi|scaletta|trattamento|sceneggiatura|logline|breakdown|cesare|vernissage'

# Files in scope: what is staged, what changed vs a base ref, or the whole src.
#
# --staged is what a pre-commit hook needs: it reads the index, so it sees
# exactly what is about to be committed. --diff <base> uses two dots, not
# three: three would compare against the merge-base and silently ignore the
# working tree, which is how this check could report "clean" having looked at
# no files at all.
scoped_files() {
  if [[ $STAGED -eq 1 ]]; then
    git diff --name-only --cached --diff-filter=d -- "$SRC" 2>/dev/null
  elif [[ -n "$DIFF_BASE" ]]; then
    # Untracked files are invisible to `git diff`, so a brand-new file would
    # sail past the gate. List them alongside the modified ones.
    {
      git diff --name-only --diff-filter=d "$DIFF_BASE" -- "$SRC" 2>/dev/null
      git ls-files --others --exclude-standard -- "$SRC" 2>/dev/null
    } | sort -u
  else
    find "$SRC" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.module.css' \) 2>/dev/null
  fi
}

mapfile -t FILES < <(scoped_files)
ts_files=();  css_files=()
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  case "$f" in
    *.module.css) css_files+=("$f") ;;
    *.ts|*.tsx)   ts_files+=("$f") ;;
  esac
done

violations=0

# Run one guardrail. $1 = label, rest = a command that PRINTS offending file:line
# lines (and prints nothing when clean).
guardrail() {
  local label="$1"; shift
  local hits; hits="$("$@" 2>/dev/null)"
  if [[ -n "$hits" ]]; then
    echo -e "${RED}✗ ${label}${RESET}"
    echo "$hits" | sed 's/^/    /'
    violations=$((violations + $(echo "$hits" | grep -c .)))
  else
    echo -e "${GREEN}✓ ${label}${RESET}"
  fi
}

# grep helper scoped to a file list; no-op (and clean) when the list is empty.
grep_in() {
  local -n arr=$1; shift
  [[ ${#arr[@]} -eq 0 ]] && return 0
  grep -nE "$@" "${arr[@]}" 2>/dev/null
}

# --- guardrail bodies ---------------------------------------------------
g_italian_identifiers() {
  # Italian word used as a declared identifier (not in a string, not a domain term).
  grep_in ts_files "\b(const|let|var|function|class|interface|type)\s+(carica|gestisc[ie]|salva|elimina|modifica|aggiorna|cancella|utente|messaggio|errore|nuov[oa]|valore|risultato)[A-Za-z]*" \
    | grep -viE "($DOMAIN_TERMS)"
}
g_rogue_hex() {
  # Bare hex colour used directly. Allowed: a hex as the FALLBACK inside
  # var(--token, #hex) (the design-system idiom) and token DEFINITIONS (--x: #hex).
  # Violation = a hex that is NOT preceded by "var(--…," and NOT a "--…:" definition.
  grep_in css_files "#[0-9a-fA-F]{3,8}\b" \
    | grep -vE 'var\([^)]*#[0-9a-fA-F]{3,8}' \
    | grep -vE '^[^:]*--[a-z0-9-]+\s*:[^:]*#[0-9a-fA-F]'
}
g_secret_log() {
  grep_in ts_files "(console\.[a-z]+|logger\.[a-z]+|log\.[a-z]+)\([^)]*(apiKey|api_key|password|secret|ANTHROPIC_API|bearer)" \
    | grep -viE '(invite|csrf|//)'
}
g_native_dialog() {
  grep_in ts_files "\bwindow\.(alert|confirm|prompt)\("
}
g_tailwind() {
  grep_in ts_files "className=\"[^\"]*\b(flex|grid|px-[0-9]|py-[0-9]|mt-[0-9]|text-(sm|lg|xl)|bg-(red|blue|gray|white|black))"
}
g_hardcoded_radius() {
  # A small arbitrary px radius that should be a --radius-* token.
  # NOT a violation: var(--radius…), 50%/999px/100px (circle & pill are shape
  # intent, not theme), 0 (screenplay page is explicitly --radius-none), 1px.
  grep_in css_files "border-radius:\s*[2-9][0-9]?px\b" \
    | grep -vE '(var\(--radius|999px|100px)'
}

# --- run ----------------------------------------------------------------
if [[ $STAGED -eq 1 ]]; then SCOPE_LABEL="staged"; else SCOPE_LABEL="${DIFF_BASE:-full tree}"; fi
echo -e "${BOLD}${CYAN}fleet-check${RESET}  ${DIM}scope: ${SCOPE_LABEL}  files: ${#FILES[@]}${RESET}\n"

if [[ $RUN_BUILD -eq 1 ]]; then
  echo -e "${BOLD}build-green${RESET} ${DIM}(typecheck + lint + tests)${RESET}"
  if bash "$ROOT/scripts/dev-check.sh"; then
    echo -e "${GREEN}✓ build-green${RESET}\n"
  else
    echo -e "${RED}✗ build-green failed (see above)${RESET}\n"
    violations=$((violations + 1))
  fi
fi

echo -e "${BOLD}guardrails${RESET} ${DIM}(CLAUDE.md hard-no rules)${RESET}"
guardrail "no Italian identifiers"        g_italian_identifiers
guardrail "no rogue hex (use tokens)"     g_rogue_hex
guardrail "no hardcoded border-radius"    g_hardcoded_radius
guardrail "no secret in logs"             g_secret_log
guardrail "no native dialogs"             g_native_dialog
guardrail "no Tailwind/utility classes"   g_tailwind

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ $violations -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  fleet-check clean${RESET} ${DIM}— gate may proceed to the AI judges${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}  fleet-check: ${violations} violation(s)${RESET} ${DIM}— fix before the gate${RESET}"
  exit 1
fi
