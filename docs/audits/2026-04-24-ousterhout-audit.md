# Ousterhout Audit — 2026-04-24

Scope: `apps/web/app/features/{documents,breakdown,screenplay-editor}`,
`packages/domain/src`, `packages/ui/src/components`, `apps/web/app/server`,
sample route `_app.projects.$id_.soggetto.tsx`. Read-only review against
_A Philosophy of Software Design_.

---

## Critical findings (fix before next feature)

- **Information hiding leak — `ScreenplayNotFoundError` is reused for missing-project / missing-version cases** — `apps/web/app/features/screenplay-editor/server/screenplay.server.ts:73-75, 159-161`; `versions.server.ts:140-150`
  - What: when the _project_ row is missing, the handler returns `ScreenplayNotFoundError`. `resolveScreenplayAccess` returns `VersionNotFoundError` when the screenplay or project is gone.
  - Why it violates: "Different things, different abstractions." The `_tag` lies — clients matching on it cannot tell a deleted project from a missing screenplay or version.
  - Suggested refactor: use the existing `ProjectNotFoundError` from `projects.errors` for project-absent paths; or unify around `EntityNotFoundError { entity, id }`.
  - Effort: S

- **Define errors out of existence — per-type content cap is checked imperatively after Zod** — `apps/web/app/features/documents/server/documents.server.ts:210-220`
  - What: `SaveDocumentInput` accepts any string; the per-type cap (`ContentMaxByType[doc.type]`) is re-checked manually inside the handler with a custom `ValidationError`.
  - Why it violates: Zod is the natural place for input invariants; splitting validation into "wire-cap" + "type-cap inside handler" duplicates the rule and forces every future mutation to remember it.
  - Suggested refactor: discriminated `SaveDocumentInput` per `DocumentType`, each branch owning its own `z.string().max(...)`. The runtime check becomes unreachable.
  - Effort: M

- **Pull complexity downward — every server fn re-implements the "load X → load project → membership → canEdit/canRead" prelude** — `documents/server/documents.server.ts:90-163, 197-247`; `documents/server/versions.server.ts:25-90`; `screenplay-editor/server/screenplay.server.ts:48-103, 140-165`; `screenplay-editor/server/versions.server.ts:126-203`
  - What: ~5 nearly identical access-resolution blocks, each ~40 lines. `breakdown-access.ts` already centralises this pattern — the rest of the codebase did not follow.
  - Why it violates: shallow modules. Every handler pays the cost the helper should pay. Three+ identical occurrences with an obvious name (`resolveProjectAccess`).
  - Suggested refactor: extend the breakdown pattern into a generic `~/server/access.ts` exposing `resolveProjectAccessByProjectId / ByDocument / ByScreenplay / ByVersion`, returning `{ project, canEdit, canRead, isOwner }`. Delete the inline blocks.
  - Effort: M

- **Wrapper-itis — `assertCanEdit` and `assertCanRead` differ by one predicate** — `apps/web/app/features/documents/server/versions.server.ts:45-90`
  - What: two 22-line functions whose only divergence is the final `canEdit(...)` vs `isPersonalOwner || membership !== null`.
  - Why it violates: information hiding — the predicate is a one-liner that belongs next to `canEdit` in `~/server/permissions.ts`. Two functions instead of one parameterised helper.
  - Suggested refactor: `assertProjectAccess(db, doc, userId, mode: "read" | "write")`, plus `canRead` next to `canEdit` in `permissions.ts`.
  - Effort: S

- **Shallow UI modules — 9/15 components in `packages/ui` are className-concat boilerplate** — `packages/ui/src/components/{Kbd,Skeleton,Avatar,Badge,EmptyState,FormField,Input,Button,Tag}.tsx`
  - What: each ≤35 lines, repeating `[styles.x, ...].filter(Boolean).join(" ")`. Interfaces are nearly the size of bodies.
  - Why it violates: classic shallow-module case — wrapping CSS-Modules adds nothing; every new prop copy-pastes the merge.
  - Suggested refactor: keep the components (style-contract value), but extract `cx(...args)` into `packages/ui/src/utils.ts` and reuse. Don't collapse the component layer.
  - Effort: S

