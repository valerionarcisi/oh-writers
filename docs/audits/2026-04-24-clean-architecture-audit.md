# Clean Architecture Audit — 2026-04-24 (post-cleanup)

Scope: dependency rule, server-fn (use-case) thinness, framework leakage, cross-feature
boundaries (now lint-enforced). Method: read-only inspection of `packages/{domain,db,ui,utils}`,
`apps/web/app/features/*`, `apps/web/app/routes/*`, `eslint.config.js`.

## Status of prior findings

- #1 projects → screenplay-editor deep import: **RESOLVED** (no `~/features/*/server` imports
  remain outside the owning feature; verified by Grep).
- #2 screenplay-editor → breakdown/lib (`hash-scene`, `re-match`): **PARTIALLY RESOLVED**.
  `hashText` moved to `@oh-writers/utils` (correct shared infra). `re-match` is still
  `apps/web/app/features/breakdown/lib/re-match.ts` and is now used only inside breakdown
  (`breakdown.server.ts:29`); no cross-feature deep import remains.
- #3 documents → breakdown rate-limit: **RESOLVED**. Rate-limit lives at
  `apps/web/app/server/rate-limit.ts`.
- #4 versions feature deep imports / #5 SceneStaleBadge / #6-#7 cross-feature
  `documents/lib/{download,pdf-preview}`: **RESOLVED at boundary level**. All consumers
  now import via `~/features/documents` (the barrel re-exports `base64ToBlob`,
  `openPdfPreview`). See finding 1 below for the residual platform-leak concern.
- #8 routes → feature internals: **RESOLVED**. Every `apps/web/app/routes/*` import
  goes through `~/features/<name>` barrels (verified).
- #12 `listPersonalProjects` not using `toShape`: **NOT RESOLVED**
  (`projects.server.ts:46-62`).
- ESLint cross-feature rule: **NEW** — `eslint.config.js:20-29` defines `featureZones`
  and applies `import-x/no-restricted-paths`. Coverage = `routes/**`, `server/**`,
  and other features' files. Solid.

## Dependency-rule violations (critical)

1. **Browser-only platform helpers exported through a domain feature barrel** —
   `apps/web/app/features/documents/index.ts:46-47` exports `base64ToBlob`,
   `downloadBlob`, `openPdfPreview`. Consumed by `screenplay-editor/hooks/useExportScreenplayPdf.ts:4`
   and `breakdown/components/ExportBreakdownModal.tsx:4`. Per CLAUDE.md "Platform Reach"
   these are platform-pluggable concerns (web Blob/window vs. Expo
   `expo-file-system`); they should not live in the `documents` use-case feature.
   Lift to `apps/web/app/platform/` or a `@oh-writers/platform-web` package so the
   Expo companion can swap them. Boundary is now lint-clean, but the architectural
   smell persists.

## Fat server-function handlers

2. **`features/breakdown/server/breakdown.server.ts` (683 LOC, 9 server fns)** —
   `getBreakdownForScene` (lines 75-189) still inlines scene loading, access
   resolution, occurrence join, AND a stale re-match loop with side-effecting
   `update`/`insert` inside a 30+ line IIFE (142-176). Use case + repository +
   cache invalidation in one function. Extract `loadSceneOccurrences` and
   `rematchAndPersist` into `breakdown/lib/` or a `breakdown.usecases.ts`. Same
   finding as previous audit, **NOT RESOLVED**.

3. **`features/screenplay-editor/server/versions.server.ts` (559 LOC, 9 server fns)** —
   handlers still mix DB queries, version-number arithmetic, draft-color logic,
   Yjs snapshot stripping. Slimmer than before (was 624) but still warrants a
   `versions.repo.ts` + thin handlers split. **PARTIALLY ADDRESSED**.

4. **`features/documents/server/versions.server.ts` (481 LOC, 8 server fns)** —
   `findDocument`/`findVersion`/`assertCanEdit` co-located but each handler
   re-implements orchestration with inline `.andThen` chains and DB writes.
   Borderline; consolidate into a single `loadDocumentForEdit` use-case helper
   to define errors out of existence at the handler level (Ousterhout #4).
   **UNCHANGED** since previous audit.

5. **`features/projects/server/projects.server.ts:46-62` and `:73-87`** —
   `listPersonalProjects` and `listTeamProjects` use `match(rows, error => throw)`
   instead of returning `ResultShape`. Inconsistent with the rest of the codebase
   and breaks the typed-error contract for clients. **NOT RESOLVED.**

## Cross-feature boundary bypasses (post lint rule)

None. Verified with multiple Grep passes:

- `~/features/<X>/<server|hooks|lib|components>/...` → 0 matches outside the
  owning feature.
- All routes import only `~/features/<name>` barrel paths.
- The new ESLint zone (`eslint.config.js:20-29`) covers
  `apps/web/app/features/!(<X>)/**`, `apps/web/app/routes/**`, and
  `apps/web/app/server/**`, except the `index.ts` barrel. Adequate.

**Coverage gap (worth fixing):** the rule does NOT cover `tests/**` or
`apps/web/app/components/**`. Low risk today but easy to add as a pre-emptive guard.

## Framework leakage (mobile-companion readiness)

6. **`packages/domain` clean.** Verified: every file imports only `zod` or
   intra-package `./*.js`. No React, TanStack, Drizzle, Monaco, browser globals.
   Excellent.

7. **`packages/db` clean.** Only `drizzle-orm`, `postgres`, `@noble/hashes`. No
   `apps/` imports.

8. **`packages/ui` clean.** Only React + co-located CSS modules. No feature imports.

9. **`packages/utils` minimal and infra-only** (`Result`, errors, diff, hash).
   Correct scope.

10. **Auth bearer-token readiness — NOT VERIFIED.** Out of scope of this pass; deserves
    a follow-up audit before Expo lands (see CLAUDE.md "Never hard-couple auth to
    cookies").

11. **Browser-only helpers leak via feature barrel** — see finding 1. Resolving
    it removes the last meaningful obstacle to a mobile companion consuming
    server fns directly.

## Noted but acceptable

- `pdfkit`, `docx` imported in `documents/server/subject-export-*.server.ts` —
  server-only, no client leak.
- `breakdown/lib/re-match.ts` and `breakdown/lib/permissions.ts` are now
  internal-only to breakdown; correct.
- `apps/web/app/server/rate-limit.ts` is shared infra at the right level.
- Feature barrels are tightly scoped (≤74 LOC) — `documents` 48, `screenplay-editor`
  74, `breakdown` 29.

## Positive patterns

- **Dependency rule fully respected at the package level.** Domain → nothing,
  db → only Drizzle/postgres, ui → only React.
- **Single source of truth for schemas** in `packages/domain/src/schemas`.
- **Errors as plain `_tag` value objects** — JSON-serializable, exhaustively
  matchable with ts-pattern.
- **`createServerFn` is the only client→server path.**
- **ESLint cross-feature lint rule** now codifies the architectural boundary —
  a major upgrade from the previous audit.
- **All routes go through feature barrels** — verified by Grep.
- **Cross-feature deep imports = 0** post lint enforcement.
