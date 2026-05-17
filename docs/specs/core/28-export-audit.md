# 28 — Export audit

Audit date: 2026-05-17.
Scope: all export-related code in `apps/web/app/features/`.

---

## Audit table

| Feature | Document type | Format | Trigger | Download mechanism | Status |
|---|---|---|---|---|---|
| documents | Logline + Synopsis + Treatment | PDF | FloatingDock "Esporta PDF" (⌘E) | `exportNarrativePdf` server fn → `base64ToBlob` + `openPdfPreview` | Working |
| documents | Soggetto | DOCX | ExportPdfModal format picker | `exportSubjectDocx` server fn → `base64ToBlob` + `downloadBlob` | Working |
| documents | Soggetto | PDF (SIAE) | ExportSiaeModal (separate trigger) | `exportSubjectSiae` server fn → `base64ToBlob` + `downloadBlob` | Working |
| screenplay-editor | Screenplay | PDF (5 formats: standard, sides, AD copy, reading copy, one-scene-per-page) | FloatingDock "Esporta PDF" (⌘E) → ExportScreenplayPdfModal | `exportScreenplayPdf` server fn → `base64ToBlob` + `openPdfPreview` | Working |
| screenplay-editor | Screenplay | Fountain (.fountain) | ToolbarMenu overflow "Esporta Fountain" | client-side `downloadTextFile` — no server round-trip | **Implemented 2026-05-17** |
| breakdown | Breakdown elements | PDF | FloatingDock "Esporta" (⌘E) → ExportBreakdownModal format picker | `exportBreakdownPdf` server fn → `base64ToBlob` + `openPdfPreview` | Working |
| breakdown | Breakdown elements | CSV | FloatingDock "Esporta" (⌘E) → ExportBreakdownModal format picker | `exportBreakdownCsv` server fn → `downloadCsv` | Working |
| schedule | Schedule / strip board | PDF | FloatingDock "Esporta" (⌘E) | `() => undefined` stub — no implementation | **GAP** |
| schedule | Schedule / strip board | Any | FloatingDock "Stampa" (⌘P) | `() => undefined` stub | **GAP** |
| budget | Budget | Any | FloatingDock "Esporta" (⌘E) | `() => undefined` stub — no implementation | **GAP** |
| shooting-plan | Shot list | Any | ShootingPlanDock "Esporta" (⌘E) | `onExport` prop not wired in ShootingPlanPage — always undefined | **GAP** |
| shooting-plan | Shot list | Any | ShootingPlanDock "Stampa" (⌘P) | `onPrint` prop not wired in ShootingPlanPage — always undefined | **GAP** |

---

## What was fixed in this session

### Screenplay Fountain export (Priority 1 — implemented)

Added a client-side `.fountain` file download to the screenplay editor's overflow menu ("Esporta Fountain"). No server round-trip: the fountain content is already in the editor's state.

Files changed:
- `apps/web/app/features/documents/lib/download.ts` — added `downloadTextFile` helper
- `apps/web/app/features/documents/index.ts` — exported `downloadTextFile`
- `apps/web/app/features/screenplay-editor/lib/export-pipeline.ts` — added `buildFountainFilename` (pure, client-safe)
- `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx` — added `onExportFountain` prop + menu item
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx` — wired `handleExportFountain` callback
- `apps/web/app/features/screenplay-editor/lib/export-pipeline.test.ts` — 3 new unit tests for `buildFountainFilename`

Filename pattern: `{screenplay-slug}-{YYYY-MM-DD}.fountain`

---

## Gaps identified (not implemented)

### Schedule PDF export (Priority 1 — deferred)

Both "Esporta" and "Stampa" in `SchedulePage.tsx` FloatingDock point to `() => undefined`. A proper implementation requires:
- A server function `exportSchedulePdf` that reads the `schedule` + `shootingDays` + `strips` rows and renders them via pdfkit
- A filename following `{project-slug}-schedule-{YYYY-MM-DD}.pdf`
- A hook `useExportSchedulePdf` mirroring `useExportScreenplayPdf`
- Wiring in `SchedulePage.tsx`

Estimated effort: M (new server function + PDF layout for strip board).

### Budget export (Priority 1 — deferred)

"Esporta" in `BudgetPage.tsx` FloatingDock points to `() => undefined`. A proper implementation requires:
- Decision on format (PDF vs CSV vs XLSX)
- A server function reading budget lines (cast, crew, production categories)
- Filename: `{project-slug}-budget-{YYYY-MM-DD}.{ext}`

Estimated effort: M–L (multi-table data model, formatting decision).

### Shooting plan export (Priority 1 — deferred)

ShootingPlanDock renders "Esporta" and "Stampa" buttons but `ShootingPlanPage.tsx` passes neither `onExport` nor `onPrint` prop — both remain undefined. A proper implementation requires:
- Defining what "export" means for a shot list (PDF shot sheet per scene, or CSV of all shots)
- A server function reading `shot_blocks` + `shot_plans` per scene
- Filename: `{project-slug}-shot-list-{YYYY-MM-DD}.pdf`

Estimated effort: M.

---

## UX placement assessment

All export triggers are consistent in terms of *where* they live:
- Primary exports (highest value for the current page) → FloatingDock primary or secondary action
- Secondary/format-specific exports → modal picker that opens from the dock
- One exception: Soggetto SIAE export is triggered from a separate button (not the main dock) — intentional because SIAE metadata is complex enough to warrant a dedicated workflow.

The ToolbarMenu overflow slot (screenplay editor) is the right place for the Fountain export: it is a power-user workflow distinct from the primary "Esporta PDF" action.

No placement refactoring is needed; the patterns are already consistent across working exports.

---

## File naming conventions

All implemented exports follow `{project-slug}-{type}-{YYYY-MM-DD}.{ext}` or a variant. The Fountain export follows `{screenplay-slug}-{YYYY-MM-DD}.fountain` since the screenplay itself provides the title (project slug not available client-side without an extra fetch).

Shared slug helpers exist in three locations — they should be consolidated into `packages/utils` if a fourth export is added:
- `apps/web/app/features/documents/lib/pdf-narrative.ts` — `slugify`
- `apps/web/app/features/documents/server/subject-export-docx.server.ts` — `slug`
- `apps/web/app/features/screenplay-editor/lib/export-pipeline.ts` — `slugify` (added this session)