- **Breakdown access helpers re-fetch entities the caller already loaded** — `apps/web/app/features/breakdown/server/breakdown.server.ts:83-99, 457-475, 516-533`
  - What: `getBreakdownForScene`, `updateBreakdownElement`, `archiveBreakdownElement` each fetch the scene/element, then call `resolveBreakdownAccessByScene/ByProjectId`, which re-fetches the same entity (or its parent).
  - Why it violates: pull complexity downward — caller and helper both pay the lookup cost. Two round-trips where one suffices.
  - Suggested refactor: `resolveBreakdownAccessByScene` returns `{ scene, access }`; same for element. Caller does one query.
  - Effort: S

- **`saveScreenplay` snapshots "Versione 1" _after_ writing the new content** — `apps/web/app/features/screenplay-editor/server/screenplay.server.ts:170-200`
  - What: `ensureFirstVersion(tx, ...)` runs after `update screenplays … set content = data.content`. If the screenplay never had a current version, the persisted "Versione 1" already contains the just-edited text.
  - Why it violates: design-it-twice. The invariant "Versione 1 = original content" silently flips to "Versione 1 = first persisted content" depending on save ordering. The pre-edit state is lost.
  - Suggested refactor: call `ensureFirstVersion(tx, ...)` _before_ the screenplay update, capturing the prior content.
  - Effort: S

- **`callCesare` uses string-identifier dynamic import + `any` to evade the SDK type** — `apps/web/app/features/breakdown/server/cesare-suggest.server.ts:116-152`
  - What: `const sdkModule = "@anthropic-ai/sdk"; const sdk: any = await import(/* @vite-ignore */ sdkModule);` plus 30 untyped lines of Anthropic plumbing.
  - Why it violates: tactical-tornado smell. The "lazy import to keep SDK optional" goal is real, but `any` discards every guarantee until the final `safeParse`. A malformed shape silently becomes `[]`.
  - Suggested refactor: type the dynamic import (`await import("@anthropic-ai/sdk")` works in TS), or extract a deep `cesare-anthropic-client.ts` whose only export is `runCesare(sceneText): ResultAsync<CesareSuggestion[], CesareInvalidResponseError>`.
  - Effort: M

- **`getProjectBreakdownRows` mixes aggregation + filtering + parsing in one 60-line `.map`** — `apps/web/app/features/breakdown/server/breakdown.server.ts:228-261`
  - What: builds a `Map<string, Agg>` with a `_totalOccs` sentinel, mutates `totalQuantity / scenesPresent / hasStale`, then strips the sentinel via destructure.
  - Why it violates: cognitive load — DB row shape, business aggregation, presentation filter, and sentinel hygiene all coexist in one block.
  - Suggested refactor: split into `groupOccurrencesByElement(rows): ElementAggregate[]` and `dropEmptyElements(aggs): ProjectBreakdownRow[]`. Each pure, each obviously named.
  - Effort: S

- **`cloneBreakdownToNewVersionInline` does N+1 inserts with no transaction** — `apps/web/app/features/screenplay-editor/server/versions.server.ts:346-404`
  - What: per-occurrence `db.insert(...).onConflictDoNothing()` plus per-scene state upsert, sequentially, outside the version-creation transaction.
  - Why it violates: define errors out of existence. Partial failure leaves the new version with a half-cloned breakdown, no rollback, and callers think "create version" is atomic.
  - Suggested refactor: wrap inside the same `db.transaction` as the version insert; batch with `db.insert(...).values([...])` in one round-trip.
  - Effort: M

## Worth-fixing (backlog)

- **Comment-explains-what on `ensureFirstDocumentVersion`** — `documents/server/documents.server.ts:36-44`. Trim the narration; keep only the _why_ (mirror screenplay pattern, avoid empty popover).
  - Effort: S

- **`stripYjsState` / `stripYjsSnapshot` are two near-identical generics** — `apps/web/app/server/helpers.ts:3-11`. One `stripField<K extends string>(field: K)` helper would replace both.
  - Effort: S

