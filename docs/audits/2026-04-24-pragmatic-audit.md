# Pragmatic Programmer Audit — 2026-04-24 (post-cleanup)

Scope: `apps/web/app/features/**`, `apps/web/app/routes/**`, `packages/domain/**`, `packages/utils/**`. Read-only.

Counts: 0 `: any`, 2 `@ts-expect-error`, 2 `TODO` (no FIXME), 1 raw `if (!result.isOk)` in scope, 0 `console.*`, 9 `try {` blocks, 3 `.catch()` (2 outcome adapters + 1 tmp-cleanup). 5 DRY clusters carry over.

## Broken windows

### `any` / type escapes

- Resolved across the board. No `: any` in scope. Both prior offenders (`subject-ai.server.ts`, `cesare-suggest.server.ts`) now route through the typed `apps/web/app/features/ai/anthropic-client.ts` (`loadAnthropic` returns `AnthropicConstructor`).
- `apps/web/app/features/documents/lib/pdf-narrative.test.ts:2` and `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts:42` still use `@ts-expect-error` for `pdf-parse/lib/pdf-parse.js`. Acceptable per `feedback-pdf-parse-import` memory; a single `.d.ts` shim under `apps/web/app/types/` would still remove both.

### TODO / FIXME

- `apps/web/app/features/documents/components/AuthorListField.tsx:1,2` — i18n + "promote to packages/ui once a second caller emerges". Tracer-bullet seam, unchanged from prior audit.
- The two `// TODO: surface via shared toast` in `SubjectEditor.tsx` are gone — toast primitive now exists (`useToast`, see Positive patterns).

### try/catch masking domain errors

- `apps/web/app/features/documents/documents.schema.ts:73` — `parseOutline` still swallows `JSON.parse` and returns `emptyOutline()`. Corrupted persisted outline is indistinguishable from "no acts". Should return `Result<OutlineContent, ParseError>`. Unchanged.
- `apps/web/app/features/projects/title-page-pm/title-extract.ts:14` — `extractFromJson` swallows `PMNode.fromJSON` and returns `""`. Same shape as above. Unchanged.
- `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts:46-55` — `try/catch` around `pdfParse`, branches on `e.message` containing `"encrypt"` to pick `EncryptedPdfError` vs `InvalidPdfError`. Stringly-typed branch on a third-party error message is fragile; wrap with `ResultAsync.fromPromise` and inspect the error type once. Unchanged.
- `apps/web/app/features/screenplay-editor/hooks/useImportPdf.ts:94` — `try { base64 = await toBase64(file); } catch { setStatus error }`. `toBase64` is internal — make it return `Result`. Unchanged.
- `packages/domain/src/scene-numbers.ts:280-287` — `try { fillGap } catch (e) { if (e instanceof ResequenceConflictError) return err; throw e; }`. Mixes domain Result with thrown sentinel; `fillGap` should itself return `Result<number[], ResequenceConflictError>` so the orchestrator stays exception-free.

### Result discrimination without ts-pattern

