# Ousterhout Audit — 2026-04-24 (post-cleanup)

Re-run after the `~/server/access.ts` extraction sweep. The previous audit's
critical #1 (NotFound mistagging), #3 (5x duplicated access-prelude),
#7 (saveScreenplay ordering), #8 (cesare `any`-typed dynamic import) and
#10 (cloneBreakdown outside transaction) have been **resolved**.

What's left is mostly the second wave: parallel access helpers that did
not migrate to the shared one, and validation/aggregation knots that the
earlier pass did not touch.

---

## Critical findings (fix before next feature)

- **Wrapper-itis / pull complexity downward — `assertCanEdit` and `assertCanRead` were not migrated to `requireProjectAccess`** — `apps/web/app/features/documents/server/versions.server.ts:45-90`
  - What: two 22-line helpers, identical except for the final predicate (`canEdit(...)` vs `isPersonalOwner || membership !== null`). They re-implement the project-load + membership-load chain that `~/server/access.ts:33-100` already encapsulates with both `view` and `edit` levels.
  - Why it violates: shallow modules + duplication of a logic chain that already has an obvious owner. Every future document mutation has to remember to call one of these instead of the canonical helper.
  - Suggested refactor: delete both. Replace each call site with `requireProjectAccess(db, doc.projectId, "view"|"edit")`. Map `ProjectNotFoundError → DocumentNotFoundError` at the handler boundary as `documents.server.ts` already does.
  - Effort: S

- **Define errors out of existence — per-type content cap is still imperative-checked after Zod** — `apps/web/app/features/documents/server/documents.server.ts:212-225`
  - What: `SaveDocumentInput` validates a generic `content: string`; the per-type max (`ContentMaxByType[doc.type]`) is enforced inside the handler with a hand-rolled `ValidationError`. This was flagged in the previous audit and survives.
  - Why it violates: validation is split across two layers; new doc types must remember to extend both.
  - Suggested refactor: discriminated `SaveDocumentInput` keyed on `type`, each branch carrying its own `z.string().max(MAX_BY_TYPE[type])`. The runtime check becomes unreachable and `ValidationError` can be removed from the error union.
  - Effort: M

- **Different things, different abstractions — `breakdown-access.ts` is now a near-clone of `~/server/access.ts`** — `apps/web/app/features/breakdown/server/breakdown-access.ts:1-60` vs `apps/web/app/server/access.ts:33-100`
  - What: both modules load the project, load the membership, and compute owner-vs-role flags. `BreakdownAccess` exposes `{projectId, projectTitle, projectSlug, isPersonalOwner, teamRole}`; `ProjectAccess` exposes `{user, project, membership, role, isPersonalOwner}` — same job, different shape, different name.
  - Why it violates: classic two-name-for-one-concept. Permission logic now lives in two places; whoever updates one will forget the other.
  - Suggested refactor: have `breakdown-access.ts` delegate to `requireProjectAccess` and project the result into the `BreakdownAccess` shape; or drop `BreakdownAccess` entirely and let breakdown server fns consume `ProjectAccess` directly.
  - Effort: M

- **Information leakage — `ScreenplayView.canEdit?` and `isOwner?` are optional because mutation responses don't compute them** — `apps/web/app/features/screenplay-editor/server/screenplay.server.ts:24-29`
  - What: optional booleans on the view type because `saveScreenplay` returns the raw row without permission flags while `getScreenplay` adds them.
  - Why it violates: the type leaks the GET-vs-POST distinction. Callers must treat `canEdit` as `boolean | undefined` everywhere even though it's always defined in the GET path.
  - Suggested refactor: split into `ScreenplayView` (raw row, minus yjs) and `ScreenplayViewWithPermissions = ScreenplayView & { canEdit; isOwner }`; mutations return the former, GETs the latter. Same split that `DocumentView` / `DocumentViewWithPermission` already does cleanly (`documents.server.ts:31-35`).
  - Effort: S

- **Cognitive load — `getProjectBreakdownRows` mixes aggregation, sentinel hygiene, and presentation filter in one 35-line `.map`** — `apps/web/app/features/breakdown/server/breakdown.server.ts:228-261`
  - What: builds a `Map<id, Agg>` with a `_totalOccs` sentinel field, mutates `totalQuantity / scenesPresent / hasStale` in place, then strips the sentinel via destructuring.
  - Why it violates: DB row shape, business rollup, presentation filter, and "drop the helper field" all coexist in a single block. Hard to test in isolation; impossible to reuse the rollup.
  - Suggested refactor: split into `groupOccurrencesByElement(rows): ElementAggregate[]` (pure rollup) and `dropEmptyElements(aggs): ProjectBreakdownRow[]` (filter + sentinel strip). Each pure, each obviously named.
  - Effort: S

- **Duplicated `requireUser()` calls + screenplay access re-fetches what `requireProjectAccess` already loaded** — `apps/web/app/features/screenplay-editor/server/versions.server.ts:137-153, 187-191, 219-222`
  - What: every handler does `await requireUser()` and then enters `resolveScreenplayAccess`, which calls `requireProjectAccess`, which **also** awaits `requireUser()` (`access.ts:94`). Net effect: two session reads per request.
  - Why it violates: pull complexity downward. `requireProjectAccess` already returns `{ user, project, membership }` — handlers should consume it instead of repeating the work.
  - Suggested refactor: have `resolveScreenplayAccess` return `{ screenplay, access }` and stop calling `requireUser()` in the handler bodies. Same applies to `documents/versions.server.ts` after critical #1 is fixed.
  - Effort: S