- **`ScreenplayView.canEdit?` and `isOwner?` are optional because mutations don't compute them** — `screenplay-editor/server/screenplay.server.ts:28-33`. Optional fields leak GET-vs-POST coupling into the type. Split into `ScreenplayView` + `ScreenplayViewWithPermissions`.
  - Effort: S

- **`SoggettoPage` route duplicates the "isOk → value, isErr → match \_tag" ladder per document** — `_app.projects.$id_.soggetto.tsx:35-65`. Extract `unwrapDocumentView(query, labels)` once a third doc type appears.
  - Effort: S

- **`screenplay.server.ts` re-implements `canEdit` membership lookup inline** while breakdown has `canEditBreakdown(ctx)`. Same logic in two abstractions; consolidate via the shared `~/server/access.ts` (see critical #3).
  - Effort: S (folds into critical #3)

- **`getBreakdownContext` builds the result inside a 30-line async-IIFE** — `breakdown.server.ts:647-682`. Promote to a named `loadBreakdownContext(db, projectId, canEdit)`; the IIFE-inside-`fromPromise` is hard to read.
  - Effort: S

- **Inconsistent error-import path** — `documents.errors.ts:1-3`, `breakdown.errors.ts:1-3`, `screenplay.errors.ts:1-3`, `screenplay-versions.errors.ts:1-3` re-export `DbError`/`ForbiddenError` from `@oh-writers/utils`, but several server files still import them directly from `@oh-writers/utils`. Pick one rule.
  - Effort: S

- **`setOccurrenceStatus` checks authorisation per-project sequentially in a `for` loop** — `breakdown.server.ts:582-591`. `Promise.all` over project IDs is one-line win.
  - Effort: S

- **`callCesare` silently maps malformed tool-use to `[]`** — `cesare-suggest.server.ts:146-151`. User sees "0 suggestions" with no signal. Surface a typed `CesareInvalidResponseError`.
  - Effort: S

- **`SubjectFooter` is the only UI primitive with feature-specific naming** — `packages/ui/src/components/SubjectFooter.tsx`. If generic, rename; if soggetto-specific, move to `features/documents/components/`.
  - Effort: S

- **`scene-numbers.ts` exports INT/EXT prefix options under a "numbers" file** — `packages/domain/src/scene-numbers.ts:11-30`. Mixed concerns; move to `scene-heading.ts` or `scene-prefix.ts`.
  - Effort: S

- **`Tag.tsx` toggles `role="button"` + `tabIndex={0}` but no Enter/Space handler** — `packages/ui/src/components/Tag.tsx:42-44`. A11y bug; module looks deeper than it is.
  - Effort: S

## Noted but acceptable

- `getDocument` / `getScreenplay` fall back to legacy `*.content` when `currentVersionId` is null — comments explain _why_ (Spec 06b backfill). Strategic comment of the right shape; keep.
- Plain-object error classes with `_tag` discriminator are unusual but documented in CLAUDE.md and survive JSON. Trade-off justified.
- `breakdown-access.ts` is a canonical deep module; small surface, real work hidden, four entry points share one core. Do not flatten.
- `getDb` looks like a shallow wrapper but exists specifically to keep `postgres` out of the client bundle (comment in `context.ts:13-16`). Keep.

## Positive patterns worth preserving

1. **`packages/domain/src/scene-numbers.ts`** — pure functions, doc comments explain _why_ (industry convention), runtime-portable. Template for new domain modules.
2. **Strategic comments above invariants** (`screenplay.server.ts:190-193`: "ensureFirstVersion runs inside the same transaction so the count + insert are atomic"). Exactly the _why-not-what_ Ousterhout requires.
3. **`breakdown-access.ts` resolver family** — replicate for documents/screenplay (see critical #3).
4. **`canEdit` / `isOwner` in `~/server/permissions.ts`** — pure, accept minimal projections (`ProjectRefForEdit`), reused. Good information hiding.
5. **Discriminated `_tag` errors + ts-pattern exhaustive matching at the route boundary** (`soggetto.tsx:35-65`) — errors-as-values done right.