Down from 13 to 1 in scope: `apps/web/app/features/projects/components/DraftMetaBadge.tsx:12` — `if (!result || !result.isOk) return null;`. Acceptable (it's "no badge on either error or loading"), but writing it as `match` would mirror the rest of the codebase. All route loaders flagged previously now go through `DocumentRoutePage`/equivalents.

### Silent error swallowing

- `apps/web/app/features/screenplay-editor/lib/pdf-screenplay.ts:38` — `await rm(dir, …).catch(() => undefined)`. Acceptable for tmp cleanup but still no log → tmp-dir leaks would go unnoticed. Unchanged.
- `apps/web/app/features/screenplay-editor/lib/plugins/paginator.ts:63,160,169` — three `try { coordsAtPos } catch { …fallback }` inside one file. Documented as "view hasn't painted yet" — fine, but the three sites should still share one helper `safeCoordsAtPos(view, pos): Coords | null`. Unchanged.

## DRY violations (3+)

1. **Mutation outcome → `{ ok, value | error }` adapter** — `SubjectEditor.tsx:172-175` and `LoglineBlock.tsx:65-68`. Identical `.mutateAsync(...).then(value => ({ ok: true, value })).catch(error => ({ ok: false, error }))` followed by a `match()` on `_tag`. Currently 2 occurrences; one more AI mutation will hit the 3+ threshold. Extract `mutationToOutcome` in `packages/utils`.
2. **Hardcoded IT toast/error fallback strings** — `SubjectEditor.tsx:185` (`"Troppe richieste — riprova tra un istante."`), `LoglineBlock.tsx:81` (`"Impossibile estrarre la logline."`), `SubjectEditor.tsx:163,165` (`"Sostituire la sezione?"`, `"Sostituisci"`/`"Annulla"`). Should be in the labels record the rest of the component already accepts. See Domain-language drift.
3. **Coords-fallback in paginator** — `paginator.ts:63,160,169` are 3 occurrences inside one file. Extract `safeCoordsAtPos` locally.
4. **JSON-parse-then-fallback-to-empty** — `documents.schema.ts:73` (`parseOutline`) and `title-extract.ts:14` (`extractFromJson`) both wrap a parser in `try { … } catch { return EMPTY }`. Two occurrences only, but the shape is identical: turn into `parseOrEmpty<T>(raw, parser, empty)` once a third caller appears (likely with the next persisted PM doc — synopsis or treatment).
5. _(Cleared)_ — Anthropic-SDK boilerplate, `window.confirm` calls, document-route boilerplate, and route-loader `if (!result.isOk)` blocks all consolidated; not a DRY hotspot anymore.

## Orthogonality hotspots

1. **AuthorListField stuck at "tracer bullet"** — two TODOs at the top still acknowledge: defaults are English, callers pass IT overrides, component will move to `packages/ui` "once a second caller emerges". The seam is real; either commit by adding a second caller and promoting, or delete the TODOs and accept feature-locality.
2. **Toast vs. inline status vs. popover** — toast primitive (`useToast`) and `useConfirmDialog` are now in `packages/ui` and used by 7 sites. Remaining inconsistency: `useImportPdf.ts:97-105` still uses an inline `setStatus({type:"error"})` state machine rather than the shared toast for "Could not read the file." Migrate the import-error path to `showToast` for cross-feature consistency.
3. **`scene-numbers.ts:280-287`** — `fillGap` throws `ResequenceConflictError` while the surrounding orchestrator already returns `Result`. The boundary between thrown and returned errors leaks into a domain-layer file. Pull the error-as-value contract all the way down.
4. **PDF-parse error classification** — `pdf-import.server.ts` does string-match on `e.message`. The `EncryptedPdfError` vs `InvalidPdfError` distinction is a domain-relevant outcome of an external boundary; encapsulate `pdfParse` in a `parsePdf(buffer): ResultAsync<string, EncryptedPdfError | InvalidPdfError>` adapter and keep the server function clean.
5. _(Positive baseline)_ — `DocumentRoutePage` (`apps/web/app/features/documents/components/DocumentRoutePage.tsx`) collapses 4 route files to 6 lines each. Adding a fifth narrative document type is now a one-route-file change. Model citizen for orthogonality.

## Domain-language drift

- `apps/web/app/features/documents/components/SubjectEditor.tsx:163-167,185` — IT inline strings (`"Sostituire la sezione?"`, `"Sostituisci"`, `"Annulla"`, `"Troppe richieste — riprova tra un istante."`) hardcoded next to English `defaultLabels`. Same anti-pattern flagged previously, partially migrated to labels but rate-limit + confirm still inline.
- `apps/web/app/features/documents/components/LoglineBlock.tsx:81` — `"Impossibile estrarre la logline."` still inline despite a `LoglineBlockLabels` record being threaded through the component.
- `AuthorListField.tsx` — TODO confirms defaults-EN-callers-IT split. Symptom of the missing i18n layer (memory: `feedback-i18n-it-en`).

## Noted but acceptable

- `@ts-expect-error` × 2 on `pdf-parse/lib/pdf-parse.js` — required by the import-path workaround documented in memory.
- `pdf-screenplay.ts:38` — tmp-dir `.catch(() => undefined)`. Best-effort cleanup; not a domain error.
- 3 `try` blocks in `paginator.ts` — render-path defensive code for a third-party library that throws synchronously; would benefit from extraction (DRY #3) but not from a Result wrap.
- `process.env["ANTHROPIC_API_KEY"]` read in `anthropic-client.ts:91` with a `throw` on missing — correct fail-fast for a programming/env error, centralized to one place.

## Positive patterns

- **Anthropic SDK centralization** — `apps/web/app/features/ai/anthropic-client.ts` exposes a typed `callHaiku(...): ResultAsync<HaikuResult, AnthropicError>` plus `extractText`/`extractToolUse` helpers. Removed both `: any` escapes flagged previously and made future AI features (Cesare, budget, schedule) drop-in. Deep module: small interface, real value inside.
- **Route consolidation** — 4 narrative-document route files (`logline`, `outline`, `synopsis`, `treatment`) are now 10-line shells calling `DocumentRoutePage`. Killed DRY #3 + most of the raw `if (!result.isOk)` cluster from the prior audit.
- **`useToast` + `useConfirmDialog` in `packages/ui`** — replaces 5 sites of `window.confirm`/`window.alert` and the two TODO-toast comments. Promise-based confirm is Playwright-testable.
- **Feature barrels intact** — cross-feature imports go through `index.ts`; no reach-around imports detected.
- **`requireUser` / `getDb` / `stripYjsState`** — still uniformly used; orthogonality of auth and persistence is preserved.

## Resolution of the prior audit's top 5

1. **Anthropic SDK `: any` × 4** — RESOLVED via `features/ai/anthropic-client.ts`.
2. **13 raw `if (!result.isOk)` in routes** — RESOLVED (down to 1 in scope, in `DraftMetaBadge`, and intentional).
3. **Document-route file boilerplate (DRY #3)** — RESOLVED via `DocumentRoutePage`.
4. **`window.confirm` × 5 (DRY #5)** — RESOLVED via `useConfirmDialog` from `packages/ui`.
5. **Two `TODO: surface via shared toast`** — RESOLVED via `useToast`.

Carry-overs: schema/title-page swallow-and-return-empty, paginator `safeCoordsAtPos`, pdf-import string-match, `useImportPdf` `toBase64` try/catch, AuthorListField TODOs, IT string drift in `SubjectEditor`/`LoglineBlock`, and the new `scene-numbers.ts` thrown-error-in-Result boundary.
