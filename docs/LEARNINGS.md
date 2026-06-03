# Learnings — mistakes, dead-ends & corrections

A running log of things that went wrong (mine or the process's) and the rule that
prevents a repeat. Append a dated entry whenever the user corrects me or I catch a
mistake. Mirror the durable ones into a `feedback` memory so they auto-load next
session. See [UI/UX Research §4](conventions/ui-ux-research.md).

Format: `### YYYY-MM-DD — short title` · **What went wrong** · **Why** · **Rule going forward**.

---

### 2026-06-03 — Audit fleet stalled: subagents can't run background servers

**What went wrong** — Spawned 5 worktree auditors each told to start its own dev
server + drive its own browser. Two stalled on the permission wall (subagents have
no background-Bash) and one wandered into an unrelated skill; tokens wasted.

**Why** — Harness constraints I didn't account for: subagents can't run background
processes, and the Playwright MCP browser is a single shared instance that parallel
agents collide on.

**Rule going forward** — Lead starts the dev servers (mock `:3001` + real-key
`:3000`); auditors are told the URL, must NOT start servers or invoke other skills,
and drive via their OWN Playwright script (own chromium). Session isolation comes
from separate browser contexts, not separate ports (Better Auth cookie ignores the
port). Captured in `docs/conventions/ui-ux-research.md` §3 + feedback memory.

### 2026-06-03 — "Playwright intercepts pointer events" ≠ z-index bug

**What went wrong** — An auditor reported the screenplay ⋯ menu as a z-index/
`<main>`-stacking bug. Accepting that root cause would have sent a fix to the wrong file.

**Why** — The Playwright actionability message is a _symptom_. The real cause was the
`DropdownMenu` flip-up logic rendering the menu at `y = -91px` (off-screen),
confirmed only by live `elementFromPoint` + `getBoundingClientRect`.

**Rule going forward** — Always separate symptom from root cause and verify ALTO
findings live before accepting them. Measure geometry/hit-test, don't trust the tool
message. Codified in `docs/conventions/ui-ux-research.md` §1.

### 2026-06-03 — Shipped a UI fix without a regression test

**What went wrong** — Fixed the rail double-footer (M-12) with live re-measure +
screenshot + typecheck, but no Playwright regression test. The bug could silently return.

**Why** — Treated a small visual fix as not needing a test.

**Rule going forward** — Every UI fix gets measure + screenshot + a Playwright
regression test (assert the measurable property). Skip only with a written reason.
Codified in `docs/conventions/ui-ux-research.md` §2. (Follow-up: add the rail
single-footer test.)
