# Clean Architecture Audit — 2026-04-24

Scope: dependency rule, use-case (server fn) thinness, framework leakage, cross-feature boundaries.
Method: read-only inspection of `packages/{domain,db,ui,utils}/src` and `apps/web/app/features/*`.

## Dependency-rule violations (critical)

1. **`apps/web/app/features/projects/server/projects.server.ts:15`** — `projects` server imports a server function from another feature: `import { ensureFirstVersion } from "~/features/screenplay-editor/server/versions.server"`. Cross-feature server logic must go through `screenplay-editor/index.ts`, not via deep path. Either re-export it, or invert the dependency so screenplay-editor reacts to project creation.

2. **`apps/web/app/features/screenplay-editor/server/versions.server.ts:15-16`** — screenplay-editor server reaches into breakdown internals: `~/features/breakdown/lib/hash-scene`, `~/features/breakdown/lib/re-match`. These are pure utilities; if both features need them, they belong in `packages/domain` (or `packages/utils`), not behind a feature deep path.

3. **`apps/web/app/features/documents/server/subject-ai.server.ts:27`** — documents reaches into breakdown: `import { checkAndStampRateLimit } from "../../breakdown/lib/rate-limit"`. Rate-limit is cross-cutting infra; it should live in `apps/web/app/server/` or `packages/utils`. Symptom: lines 43-49 remap `BreakdownRateLimitedError` → `SubjectRateLimitedError` at the boundary because the module is misplaced.

4. **`apps/web/app/features/versions/components/VersionsDrawer.tsx:17,25-27`** and **`VersionsList.tsx:9`** — the `versions` feature pulls deep paths from `screenplay-editor/hooks/useVersions`, `documents/hooks/useVersions`, `documents/components/VersionCompareModal`, `projects/draft-color-palette`. Bypasses every feature's `index.ts`.

5. **`apps/web/app/features/screenplay-editor/components/SceneStaleBadge.tsx:4`** — `staleScenesOptions` deep-imported from `~/features/breakdown/hooks/useBreakdown`. Add to `breakdown/index.ts`.

6. **`apps/web/app/features/screenplay-editor/hooks/useExportScreenplayPdf.ts:4-5`** — `base64ToBlob`, `openPdfPreview` deep-imported from `~/features/documents/lib/`. These are browser-only platform helpers (Blob, window). Per CLAUDE.md "Platform Reach", file/blob ops must be wrapped at the platform layer so the Expo companion can swap them — not consumed cross-feature through `lib/`.

7. **`apps/web/app/features/breakdown/components/ExportBreakdownModal.tsx:4`** — same browser-platform leak (`~/features/documents/lib/pdf-preview`).

8. **Routes import feature internals.** `_app.projects.$id_.soggetto.tsx:18` (deep `~/features/documents/server/documents.server`), `_app.projects.$id_.breakdown.tsx:2` (`components/BreakdownPage`), `_app.projects.$id_.screenplay.versions.$vId.tsx:2-3`, the diff route `:2-4`, `_app.projects.$id_.screenplay.versions.tsx:2`, `login.tsx:3`, `register.tsx:3`. Routes should depend only on `index.ts` of the feature.

## Fat server-function handlers

9. **`features/breakdown/server/breakdown.server.ts` (683 LOC, 9 server fns)** — `getBreakdownForScene` (lines 80-189) inlines scene loading, access resolution, occurrence join, and a stale re-match loop with side-effecting `update`/`insert` inside a 30+ line IIFE (142-176). Not "thin orchestration" — it is use case + repository + L1 cache invalidation in one function. Extract `loadSceneOccurrences`, `rematchAndPersist` into `breakdown/lib/` or a `breakdown.usecases.ts`.

10. **`features/screenplay-editor/server/versions.server.ts` (624 LOC, 9 server fns)** — handlers mix DB queries, version-number arithmetic, draft-color logic, Yjs snapshot stripping, and breakdown re-match calls (#2). Needs `versions.repo.ts` + `versions.usecases.ts` split.

11. **`features/documents/server/versions.server.ts` (481 LOC, 8 server fns)** — `findDocument`/`findVersion`/`assertCanEdit` are co-located but each handler still re-implements orchestration with inline `.andThen` chains and DB writes. Borderline; worth-fixing.

12. **`features/projects/server/projects.server.ts:45-60`** — `listPersonalProjects` uses `match(rows, error => throw)` instead of `toShape`. Inconsistent with the rest of the codebase, breaks the typed-error contract for clients.

## Cross-feature boundary bypasses

(See #1, #2, #3, #4, #5, #6, #7, #8.) **Pattern:** there is no enforced lint rule preventing `~/features/X/lib/...` or `~/features/X/server/...` imports from outside feature X. **Fix:** add ESLint `no-restricted-imports` to forbid `~/features/*/!(index)` from outside the same feature.

## Framework leakage (mobile-companion readiness)

13. **`packages/domain` clean.** Only imports `zod` + intra-package. Verified — no react/tanstack/drizzle/db/ui imports. Excellent.

14. **`packages/db` clean.** Only `drizzle-orm`, `postgres`, `@noble/hashes`. No `apps/` imports. (`seed/build-pm-doc.ts:4` mentions apps/web in a comment — acceptable.)

15. **`packages/ui` clean.** Only React + co-located CSS modules. No feature imports. No domain leakage.

16. **Auth bearer-token readiness — not verified.** `requireUser` is invoked everywhere; no cookie-only dependency in `apps/web/app/server/`. Better Auth config itself was out of scope; deserves a follow-up before Expo lands.

17. **Browser-only helpers leak cross-feature** — `documents/lib/download` (`base64ToBlob`) and `documents/lib/pdf-preview` (`openPdfPreview`) consumed from `screenplay-editor` and `breakdown` (#6, #7). On Expo these break. Lift to a platform-pluggable layer.

## Noted but acceptable

- `pdfkit`, `docx` imported in `documents/server/subject-export-*.server.ts` — server-only, no client leak.
- `prosemirror-model` only mentioned in a seed comment, not imported. Fine.
- Mainline server fns consistently apply `requireUser` + `toShape` + typed errors — solid.
- `packages/utils` minimal and infrastructure-only (`Result`, errors, diff). Correct scope.

## Positive patterns

- **Package dependency rule respected.** Domain depends on nothing; db only on Drizzle; ui only on React + CSS. The hardest rule, kept clean.
- **Schemas centralized in `packages/domain/src/schemas`** — single source of truth, used by server + client.
- **Errors as plain value objects with `_tag`** — JSON-serialisable, exhaustive matching with ts-pattern. Textbook.
- **`createServerFn` is the only client→server path.** Use-case boundary is uniform.
- **Co-located feature errors + schemas + server + hooks.** High orthogonality within a feature.

---

**Top 5 to fix first:**

1. Add ESLint `no-restricted-imports` to forbid `~/features/*/!(index)` cross-feature.
2. Move `breakdown/lib/rate-limit`, `hash-scene`, `re-match` out of breakdown (shared infra).
3. Lift `documents/lib/{download,pdf-preview}` to a platform-abstracted layer for Expo readiness.
4. Split `breakdown.server.ts` and `screenplay-editor/versions.server.ts` into repo + thin handlers.
5. Fix `projects.server.ts:listPersonalProjects` to return `ResultShape` like the rest.
