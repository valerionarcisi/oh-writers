# Definition of Done

A change (bug fix or feature) is **done** only when ALL of the following hold. No
exceptions are skipped silently — if one genuinely doesn't apply, say so in the recap
with the reason.

## 1. Tests at every applicable layer — E2E first

Priority order is **E2E > integration > unit** (the higher layers prove the user-facing
behaviour; the lower layers pin the logic). Add every layer that applies:

- **E2E (Playwright) — mandatory for any user-facing change.** A test that **fails on the
  old behaviour and passes on the new one** (write it first — `superpowers:test-driven-development`).
  For a bug, the E2E reproduces the bug, then goes green with the fix.
- **Integration** — when the change touches a server fn / DB / cross-module boundary:
  exercise the real boundary (server fn + DB), not a mock of it.
- **Unit (Vitest)** — for pure logic, parsers, reducers, schema, guards.

A user-facing fix with no E2E is **not done**. Mock-only coverage of an AI/Cesare path
does not count as proof of the real path — say so explicitly (see `ui-ux-research.md`).

## 2. Screenshots in a final recap

Every fix/feature ends with a short **recap** containing screenshots of the affected
surface — before/after where it's a UI change, or proof-of-behaviour otherwise. The recap
also states: what changed, which tests were added/run (per layer) and their result, and
anything skipped + why. (UI specifics: measure + screenshot, `ui-ux-research.md` §2.)

## 3. Gates green

- `pnpm typecheck` + `pnpm lint` clean (pre-commit enforces typecheck; never `--no-verify`).
- The relevant CI guards green: route-smoke, DS-consistency, the new test(s) (Spec 56).

## 4. Tracked + recorded

- The bug/feature is an item in `docs/BACKLOG.md`; bug detail (repro + proof + severity +
  status) lives in `docs/BUGS.md`.
- Any correction/mistake/dead-end along the way → `docs/LEARNINGS.md` + a feedback memory.

## 5. Committed clean

- `[OHW] type: description`, no AI signatures, code-reviewed diff (`/code-review`) before commit.
