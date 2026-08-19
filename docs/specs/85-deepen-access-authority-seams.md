# Spec 85 — Deepen the access & authority seams (consolidated refactor)

Status: **Implemented** (access archive-gate + deletions, AI decision split, shared CSV; NotFoundStore migration and singleton store deferred — see §4/§5)
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

**As built (narrowed from the original plan):** implementation revealed
`server/permissions.ts` is partly **team-scoped**, not project-scoped — `getMembership`
is a shared team-membership DB fetch used by `teams/server.ts` (no project) and cannot
route through the project-scoped authority. So it is NOT deleted.

- **`isArchived` gate** now enforced in the authority's **edit** path (`access.ts`
  `checkAccess`): an archived project returns `ForbiddenError` at "edit", even for the
  personal owner; "view" is unaffected.
- **Kept** `apps/web/app/server/permissions.ts` (`canEdit`/`isOwner`/`getMembership`) — a
  real shared seam for team-scoped + already-member-loaded callers. Candidate #1's
  "delete the duplicate" applies to `permissions.ts`'s _drift_ (the `isArchived` gap), now
  closed at the authority, not to the file itself.
- **Deleted dead** `apps/web/app/features/budget/server/budget-access.ts` — zero callers.
- **Deleted** the pure-alias `apps/web/app/features/breakdown/lib/permissions.ts` +
  its duplicate `permissions.test.ts`. The 5 `canEditBreakdown`/`canViewBreakdown`
  callers now use `canEditProject`/`canViewProject` from `@oh-writers/utils` directly
  (structurally compatible — the alias only renamed them).
- **Deferred**: don't route `breakdown-access.ts`'s 5 callers through `withProjectAccess`
  — those lookups resolve scene/version → project and are currently ungated (access info
  only); forcing them through the authority would _add_ a permission gate, a behavior
  change on AI/export paths. `ponytail:` revisit when a permission gate is actually
  wanted on those paths.

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

**As built:** added `toCsv(header, rows)` + `escapeCsv` to `packages/utils` (`csv.ts`,
re-exported from the index) and consolidated the five per-feature copies — `escapeCsv` +
`rows→CSV` serialization now live in the one shared module; each feature keeps only its
row-shaping. This closes the drift the scans flagged (schedule/breakdown/shooting-plan
escaped `\n`-only; the shared escape handles `\n\r`). The download-hook unification
(review candidate #8) is **out of scope** (separate spec).

### 4. One NotFoundError in `packages/utils` (review candidate #5)

**As built:** the generic `NotFoundError(resource, id)` was added to `packages/utils`
(`errors.ts`), ready for use. The **mass migration is deferred**: it touches ~9 error
files + ~58 constructor call sites and changes the wire `_tag` from the per-feature name
(e.g. `"ScreenplayNotFoundError"`) to `"NotFoundError"` — a wire-discriminant regression
for near-zero behavioral gain, since each class is a handful of lines. Special-cased
variants that carry extra fields (e.g. `SubjectNotFoundError(projectId)`) were never
candidates. `ponytail:` migrate incrementally if/when the generic wire `_tag` becomes
acceptable or the classes grow real logic.

### 5. One `createSingletonStore` in `packages/utils` (review candidate #7)

**As built:** **deferred**. The three stores
(`app-shell/cesare-live-edit-store.ts`, `cesare-live-diff-store.ts`,
`documents/lib/cesare-highlight-store.ts`) share only a ~10-line skeleton (`state` +
`Set<listener>` + `getState`/`subscribe`) and differ materially in their mutation logic
(stacks+idCounter, nonce batches, fragment filtering). A factory would add a concept for
~30 saved lines. `ponytail:` extract only if a fourth store appears.

## Non-goals

- No standalone per-aggregate DB repo layer (review candidate #2) — deferred; only the
  `getMembership` fetch moves for access convergence. Add repos later only if a concrete
  read benefits.
- No `useExportDownload` hook unification (candidate #8) — separate spec.
- No pdfkit `renderPdf` collector (candidate #11).
- No crossing into / re-architecture of the "Mostra/Nascondi" diff model (candidate #12).

## Tests

- `OHW-851` unit (`access.ts`): `requireProjectAccess` "edit" rejects an **archived**
  project with `ForbiddenError` (sad path, even for the personal owner); non-archived
  owner passes; viewer still passes at "view" on an archived project; missing project
  returns a `ProjectNotFoundError` result (not a throw).
- `OHW-852` — covered by the existing `access.test.ts` archive-gate assertions (above)
  plus the unchanged `packages/utils/permissions.ts` tests (predicates untouched).
- `OHW-853` unit (`packages/domain` `isAiEnabled`, thunk-based): override beats everything
  incl. mock **without calling I/O thunks**; mock wins without touching provider/trial;
  provider wins without consulting trial; trial enabled + spent<allowance → on; exhausted
  trial → off even with env key (de-platform); trial unconfigured → env-key fallback;
  0 allowance → off.
- `OHW-854` unit (`packages/utils` `toCsv`/`escapeCsv`): quoting, embedded commas/quotes,
  `\r`/`\n` handling — the drift case that motivated the consolidation.
- `OHW-855` — **not in this change** (migration deferred; `NotFoundError` class is added
  and typechecked but the wire `_tag` stays per-feature for now).
- `OHW-856` — **not in this change** (factory deferred).
- `OHW-857` regression: the existing `resolve-ai-enabled.server.test.ts` asserts the
  short-circuit/decision contract survived the refactor (override, MOCK, provider-wins,
  trial, fail-open). Breakdown/export CSV feature tests assert the shared serializer
  output.
