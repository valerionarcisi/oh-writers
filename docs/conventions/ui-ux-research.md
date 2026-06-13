# UI/UX Research, Validation & Learnings

How to investigate a UI/UX problem, validate a UI change, and accumulate context
over time. This is mandatory for any UI bug-hunt, audit, or visual/interaction fix.

---

## 1. Research — drive it live, measure, don't guess

Never diagnose a UI problem from source alone, and never trust a single screenshot.

1. **Drive the live app** (Playwright) on a running dev server. Reproduce the issue
   first — confirm it exists before theorising (see `superpowers:systematic-debugging`).
2. **Measure, don't eyeball.** The toolkit that finds root cause:
   - `getBoundingClientRect()` — geometry (off-screen? negative coords? overlap?)
   - `document.elementFromPoint(x, y)` — what actually sits under a click point
     (the only reliable hit-test; distinguishes "covered" from "fine")
   - `getComputedStyle(el)` — borders, `z-index`, `pointer-events`, `transform`,
     `position` (resolved values, not the source CSS)
   - check for a `transform`/`filter`/`will-change` ancestor when `position: fixed`
     misbehaves (it re-anchors fixed elements)
3. **Separate symptom from root cause.** A tool message ("Playwright: intercepts
   pointer events") is a _symptom_. Find the real cause before proposing a fix
   (e.g. 2026-06-03: that message was actually a menu rendered at `y = -91px`,
   not a z-index problem).
4. **Screenshot for the human.** Save under `docs/audits/<date>/shots/` (or a task
   folder) so the user can confirm visually. Screenshots are for humans; the DOM
   measurements are for diagnosis.
5. **Then read the source** to pin the exact cause and the `file:line` to change.

## 2. Validation — measure + screenshot + E2E test (all three)

A UI fix is not done until:

1. **Live re-measure** — re-run the same geometry/hit-test checks from §1 and show
   the numbers prove the fix (e.g. footer is now the last child; item is hit-testable).
2. **Screenshot** the fixed state.
3. **Playwright regression test** — a test that _fails on the old behaviour and
   passes on the new one_, so the bug can never silently return. This is mandatory
   for every UI fix (it is the gap that let regressions slip before). Write the
   assertion against the measurable property, not a pixel snapshot where possible
   (e.g. assert the element is the last rail child / is hit-testable / has the right
   computed border), so it is robust.
4. **typecheck** is enforced by the pre-commit hook; never bypass with `--no-verify`.

Only skip the E2E test with an explicit, written reason in the commit/PR (e.g. the
surface has no testable handle yet) — never silently.

## 2a. The design gate — two passes, two tools, in order

§1 and §2 are **two distinct passes with two distinct tools**, run in this order.
Do not collapse them and do not swap the order.

- **Pass 1 — DIAGNOSE, with `chrome-devtools` MCP.** The fast inner loop. Real Chrome,
  live DOM eval. Use it for every geometry / hit-test / computed-style probe in §1
  (`getBoundingClientRect`, `elementFromPoint`, `getComputedStyle`, transform-ancestor
  check) and for the human-facing screenshot. It is exploratory and throwaway — nothing
  here is committed. Loop here as many times as needed:
  `measure → fail → fix → re-measure` until the numbers say the design is right.
- **Pass 2 — LOCK, with `playwright`.** Run ONCE, only after Pass 1 is green. Write the
  E2E regression test (§2.3) on the **measurable property the chrome-devtools pass
  surfaced**, make it pass, keep it in CI forever. This is a vise, not a scalpel.

**Why two passes, not one.** chrome-devtools is a scalpel for diagnosis (fast,
interactive, no boilerplate) but wrong for CI (not repeatable, not committed).
Playwright is a vise for prevention (permanent, multi-browser, CI) but clumsy for live
exploration. Using only Playwright = you guess more during diagnosis. Using only
chrome-devtools = no regression guard, the bug returns. The split is the point.

**Order matters — do NOT test-first for visual/geometry fixes.** For pure logic,
`superpowers:test-driven-development` (test-first) still applies. For a visual or
interaction fix you cannot write the right assertion before measuring live — you do
not yet know the element must be `last-child`, or that the hit-test must land at
`(x, y)`. So: chrome-devtools first surfaces the number, **then** the test is written
against that number. The E2E test does not _discover_ the bug; it _freezes_ the fix
after chrome-devtools found it.

**Mandatory red-on-old check.** Before committing the fix, confirm the new E2E test is
**red on the old behaviour and green on the new** (stash the fix, run the test, see it
fail; restore, see it pass). A test that passes on both states guards nothing — this is
the exact gap that let regressions slip before. Costs ~30s.

### The loop, precise

```
develop
  → chrome-devtools (measure live)   ┐ inner loop, throwaway
  → fail? → fix → re-measure ────────┘ repeat until the numbers are right
  → ok  → screenshot (recap)
  → write E2E (playwright) → verify RED on old → apply fix → verify GREEN on new
  → typecheck / lint / DS-consistency CI green
  → GATE PASS → commit
```

A UI change clears the design gate iff: (1) root cause found by live measure, not
source-reading; (2) post-fix re-measure proves the numbers changed; (3) screenshot in
the recap; (4) Playwright regression test, red-on-old/green-on-new; (5) typecheck +
lint + DS-consistency CI green. (1)+(2) are the chrome-devtools pass; (3)+(4)+(5) are
the playwright/CI pass.

## 3. Audits — adversarial gate, no false positives

When running a multi-auditor audit (`agent-fleet`): every finding needs concrete
proof (screenshot / repro / `file:line`), a justified severity, and an actionable
fix. The Lead **spot-checks every ALTO finding live** before accepting it and
corrects auditor misdiagnoses (root cause, severity, false positives). See
`docs/audits/AUDIT-QUALITY-GATE.md` and [[feedback-audit-fleet-setup]] for the
fleet wiring (Lead starts the servers; auditors drive with their own Playwright).

## 4. Learnings — record every correction, accumulate context

Whenever the user corrects me, or I catch a mistake / dead-end / wrong assumption,
record it in **both** places (decided 2026-06-03):

- **`docs/LEARNINGS.md`** (this repo) — the versioned, PR-visible running log.
  One dated entry: what went wrong, why, the fix/rule going forward.
- **A `feedback` memory** in `~/.claude/.../memory/` — so it is auto-loaded into
  every future session's context without anyone reading the repo.

A **Stop hook** (`settings.json`) nudges this at the end of each task so it is not
left to discipline alone. The hook only reminds; the judgement of "was there a
mistake worth recording" is mine.

---

## Best-practice skills to invoke (don't reinvent these)

These encode workflow best practices and are mandatory where they apply:

- `superpowers:brainstorming` — before any new feature/behaviour change
- `superpowers:systematic-debugging` — before proposing any bug fix (root cause first)
- `superpowers:test-driven-development` — write the failing test before the fix
- `superpowers:verification-before-completion` — evidence before claiming "done"
- `superpowers:requesting-code-review` / project `/code-review` — before commit/merge
- project `/verify`, `/run` — drive the real app to confirm a change works
