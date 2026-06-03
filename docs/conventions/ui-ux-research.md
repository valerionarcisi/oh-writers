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
   computed border), so it is robust. Prefer writing it test-first
   (`superpowers:test-driven-development`).
4. **typecheck** is enforced by the pre-commit hook; never bypass with `--no-verify`.

Only skip the E2E test with an explicit, written reason in the commit/PR (e.g. the
surface has no testable handle yet) — never silently.

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
