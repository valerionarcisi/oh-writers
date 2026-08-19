# Spec 85 — Deepen the access & authority seams (consolidated refactor)

Status: **In progress**
Depends on: [[Spec 23]] (server pipeline — `withProjectAccess`), [[Spec 84]] (§5 AI-enabled), existing conventions (shared-infra, server-functions, error-handling, react)

## Context

Two independent architecture scans converged on the same hot spots: the project-access
rule is expressed more than once and can drift, and a family of shared utilities was
re-implemented per feature instead of centralized. This spec converges it all onto the
deep seams that already exist — **no new authority is introduced**, the existing
`withProjectAccess`/`requireProjectAccess` (`apps/web/app/server/access.ts`) is the
single gate, and `packages/utils` is the single home for shared predicates, CSV, errors,
and the store factory.

## Decision

### 1. One permission authority — access convergence (from review candidates #1, #4, #10)

`apps/web/app/server/access.ts` (`requireProjectAccess`/`withProjectAccess`) is already
the canonical gate: `requireUser → loadProject → membership → role → view/edit gate`. The
work converges the stragglers onto it, never re-implements the gate.

- **Delete `apps/web/app/server/permissions.ts`** (`canEdit`/`isOwner`/`getMembership`).
  Its `isArchived` check moves into the authority's **edit** gate (`access.ts`
  `checkAccess`), which already reads the project row. `getMembership`'s fetch moves to a
  small db helper (or inline in `access.ts`).
- **Delete dead `apps/web/app/features/budget/server/budget-access.ts`** — zero callers.
- **Replace `apps/web/app/features/breakdown/server/breakdown-access.ts`** — its 5 callers
  (`export.server`, `auto-spoglio`, `cesare-suggest`, `clone-version`, `llm-spoglio`) switch
  to `withProjectAccess`. The by-screenplay / by-scene / by-version lookup helpers become
  thin **"resolve resource → projectId" helpers** that delegate the gate to the authority.
- **Delete the pure-alias `apps/web/app/features/breakdown/lib/permissions.ts`** +
  its duplicate `permissions.test.ts`. Callers use the shared predicates.
- **`packages/utils/permissions.ts` stays as the pure, db-free predicate source** shared
  with ws-server (`isProjectOwner`/`canEditProject`/`canViewProject` over
  `ProjectAccessContext`). The `isArchived` concern is web-side and lives in the authority,
  not here, so ws-server room-access is unaffected.

Interface contracts:

- `withProjectAccess(projectId, level, body)` — unchanged (callers keep their shape).
- `checkAccess` edit level additionally returns `ForbiddenError` when `project.isArchived`.
- Per-feature lookup helpers keep their external callers' signatures (which resource they
  resolve), but their bodies just locate the project and call the authority.

### 2. AI-enabled decision moves into `packages/domain` (review candidate #9)

Extract the **pure decision** from `resolveAiEnabled`
(`apps/web/app/features/feature-flags/resolve-ai-enabled.server.ts`) into a
framework-agnostic function in `packages/domain`:

```ts
// packages/domain — pure, unit-tested, no I/O, no env reads
type AiEnabledInput = {
  override: boolean | null;
  mockOn: boolean;
  hasProvider: boolean;
  trialEnabled: boolean;
  spentEur: number;
  allowanceEur: number;
  envKeyPresent: boolean; // ANTHROPIC_API_KEY fallback
  trialConfigured: boolean; // AI_TRIAL_QUOTA_EUR set at all
};
declare function isAiEnabled(input: AiEnabledInput): boolean;
```

The async I/O (BYOK provider lookup, trial ledger, env reads) **stays in the app**. The
bundle-boundary constraint (lazy `import()` of `ai-providers.server`) and the
`process.env` test override are **load-bearing and preserved** — the app function reads
env + I/O, computes the `AiEnabledInput`, and calls the pure function. This makes the
decision unit-testable without a DB and the catalogue authoritative.

### 3. One CSV module in `packages/utils` (review candidate #3)

Add `toCsv(rows)` + `escapeCsv` to `packages/utils` and delete the five per-feature
copies (`escapeCsv` + `rows→CSV` serializer). Features keep only their row-shaping and
call the shared serializer. The download-hook unification (review candidate #8) is
**out of scope** (separate spec).

### 4. One NotFoundError in `packages/utils` (review candidate #5)

Add a generic `NotFoundError(resource, id)` (same `_tag`/`message`/`resource`/`id` shape as
the existing `packages/utils` error family — see `errors.ts`). Replace **only the uniform
`XNotFoundError(id)`** classes (Doc, Scene, Schedule, ShotPlan, LocationRequirement, …).
Special-cased variants that carry feature-specific fields (e.g.
`SubjectNotFoundError(projectId)`) are **left as-is** — they are genuine variants, not
duplicates. `NotFoundError` replaces the `resourceName` in the error message so callers
that match on `_tag` need a one-time update to the generic `_tag`.

### 5. One `createSingletonStore` in `packages/utils` (review candidate #7)

Add a tiny `createSingletonStore<T>(initial)` returning the
`getState()/subscribe()/setState()` surface, and replace the three hand-rolled
`let state + Set<listener> + getState/subscribe/notify` copies
(`app-shell/cesare-live-edit-store.ts`, `cesare-live-diff-store.ts`,
`documents/lib/cesare-highlight-store.ts`). Behavior identical; less copy-paste.

## Non-goals

- No standalone per-aggregate DB repo layer (review candidate #2) — deferred; only the
  `getMembership` fetch moves for access convergence. Add repos later only if a concrete
  read benefits.
- No `useExportDownload` hook unification (candidate #8) — separate spec.
- No pdfkit `renderPdf` collector (candidate #11).
- No crossing into / re-architecture of the "Mostra/Nascondi" diff model (candidate #12).

## Tests

- `OHW-851` unit (`access.ts`): `withProjectAccess` "edit" rejects an **archived** project
  with `ForbiddenError` (sad path); non-archived owner/editor passes; viewer passes at
  "view". `getMembership` fetch still resolves team role.
- `OHW-852` unit (`packages/utils/permissions.ts`): predicates unchanged — personal owner,
  team owner/editor/viewer, null-role denial. Regression guard that the web authority's
  `isArchived` gate is NOT allowed to drift into these pure predicates.
- `OHW-853` unit (`packages/domain` `isAiEnabled`): decision matrix — mockOn beats all;
  override beats mock; hasProvider wins over trial; trial exhausted → false when
  configured, env-key fallback only when trial unconfigured. All pure of I/O.
- `OHW-854` unit (`packages/utils` `toCsv`/`escapeCsv`): quoting, embedded commas/quotes,
  `\r`/`\n` handling — the drift case that motivated the consolidation (schedule's old copy
  omitted `\r`).
- `OHW-855` unit (`packages/utils` `NotFoundError`): shape + message; the generic `_tag`
  still matches on the per-feature alias types.
- `OHW-856` unit (`createSingletonStore`): getState/subscribe/setState + unsubscribe
  removes a listener; no stale listener after unsubscribe.
- `OHW-857` E2E (mock): breakdown AI actions + export flows still work (callers now route
  through `withProjectAccess`); AI-off banner behavior unchanged (regression guard that
  `resolveAiEnabled` refactor kept behavior identical).
