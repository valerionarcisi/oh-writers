# Pragmatic Programmer Audit — 2026-04-24

Scope: `apps/web/app/features/**`, `apps/web/app/routes/**`, `packages/domain/**`, `packages/utils/**`. Read-only.

Counts: 2 `: any`, 2 `@ts-expect-error`, 4 `TODO` (no FIXME), 13 raw `if (!result.isOk)` in routes/components, 0 naked `console.*` in scope, 9 `try {` blocks, 3 `.catch()` in feature `.tsx`/`.ts`.

## Broken windows

### `any` / type escapes

- `apps/web/app/features/documents/server/subject-ai.server.ts:170,172` — `const sdk: any = await import(...)` then `(sdk.default ?? sdk) as any`. Same pattern at `apps/web/app/features/breakdown/server/cesare-suggest.server.ts:123,125`. Both leak the dynamic-import escape into module scope; should be a single typed `loadAnthropic()` helper returning the constructor.
- `apps/web/app/features/documents/lib/pdf-narrative.test.ts:2` and `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts:42` — `@ts-expect-error` for `pdf-parse/lib/pdf-parse.js`. Acceptable per `feedback-pdf-parse-import` memory, but a single `.d.ts` shim under `apps/web/app/types/` would remove both.

### TODO / FIXME

- `apps/web/app/features/documents/components/AuthorListField.tsx:1,2` — i18n + "promote to packages/ui once a second caller emerges". Tracer-bullet seam.
- `apps/web/app/features/documents/components/SubjectEditor.tsx:171,175` — `// TODO: surface via shared toast` — twice in the same `match()`. Confirms missing toast primitive (see Orthogonality below).

### try/catch masking domain errors

- `apps/web/app/features/documents/documents.schema.ts:73` — `parseOutline` swallows `JSON.parse` error and returns `emptyOutline()`. Domain conditions (corrupted persisted outline) collapse silently into "no acts". Should return `Result<OutlineContent, ParseError>` and let the caller decide.
- `apps/web/app/features/projects/title-page-pm/title-extract.ts:14` — `extractFromJson` swallows `PMNode.fromJSON` and returns `""`. Same pattern: invalid persisted ProseMirror doc treated identically to empty title.
- `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts:46` — `try/catch` around `pdfParse`, the `catch` does pattern-matching on `e.message` containing `"encrypt"` to pick `EncryptedPdfError` vs `InvalidPdfError`. Stringly-typed branching on a third-party error message is fragile; wrap with `ResultAsync.fromPromise` and inspect the error type once.
- `apps/web/app/features/screenplay-editor/hooks/useImportPdf.ts:93` — `try { base64 = await toBase64(file); } catch { setStatus error }`. `toBase64` is internal — make it return `Result` so the call site uses `match`.

### Result discrimination without ts-pattern

13 occurrences of raw `if (!result.isOk)` in route loaders / components — none use `match().exhaustive()` even though the codebase elsewhere does. Files:

- `apps/web/app/routes/_app.projects.$id.tsx:33`
- `apps/web/app/routes/_app.projects.$id_.logline.tsx:17`
- `apps/web/app/routes/_app.projects.$id_.outline.tsx:16`
- `apps/web/app/routes/_app.projects.$id_.synopsis.tsx:16`
- `apps/web/app/routes/_app.projects.$id_.treatment.tsx:16`
- `apps/web/app/routes/_app.projects.$id_.title-page.tsx:26`
- `apps/web/app/routes/_app.projects.$id_.settings.tsx:29`
- `apps/web/app/routes/_app.projects.$id_.screenplay.index.tsx:15`
- `apps/web/app/routes/_app.projects.$id_.screenplay.versions.tsx:18`
- `apps/web/app/routes/_app.projects.$id_.screenplay.versions.$vId.tsx:18`
- `apps/web/app/features/screenplay-editor/components/VersionsList.tsx:29`
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:155`
- `apps/web/app/features/screenplay-editor/hooks/useImportPdf.ts:102`

All collapse the error case into a single generic message, losing the discriminated-error advantage. The CLAUDE.md example for `match(result).with({ isErr: true, error: { _tag: ... } })` is documented but not used in routes.

### Silent error swallowing

- `apps/web/app/features/screenplay-editor/lib/pdf-screenplay.ts:38` — `await rm(dir, { recursive: true, force: true }).catch(() => undefined)`. Acceptable for tmp cleanup, but no log → impossible to detect tmp-dir leaks.
- `apps/web/app/features/screenplay-editor/lib/plugins/paginator.ts:63,160,169` — three `try { coordsAtPos } catch { continue/return fallback }`. Documented as "view hasn't painted yet" — fine, but the three sites should share one helper `safeCoordsAtPos(view, pos): Coords | null`.

## DRY violations (3+)

1. **Anthropic SDK lazy-load + system-prompt cache_control boilerplate** — `subject-ai.server.ts:161-200` and `cesare-suggest.server.ts:116-152`. Both: dynamic-import via string identifier, `(sdk.default ?? sdk) as any`, `new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"]! })`, two-block system with `cache_control: { type: "ephemeral" }`, find content block, return `.text` or empty. **Extract** `apps/web/app/features/ai/anthropic-client.ts` exposing `callHaiku({ system, fewShot, user, maxTokens, tools? }): ResultAsync<AnthropicResponse, DbError>`. Will become 3+ occurrences as soon as Cesare/budget/schedule predictions land (memory: `project-positioning-ad-and-competitors`).

