# Audit Quality Gate

The standard every UX/feature audit report must pass before its findings are accepted into the
consolidated action list. The orchestrator (Lead) applies this gate; a report below the bar is sent
back to its agent with concrete reasons.

## The four criteria (all mandatory)

### 1. Concrete proof per finding

Every finding must carry at least ONE of:
- a screenshot of the problem, OR
- explicit reproduction steps (page → action → observed result), OR
- a `file:line` reference from a source grep (for localisation / text leaks).

"It feels confusing" / "looks off" with no screenshot, no repro, and no source pointer is **rejected**.
A finding that cannot be reproduced is rejected.

### 2. Verified coverage

The report must show WHAT was actually exercised — a list of the pages/flows visited and the
features touched, mapped to the audit's mandate. If an area the mandate required was not exercised,
the audit is **incomplete** and goes back. (e.g. a feature-coverage audit that never opened the
Matrice tab has not covered breakdown.)

### 3. Prioritised + actionable

Every finding has:
- a severity (ALTO / MEDIO / BASSO) with a one-line justification of why that severity, AND
- a concrete proposed fix (what to change, ideally where).

A flat list with no priorities, or findings with no "how to fix", is **rejected**.

### 4. No false positives

"Bug" findings must be confirmed real, not:
- flaky test artifacts,
- known-and-accepted behaviour,
- playwright-cli rendering artifacts (e.g. screenshots that show no CSS — the CLI snapshots the DOM
  before styles apply; verify against computed styles / a real screenshot, not the raw snapshot),
- pre-existing issues already tracked.

The Lead spot-checks a sample of the "bug" findings live before accepting them. A report with
multiple unconfirmed/false-positive bugs goes back.

## How the gate is applied

1. Read each of the audit reports.
2. For each finding, check it against the four criteria; mark accepted / needs-evidence / rejected.
3. Spot-check a sample of ALTO findings live (reproduce them) — especially "bug" findings.
4. If a report fails coverage or has multiple false positives, send it back to its agent with the
   specific gaps.
5. Produce ONE consolidated, de-duplicated, prioritised action list from the ACCEPTED findings only,
   with each item carrying its proof + proposed fix. That list is what the user reviews and what we
   fix from.

## Cleanup (after the gate)

Once the consolidated list is produced and the audit worktrees/branches are no longer needed, run the
worktree/branch cleanup (per the agent-fleet skill: only when no agent is in flight) — remove the
audit agents' worktrees and delete their merged/abandoned branches.

## Lesson (2026-05-31): run re-audits SERIALLY

Better Auth's session cookie is `localhost`-scoped, NOT port-scoped. Running multiple auditors in
parallel on different ports made them steal each other's sessions (mid-audit logouts → false
"silent logout" findings). In the iterated fix→audit loop, run re-audits ONE AT A TIME on a single
port. (The first-pass 5-parallel audit was acceptable because the gate's live spot-checks caught the
session-artifact findings — but serial is the clean default.)
