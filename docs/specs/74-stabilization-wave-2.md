# Spec 74 — Stabilization Wave 2 (BUG-N63..N67)

Shared contract for the 4-lane fleet fixing the 2026-06-11 real-use findings. Every lane
agent and every judge reads this file plus `docs/BUGS.md` (entries N63..N67) before
touching code. Detail lives in the bug entries; this spec fixes the operating contract.

## Lanes

| Lane | Bug(s)        | Branch                                 | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | BUG-N67       | `fix/n67-cesare-entity-routing`        | Cesare writes the Trattamento when asked for the Sceneggiatura — entity routing in the universal tools (`features/predictions`: `cesare-universal-tools.ts`, `cesare-tool-entity-map.ts`, `narrative-next-step.ts` are the prime suspects). Unit test on the chosen-tool routing + **real-AI smoke** (pattern `cost:smoke:cesare`) — mock proof is NOT sufficient for this bug.                                                                                               |
| B    | BUG-N66       | `fix/n66-cesare-versioning-policy`     | **SPEC FIRST**: write `docs/specs/75-cesare-versioning-policy.md`, then implement. Owner policy (decided, not up for debate): default = Cesare OVERWRITES the current version with surgical edits; a NEW version only on explicit user request, or Cesare ASKS when the change is large. Applies to all narrative parts. Reconcile with the auto-version invariant (CLAUDE.md agentic pattern point 3) — propose ONE checkpoint per turn-group instead of a version per turn. |
| C    | BUG-N63       | `fix/n63-pdf-export-fidelity`          | Screenplay PDF export: (1) dialogue lines dropped, (2) title page missing author/contacts, (3) scene-heading bold mismatch. One export-fidelity front, unit-testable on the doc→PDF serializer (`screenplay-editor/server/screenplay-export.server.ts` + export modal/hook). Close with a REAL export verified by eye — screenshot in the recap.                                                                                                                              |
| D    | BUG-N64 + N65 | `fix/n64-n65-routed-surfaces-composer` | (1) `?vcur&versions&peek=cesare` blanks the page: routed surfaces must contend FAIL-CLOSED (one wins, the other closes — Spec 46/49; `app-shell/use-routed-surface.ts`), main lane never unmounts; E2E on the combo. (2) Cesare composer: auto-grow textarea (1 row → cap, Shift+Enter newline) in the floating drawer AND the session page; measure before/after per `docs/conventions/ui-ux-research.md`.                                                                   |

## Operating contract

- **Base**: every lane branches from CURRENT main (`4ff8bacf` + this spec's commit).
  The orchestrator verifies each lane's merge-base before trusting its gates
  (learning 2026-06-10: lane-green on a stale base is worthless).
- **Integration**: epic branch `epic/stabilization-wave-2` in a SEPARATE worktree
  (`../oh-writers-epic-2`). Lanes merge there at green gates; integration fixes happen
  on the epic; final gate (full unit + chromium full local + mock-ui) before proposing
  epic→main. Epic→main is the owner's decision — the fleet STOPS before it.
- **Never** switch branches in the main checkout while a dev server is alive.
- **E2E isolation**: each lane uses a dedicated `WEB_PORT` and `DATABASE_URL_TEST`
  (own `createdb`): A=3010, B=3020, C=3030, D=3040. Better Auth `trustedOrigins`
  covers only 3000-3005 but the playwright webServer sets `BETTER_AUTH_URL`, so these
  ports are fine. The playwright config already force-empties `VITE_WS_URL` — never
  remove that.
- **Test policy**: unit tests free; NEW E2E free; NEVER modify an existing E2E without
  Valerio's explicit go — if an existing one is stale, report and wait.
- **Commits**: `[OHW] type: description`, no AI signatures. `/code-review` on the
  staged diff before every commit.
- **Docs**: at lane end update `docs/BUGS.md` (fixed + proof) and `docs/BACKLOG.md`.

## Gate (per lane, then re-run on the epic after merge)

1. `pnpm typecheck` green
2. `pnpm test:unit` green (scoped first, then full)
3. Lane's new E2E green on its dedicated port/DB
4. Lane-specific proof: A = real-AI smoke transcript; B = spec 75 exists and the
   implementation matches it; C = real exported PDF screenshot; D = before/after
   measurements + combo E2E