2. **Mutation outcome → `{ ok, value | error }` adapter** — `SubjectEditor.tsx:159-162` and `LoglineBlock.tsx:65-68`. Identical `.mutateAsync(...).then(value => ({ ok: true, value })).catch(error => ({ ok: false, error }))` pattern, immediately followed by a `match()` on `_tag: "SubjectRateLimitedError"`. **Extract** `mutationToOutcome(promise): Promise<Outcome<T, E>>` in `packages/utils`. Currently 2; will hit 3 with the next AI feature.

3. **Document editor route page** — `_app.projects.$id_.logline.tsx`, `_app.projects.$id_.outline.tsx`, `_app.projects.$id_.synopsis.tsx`, `_app.projects.$id_.treatment.tsx` are byte-for-byte identical except the `DocumentTypes.X` constant and the route path. **Extract** `apps/web/app/features/documents/components/DocumentRoutePage.tsx({ id, type })` — each route file shrinks to 6 lines.

4. **Route loader `if (!result.isOk)` + status div** — same 3 lines `if (isLoading) ... if (!result) return null; if (!result.isOk) return <div className={styles.statusError}>...` in 4 narrative-doc route pages plus title-page/settings/screenplay-versions. Bundle into the shared component above.

5. **`window.confirm` for destructive ops** — 5 sites: `_app.projects.$id_.settings.tsx:62`, `_app.projects.$id.tsx:53`, `SubjectEditor.tsx:155`, `VersionsDrawer.tsx:234`, `ProjectBreakdownTable.tsx:128`. Native dialog is inconsistent with the design system and untestable from Playwright. **Extract** `useConfirmDialog()` in `packages/ui` returning a promise-based modal.

## Orthogonality hotspots

1. **Adding a new `DocumentType`** touches: `documents.schema.ts` (Zod), `narrative-schema.ts`, `narrative-html.ts`, `pdf-narrative.ts`, a new route file under `apps/web/app/routes/_app.projects.$id_.<type>.tsx`, `app-shell` sidebar nav, `seed/*`. The route file is pure boilerplate (DRY #3) — collapsing it is the cheapest win to bring this from ~7 files to ~5.

2. **Toast notifications** — every error path currently picks one of: `setStatus({type:"error"})` (PDF import), `setPopover({kind:"error"})` (Logline), `window.alert` (Subject), inline `<div className={styles.statusError}>` (route loaders). Five mechanisms for the same concept. Two `// TODO: surface via shared toast` confirm the missing primitive. Add `useToast()` in `packages/ui` and migrate.

3. **AI call sites** — `subject-ai`, `cesare-suggest`. Each duplicates: lazy SDK import, env-var read, prompt-cache control, mock-mode branch (`process.env["MOCK_AI"] === "true"` in `cesare-suggest.server.ts:101` mirrors `subject-ai.server.ts`'s mock path). Centralizing DRY #1 also centralizes the mock toggle.

4. **Persistence stripping (`stripYjsState` / `stripYjsSnapshot`)** is correctly centralized in `apps/web/app/server/helpers.ts` and used by 4 server files — positive baseline; AI-client centralization should follow the same template.

5. **`safeCoordsAtPos` helper** — `paginator.ts` lines 63, 160, 169 are 3 occurrences inside a single file. Local extraction, low-cost orthogonality win.

## Domain-language drift

- Italian-language UI strings inline in `SubjectEditor.tsx:172,176` (`"Troppe richieste — riprova tra un istante."`, `"Generazione fallita. Riprova."`) and `LoglineBlock.tsx:81` (`"Impossibile estrarre la logline."`) live next to English defaults from `defaultLabels`. Memory `feedback-i18n-it-en` requires bilingual via i18n with English in code. These hardcoded IT strings should move into the labels record the rest of the component already accepts.
- `ProjectBreakdownTable.tsx:128` — `"Archiviare questo elemento?"` (IT) inside a generic confirm. Same drift.
- `AuthorListField.tsx` — TODO acknowledges defaults are English while callers pass IT overrides. Symptom of the missing i18n layer.

## Noted but acceptable

- All 9 `try {` blocks in scope are either swallowing-with-fallback in render-path code (paginator coords) or wrapping third-party SDKs at a clear boundary (pdf-parse, ProseMirror's `fromJSON`). The four flagged above (DRY #1, schema parsers, pdf-import, useImportPdf) are the ones masking domain Result errors.
- `process.env["KEY"]!` non-null assertions for `ANTHROPIC_API_KEY` are acceptable per "fail fast on programming errors" — but only after centralizing (DRY #1) so the read happens once at module init with a real `throw new Error(...)`, not per call.
- `console.*` is absent in scope; logging belongs in `packages/db/src/seed/*` (out of scope) — clean.

## Positive patterns

- 56 `match(...)` usages across 17 files in `features/**` — exhaustive matching is the rule, not the exception. The 13 raw `if (!result.isOk)` in routes are the visible exception.
- `requireUser()` (256 calls across 31 files) and `getDb()` are uniformly entry-pointed — auth/permission enforcement is orthogonal to feature logic.
- `stripYjsState` / `stripYjsSnapshot` centralized in `apps/web/app/server/helpers.ts` — model citizen for "centralize, don't scatter".
- Domain errors are plain value objects with `_tag` (per CLAUDE.md), enabling JSON-safe `ResultShape` round-trips.
- Feature folders are self-contained; cross-feature imports go through `index.ts` barrels (verified via `~/features/documents` style).
