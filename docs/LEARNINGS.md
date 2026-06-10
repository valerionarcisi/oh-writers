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

### 2026-06-03 — "Opens nothing" was a viewport overflow, found only by measuring at several widths

**What went wrong** — N-16 ("clicking the logline opens nothing in some state") looked
like a click-handler / popover-mount bug. At the default 1440 width the popover opened
fine on every page, so a single-width repro would have closed it as "cannot reproduce".

**Why** — The real cause was the shared `Popover` primitive having a fixed 480px width
with no viewport-collision handling. It only overflowed off-screen once the lane was
compressed (narrow window or a split/peek lane). Visible only by opening it at 1440 / 768
/ 390 and measuring the bounding box against the viewport.

**Rule going forward** — For "sometimes it doesn't show" overlay/popover bugs, repro at
multiple viewport widths AND with side panels open, and assert the bounding box is inside
the viewport — don't conclude from one width. A shared overlay primitive should clamp to
the viewport (portal + reposition), never trust a fixed width to fit.

### 2026-06-03 — "Missing from nav" was a mislabel, not a missing item

**What went wrong** — N-17 ("Soggetto missing from the sidebar") read as a dropped nav
entry. The entry was present all along; its EN label was wrongly "Treatment outline".

**Why** — Jumped toward "where did the item go" instead of first checking what the first
nav item actually rendered as. The i18n key resolved to a misleading English gloss that
collided with the real "Treatment" sibling.

**Rule going forward** — For "X is missing from the UI", first confirm what is actually
rendered in that slot (label text included) before hunting for removed code. A wrong
label reads as a missing item.

### 2026-06-03 — Local E2E suite is flaky; establish a baseline before blaming a change

**What went wrong** — A regression batch showed 16 failures with my change; alarming
until a clean-baseline run failed _more_ (~42), with a run-to-run-variable set.

**Why** — The local E2E environment is unstable — chiefly the `testProjectId` fixture
(`tests/fixtures.ts:102`) waiting on the dashboard "Non fa ridere" link, which flakes on
cold/slow servers and cascades. Failure counts are not a reliable signal on their own.

**Rule going forward** — Before attributing E2E failures to a change, run the same specs
on a clean baseline (stash) and compare. Lean on the deterministic layers (unit + the
focused regression spec) and verify the actual target live; treat the broad flaky suite
as advisory, not a gate.

### 2026-06-10 — A running dev stack silently corrupts the local E2E run (BUG-N57)

**What went wrong** — 5/11 narrative-editor E2E failed locally, looking exactly like a
product data-loss bug (typed markers persisted truncated, the editor wiped itself).
Hours went into a save/resync theory before the real cause surfaced: with `pnpm dev`
running, the playwright-spawned test server (test DB) inherits `VITE_WS_URL` from
`apps/web/.env` and connects to the DEV ws-server (dev DB). The auth/persistence
mismatch flaps the room and the editor remount-loops (skeleton ↔ editor every ~100ms),
eating keystrokes. With the dev stack down the same suite is 11/11 green.

**How it was caught** — Not from the test output: from driving the failing flow manually
and planting a DOM marker on the editor node, which died in ≤100ms — a remount loop, not
a content bug. Walking the marker up the tree (`contenteditable` → wrapper → pageShell)
pinpointed the flipping ternary.

**Rule going forward** — (a) The fix is in `playwright.config.ts`: the webServer command
force-empties `VITE_WS_URL`; never remove that. (b) When an E2E failure implies impossible
product behaviour, verify the DOM is STABLE first (marker trick) before theorising about
data flow. (c) Cross-stack interference is a standing suspect for "fails only on my
machine": enumerate every server the page can reach, not just the one the test started.