- **Tag a11y — `role="button"` + `tabIndex={0}` without keyboard handler** — `packages/ui/src/components/Tag.tsx:38-45`
  - What: clickable tag declares the button role but `onClick` only binds to the mouse — no `onKeyDown` for Enter/Space.
  - Why it violates: define-errors-out-of-existence for accessibility — the contract advertises a button to assistive tech but doesn't honor it.
  - Suggested refactor: add `onKeyDown` that fires `onClick` on Enter/Space, or render a real `<button type="button">` when `onClick` is set. Same fix for any other component using the same pattern.
  - Effort: S

## Worth-fixing (backlog)

- **`stripYjsState` and `stripYjsSnapshot` are two near-identical generics** — `apps/web/app/server/helpers.ts:3-11`. One `stripField<K>(field: K)` helper covers both. Effort: S.

- **`cesare-suggest.callCesare` silently maps malformed tool-use to `[]`** — `apps/web/app/features/breakdown/server/cesare-suggest.server.ts:136-139`. User sees "0 suggestions" with no signal that the model misbehaved. Surface a typed `CesareInvalidResponseError`. Effort: S.

- **`SubjectFooter` is the only UI primitive with feature-specific naming in `packages/ui`** — `packages/ui/src/components/SubjectFooter.tsx`. Rename to a generic primitive or move into `features/documents/components/`. Effort: S.

- **`scene-numbers.ts` mixes scene-number formatting with INT/EXT prefix options** — `packages/domain/src/scene-numbers.ts`. Two concerns, one file; the prefix list belongs next to `scene-heading.ts`. Effort: S.

- **`SoggettoPage` route duplicates the "isOk → value, isErr → match \_tag" ladder per document** — `apps/web/app/routes/_app.projects.$id_.soggetto.tsx:35-65`. Will become 3x once `treatment` joins; extract `unwrapDocumentView(query, labels)` then. Effort: S.

- **`getBreakdownContext` builds the result inside an unnamed async-IIFE-inside-`fromPromise`** — `apps/web/app/features/breakdown/server/breakdown.server.ts:~647`. Hoist to a named `loadBreakdownContext(db, projectId, canEdit)` for readability. Effort: S.

- **`setOccurrenceStatus` checks authorisation per-project sequentially** — `apps/web/app/features/breakdown/server/breakdown.server.ts`. `Promise.all` over project IDs is a one-line win. Effort: S.

- **Mixed import paths for shared errors** — several feature error files re-export `DbError` / `ForbiddenError` from `@oh-writers/utils`, but several server files still import them straight from `@oh-writers/utils`. Pick one rule per feature. Effort: S.

- **Comment narration above `ensureFirstDocumentVersion`** — `apps/web/app/features/documents/server/documents.server.ts:37-44`. Currently restates _what_ the function does; trim to the _why_ (mirror screenplay pattern, avoid empty popover). Effort: S.

- **Shallow UI primitives still rely on inline `[styles.x, ...].filter(Boolean).join(" ")`** — `packages/ui/src/components/{Avatar,Badge,Button,Input,Tag,…}.tsx`. Extract a 3-line `cx(...args)` to `packages/ui/src/utils.ts`; do not collapse the components. Effort: S.

## Noted but acceptable

- `~/server/access.ts` is the canonical deep module that the previous audit asked for. Small surface (`requireProjectAccess(db, projectId, level)`), real work hidden, three not-found tags preserved. Do not flatten.
- `getDocument` / `getScreenplay` falling back to `*.content` when `currentVersionId` is null — comments cite Spec 06b backfill. Strategic _why_ comments of the right shape.
- Plain-object error classes with `_tag` discriminator — unusual but documented in `CLAUDE.md` and survive JSON round-trip.
- `getDb` looks like a shallow wrapper but exists specifically to keep `postgres` out of the client bundle (comment in `context.ts`). Keep.
- `saveScreenplay` (`screenplay.server.ts:148-178`) now wraps `ensureFirstVersion` + the screenplay update in one transaction with a strategic _why_ comment — the previous audit's invariant concern is addressed even though the call still runs after the update; the comment justifies the trade-off.

## Positive patterns worth preserving

1. **`~/server/access.ts`** — single deep entry point for the project-access prelude. Replaces five inline copies. Replicate this pattern when a similar repeated chain shows up.
2. **Discriminated `_tag` errors + `ts-pattern` exhaustive matching at the route boundary** (`soggetto.tsx:35-65`) — errors-as-values done right.
3. **`canEdit` / `isOwner` in `~/server/permissions.ts`** — pure, accept minimal projections, reused by `access.ts`. Good information hiding.
4. **Strategic comments above invariants** — e.g. `screenplay.server.ts:169-172` ("ensureFirstVersion runs inside the same transaction so the count + insert are atomic"). Exactly the _why-not-what_ shape Ousterhout asks for.
5. **`packages/domain/src/scene-numbers.ts`** — pure functions, runtime-portable, doc comments explain _why_. Template for new domain modules.
