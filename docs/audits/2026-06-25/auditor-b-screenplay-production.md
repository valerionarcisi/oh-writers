# Auditor B — Screenplay + Production bug hunt (2026-06-25)

Mandate: screenplay editor + production features (screenplay/Fountain, breakdown/spoglio,
budget, schedule, locations, shot-plan/blocking, all exports).
Method: parallel code read of every feature folder + live drive (web on :3011, ws :1235,
MOCK_AI=false, seed projects "NON FA RIDERE" `00000000-0000-4000-a000-000000000012` and
"Scienze Naturali" `6a435e2a-875f-4c2b-945a-c677bb796b13`).

Out of scope / already known (NOT re-reported): #46/#51/#53 screenplay-dialogue-formatting
(character cue + dialogue rendered inline as one block — observed live but already tracked),
#50, #57, #58, #59, and all Cesare/shell items #35/#36/#42/#44/#45/#47/#48/#49/#52/#54/#55/#56
(Auditor A).

`✅ LIVE-VERIFIED` = reproduced/observed in the running app this session.
`◆ CODE-PROVEN` = confirmed by reading the exact source (cited file:line), not yet driven live.

---

## ALTO

### B1. Budget CSV/PDF export omits the entire Cast and Crew sections — exported budget is ~empty while screen shows €107K ✅ LIVE-VERIFIED

`apps/web/app/features/budget/server/budget-export.server.ts:38-52` (CSV) and `:92-101` (PDF)
load **only** `budgetLines` (`db.query.budgetLines.findMany`). They never query `budgetCast` or
`budgetCrew`, and never add contingency. The exporters (`budget-export-csv.ts`, `budget-export-pdf.ts`)
operate solely on those lines.

Proof (live, project "NON FA RIDERE", `/budget`): on-screen TOTALE STIMATO **106.920 €**, of which
**CAST €43K (48 ruoli)** + **TROUPE/crew €54K (56 ruoli)** = ~91% of the budget; **PRODUZIONE
(budget lines) = 0 €**. Therefore the exported CSV/PDF "GRAND TOTAL" is essentially €0 / empty
while the app shows a €107K budget. For a tool whose budget export is a deliverable to producers,
this is a silent, total content-loss bug. Violates the Export-WYSIWYG rule.

### B2. `docToFountain` silently drops top-level transitions (e.g. opening `FADE IN:`) — content loss on every export/round-trip ◆ CODE-PROVEN

`apps/web/app/features/screenplay-editor/lib/doc-to-fountain.ts:41-42`:

```ts
doc.forEach((scene) => {
  if (scene.type.name !== "scene") return;   // top-level `transition` nodes silently skipped
```

The schema explicitly allows them — `lib/schema.ts:6` `doc: { content: "(scene | transition)+" }`,
and `transition` is documented (`schema.ts:112`) as "Also used as a top-level node for transitions
outside a scene (e.g. FADE IN:)". `fountainToDoc` deliberately emits leading transitions as direct
doc children (`fountain-to-doc.ts:181` `leadingTransitions`, merged at `:191`). So any screenplay
that opens on a transition loses that transition on every serialize (export to PDF/Fountain,
normalize, version snapshot, diff). Untested: `doc-to-fountain.test.ts` only covers a transition
_inside_ a scene.

### B3. Per-scene cost loads breakdown elements from ALL screenplay versions and counts user-rejected ("ignored") ones — inflated per-scene estimate ◆ CODE-PROVEN

`apps/web/app/features/breakdown/server/breakdown-cost.server.ts:112-136` (`loadElementsForScene`):
the occurrence join filters only `projectId`, `sceneId`, `archivedAt IS NULL`. It does **not** filter
`screenplayVersionId` and does **not** exclude `cesareStatus = "ignored"`.
Every canonical read path does both — `breakdown.server.ts:136-138`
(`eq(...screenplayVersionId...)` + `ne(cesareStatus, "ignored")`). The occurrences table carries both
columns (`packages/db/src/schema/breakdown*.ts:79,87`). Result: per-scene cost over-counts stale
prior-version occurrences and items the user explicitly dismissed → inflated money figure.

### B4. Schedule PDF drops rows for any single shooting day too tall for one page — scenes vanish from the printed schedule ◆ CODE-PROVEN

`apps/web/app/features/schedule/lib/export-pdf.ts:122-158`. The only page-break check is per-day
(`:127`). The inner strip loop (`:152-155`) writes each row at an absolute `rowY` with no per-row
bounds check; PDFKit does not auto-paginate absolute `.rect()/.text()` placement. A day with many
scenes (common) overflows the page and rows past the bottom margin are drawn off-page / lost.

### B5. Budget PDF line items use absolute positioning and never paginate — items/subtotals/grand-total render off page 1 ◆ CODE-PROVEN

`apps/web/app/features/budget/lib/budget-export-pdf.ts:94-115` (`writeLineItem`), subtotal/grand-total
rows, all use `doc.text(value, MARGIN, doc.y, …)` with no `doc.addPage()` guard in the build loop
(`:174-219`). pdfkit only auto-paginates flowing text, not absolute `.text(x,y)`. A budget with enough
lines overflows page 1; the header grand-total still prints, so the doc looks complete but the line
detail is missing. (Compounds with B1.)

### B6. Narrative PDF cover is built from scalar fields, not `titlePageDoc` (Export-WYSIWYG violation) ◆ CODE-PROVEN

`apps/web/app/features/documents/server/documents.server.ts:363-371` passes only
`author: project.titlePageAuthor` + `draftDate` to `buildNarrativePdf`; `titlePageDoc` is never read.
`lib/pdf-narrative.ts:55-78` then renders the cover from those scalars. The screenplay export does it
correctly (`screenplay-export.server.ts:149-164` via `prependTitlePageToFountain`); the narrative PDF
export was never brought in line with the "frontespizio = titlePageDoc, not the 7 scalars" rule.

### B7. Budget day/week views drop the 1.2× fiscal-regime multiplier on cast & crew — per-day / weekly costs undercount by 20% ◆ CODE-PROVEN

Overview uses `resourceTotal` with the `privato` multiplier applied (`crew-roles.ts:148-168`), but
`getDayCosts` / `getBudgetWeeklyOverview` compute raw `dayRate*days + meal + accommodation`
(`budget/server/budget.server.ts:1265-1268,1282-1289,1798-1801,1815-1822`). For `privato` resources
the per-day and weekly figures are 20% lower than the same budget's overview total.

### B8. Locations boundary discovery passes an unclamped radius that the validator rejects (`max 50_000`) → unhandled promise rejection + silent no-pins ◆ CODE-PROVEN

`apps/web/app/features/locations/components/LocationsPage.tsx:129-145` passes
`geometryToCircle(...).radius_m` (no upper clamp; `lib/area-filter.ts:105`) into `discoverPlacesInArea`,
whose `DiscoverInputSchema` enforces `radius_m.max(50_000)` (`server/discovery.server.ts:38`). For any
boundary larger than a small town the Zod validator rejects, and the `await` sits in an unguarded async
IIFE (`:136`) → unhandled rejection, no pins, no error surfaced. The drawn-circle path is clamped
(`area-search.ts:54`); the boundary path is not.

### B9. Shot-plan / blocking: detached-blocking actor drags are written to the shared row and snap back on refetch (content loss) ◆ CODE-PROVEN

`apps/web/app/features/shooting-plan/server/blocking.server.ts:303-330` (`saveActorPositions`) always
writes the shared `sceneBlockings.actorPositions`, but `getOrCreateBlocking` reads
`overrideActorPositions` when `detachedActors` (`:267-271`). `BlockingCard.handleActorMove`
(`BlockingCard.tsx:182-191`) always targets the shared row; no server fn writes `overrideActorPositions`.
In detached mode every actor edit is lost on refetch.

### B10. Shot-plan / blocking: camera-pin & actor-position saves are read-modify-write on a JSON array outside any transaction — concurrent edits clobber ◆ CODE-PROVEN

`apps/web/app/features/shooting-plan/server/blocking.server.ts:343-361` (`saveCameraPin`),
`:382-394` (`deleteCameraPin`), `:314-326` (`saveActorPositions`) each load the whole array, mutate,
and overwrite — no transaction, last-write-wins. Two near-simultaneous pin moves (multi-camera,
"Accept all", or two clients) drop one silently.

### B11. Shot-plan: all plans hidden on a fresh scene — the parallel-plans track renders empty ◆ CODE-PROVEN

`apps/web/app/features/shooting-plan/components/ParallelPlansEditor.tsx:81-90`: the `useLocalStorage`
default is captured once on first render when `plan` is still `null` → `[]` (`useLocalStorage.ts:13`),
with no effect re-seeding `visibleIds` once `plan` loads. Any scene without a prior localStorage entry
shows no plans; `isHydrated` is returned but never used.

---

## MEDIO

### B12. Budget `flat`/`percentage` lines summed differently in the canonical generator vs every UI/export surface → two different grand totals ◆ CODE-PROVEN

Canonical `lineEffectiveTotal` (`packages/domain/src/budget/budget-generator.ts:153-157`): `flat` →
`rate` only, `percentage` → `0`. Every UI/export path uses `rate * quantity` for all cost types with no
flat/percentage branch — e.g. `budget/components/flat-sections.ts:164-168` (`toLineRow`: `rate*qty`),
`widgets/TotalWidget.tsx:39`, `widgets/CategoryLineWidget.tsx:17`, `lib/budget-export-csv.ts:29-33`,
`lib/budget-export-pdf.ts:30-31`. A `flat` line with qty>1 or any `percentage` line yields a different
total in the two paths.

### B13. Budget CSV/PDF export ignores `actual` — exported total ≠ on-screen total whenever a final cost was entered ◆ CODE-PROVEN

`budget/lib/budget-export-csv.ts:29-33` and `budget-export-pdf.ts:30-31` compute `quantity*rate` only;
everywhere on screen `actual` overrides the estimate. Export TOTAL diverges from the displayed total.

### B14. Breakdown bulk "Conferma N" flips `ignored` occurrences too — resurrects items the user dismissed ◆ CODE-PROVEN

`apps/web/app/features/breakdown/server/breakdown.server.ts:1224-1249`
(`bulkSetOccurrenceStatusForElements`) has no `ne(cesareStatus, "ignored")` guard, contradicting its own
doc comment (`:1198-1201` "flips every non-ignored occurrence"). Dismissed items get set back to `accepted`.

### B15. Breakdown `source` is never persisted → the "Origine" column always renders `—` and every Source filter returns zero rows ◆ CODE-PROVEN

Extractors insert occurrences without a `source` value: `auto-spoglio.server.ts:248-254`,
`llm-spoglio.server.ts:480-488`, `cesare-suggest.server.ts:207-215`. `latestSource`
(`breakdown.server.ts:304-305,318`) is therefore always `null`; the "Origine" cell shows `—` and the
source filter (`ProjectBreakdownView.tsx:545-558`) yields nothing. (Related latent: `auto-spoglio`
sets `source: "wordnet"`, not in `OCCURRENCE_SOURCES` — a DB enum violation the moment it is wired.)

### B16. Breakdown: an element whose only occurrence is `ignored` still appears in the Per-Progetto list/export with quantity 0 ◆ CODE-PROVEN

`breakdown.server.ts:283-336`: an `ignored`-only element still increments `_totalOccs`, and the final
filter keeps any row with `_totalOccs > 0` (`:335`), so it renders (and exports) with qty 0 / empty
scene range instead of being hidden.

### B17. Locations: confirming a second candidate never demotes the first — two candidates show "Confermato" ◆ CODE-PROVEN

`apps/web/app/features/locations/server/locations.server.ts:372-386` (`confirmLocationCandidate`) sets the
new `confirmedCandidateId` and the chosen candidate to `confirmed`, but issues no UPDATE to reset the
previously confirmed candidate. Confirm A then B → A keeps the "Confermato" badge (`LocationPanel.tsx:158-163`).

### B18. Schedule same-day drag stores a non-contiguous position (`0..N-2, N`) — later inserts can collide ◆ CODE-PROVEN

`schedule/components/ShootingDayColumn.tsx:121` always calls `onDrop(day.id, day.strips.length)`; for an
intra-day move `moveStrip` (`schedule/server/schedule.server.ts:435-461`) reindexes others `0..N-2` but
writes the moved strip `position: N` (`:448`). Read re-sorts so no visible glitch, but stored positions
go non-contiguous and a future insert at that index can collide. `targetPosition` is also never clamped
to day length (`:355,:448`).

### B19. Schedule shooting-day drawer shows stale effort values; "restore auto" doesn't clear the override flag ◆ CODE-PROVEN

`schedule/components/ShootingDayDrawer.tsx:46` effect deps are `[day?.id, day?.strips.length]`; an
`estimatedHours` change elsewhere (same id/length) leaves stale local `inputs`. And `:69-75` passes `null`
only when `estimatedHours === null`, so typing the auto value while overridden re-stores an explicit
override equal to auto — the strip stays flagged "overridden".

### B20. Narrative PDF section headers and empty-state placeholders are hardcoded English in an IT export (i18n leak) ◆ CODE-PROVEN

`apps/web/app/features/documents/lib/pdf-narrative.ts:100-104` emits "LOGLINE / SYNOPSIS / TREATMENT"
(IT product labels: Sinossi / Trattamento) and `:109` the EN placeholder "(not written yet)" (cf. the SIAE
export's IT "(soggetto non ancora redatto)"). Cover also mixes IT "Scritto da" with EN headings.

### B21. Breakdown PDF emits the English word "scene" in element lines (i18n leak) ◆ CODE-PROVEN

`apps/web/app/features/breakdown/lib/export-pdf.ts:35`: `` `  • ${it.name}  ×${it.totalQuantity}  → scene ${it.scenes.join(", ")}` `` — category headers use `labelIt`, but the per-element line is English.

### B22. SIAE cover page has no overflow/page guard — a deposit with many co-authors or long notes overflows ◆ CODE-PROVEN

`apps/web/app/features/documents/server/subject-export-siae.server.ts:148-164` (`renderCover`) writes every
author + deposit-notes line with plain `doc.text()` and no `addPage` before the forced break at `:221`.
For a legal deposit doc this is a fidelity risk.

### B23. Shot-plan: newly created plan is invisible until manually toggled ◆ CODE-PROVEN

`ParallelPlansEditor.tsx:390-396`: `onCreatePlan` never adds the new scenario id to `visibleIds`, so it is
not in the stored visible set and doesn't appear after creation.

### B24. Shot-plan: Cesare camera-pin A/B/C labels are nondeterministic (shots loaded without `orderBy`) ◆ CODE-PROVEN

`blocking.server.ts:211-213` loads shots with no `orderBy`, then derives A/B/C labels by index (`:224`).
Every other loader orders by `position`; labels can mismatch the shot sequence.

### B25. Shot-plan transition mutations skip project-scope ownership checks ◆ CODE-PROVEN

`shooting-plan/server/shooting-plan.server.ts:839-873,875-913` (`addManualTransition`,
`updateTransition`, `compactScenario`) trust client ids without verifying the scenario belongs to the
`shotPlanId`/`projectId` (contrast `setActiveScenario` `:497-502`). Authenticated cross-project tampering.

### B26. Budget native dialogs + hardcoded hex + over-budget ARIA ◆ CODE-PROVEN

`budget/components/CategoryFlatTable.tsx:578-583` uses native `window.confirm` for crew-row removal
(violates the no-native-dialogs rule). `widgets/TotalWidget.tsx:58,63,68,73` hardcode hex fallbacks
(`#6366f1`…) whose var names (`--color-cast`) don't match the `--ds-cat-*` namespace so the hex actually
renders (no-hardcoded-color rule). `BudgetCapBar.tsx:159` can emit `aria-valuenow` > `aria-valuemax`.

### B27. Blocking editor: native `window.prompt` + mixed EN literals; PDF headers EN vs CSV IT ◆ CODE-PROVEN

`BlockingEditorCanvas.tsx:91` `window.prompt(...)`; EN literals `"Shot {n}"` (`ShotDetailPanel.tsx:59`),
`"Detach blocking"` (`BlockingCard.tsx:283`); shot-list PDF headers English (`shot-list-pdf.ts:19,116`)
while CSV is Italian — inconsistent export language.

### B28. Breakdown LLM stream parser can stall and drop all remaining scenes on one unexpected char ◆ CODE-PROVEN

`apps/web/app/features/breakdown/lib/parse-scene-stream.ts:112-115`: in `extractCompleteScenes`, if the
char after separators is neither `]` nor `{`, the loop `break`s returning `nextCursor = position` at that
same char; the next delta re-enters and breaks identically — the cursor never advances and every
subsequent scene is lost. The malformed-object branch (`:134-138`) advances; this one does not.
(Severity depends on LLM output shape; MEDIO as a latent silent-loss path.)

---

## BASSO

- **B29.** `diffScreenplays` runs `diff_cleanupSemantic` after `diff_charsToLines_`
  (`screenplay-editor/lib/diff.ts:30-31`) — char-level cleanup applied to reconstituted lines can
  mis-tag a diff segment; cosmetic diff-render glitch only.
- **B30.** `extractForcedNumber` assumes `m.index` is defined
  (`fountain-to-doc.ts:22` `raw.slice(0, m.index)`); currently safe, but unguarded vs the file's
  `noUncheckedIndexedAccess` discipline — a forced-number `#3-3B#` suffix would leak into the title if it
  ever were `undefined`.
- **B31.** Quantity inputs coerce empty/0 → 1 mid-edit: breakdown `BreakdownMatrix.tsx:97`
  (`parseInt(...) || 1`) and budget `flat-sections.ts:165` (`num(l.quantity) || 1`); a zeroed line shows
  `rate × 1`.
- **B32.** `formatLongDate` renders "undefined" for a malformed month (`ShootingDayColumn.tsx:52-57`,
  `"2026-13-01"` → `ITALIAN_MONTHS[12]` = undefined).
- **B33.** Locations: raw full-precision lat/lng in the panel (`LocationPanel.tsx:211`) vs `.toFixed(5)` in
  the modal (`LocationDetailModal.tsx:166`); plus hardcoded hex in `LocationPanel.tsx:71-76,151,526-551`.
- **B34.** Locations cross-match passes empty `placeTypes` for saved candidates
  (`lib/cross-match.ts:58-65`), so type-fit matching never fires — only keyword fallback.
- **B35.** MiscWidget chip writes the estimate into `actual` on blur-without-edit
  (`widgets/MiscWidget.tsx:62-69`), silently converting an estimate into a hard final cost that then
  overrides future rate/qty edits.
- **B36.** Blocking canvas can produce NaN/Infinity coords if `widthCm = 0` (`BlockingCanvas.tsx:60`,
  `scale = DISPLAY_W / widthCm`, no guard; latent — schema defaults width 1000).

---

## Cross-cutting note

The budget money cluster (B1, B5, B7, B12, B13) shares one root cause: there is **no single shared
"effective line total / grand total" function**. The canonical `lineEffectiveTotal` +
`computeBudgetSummary` in `packages/domain` is bypassed by the UI, the per-day/week server paths, and the
exporters, each re-deriving totals (and each diverging on flat/percentage, `actual`, the fiscal multiplier,
and cast/crew inclusion). Consolidating every surface onto one extended summary function (cast + crew +
contingency included) would close B1, B7, B12, B13 and the export omission at once and is the highest-
leverage fix.

## Verification log

- B1 — live: `/budget` "NON FA RIDERE" shows €107K (cast €43K + crew €54K dominate, lines €0); export
  source reads only `budgetLines`. Export dialog (PDF/CSV) opened and CSV triggered live.
- B2, B3 — code-proven by reading both the buggy path and the correct canonical path side by side
  (transition schema + `leadingTransitions`; per-scene query vs version+ignored canonical filter).
- Screenplay editor driven live (12 scenes / 8 pages, **zero console errors/warnings** on load).
- Remaining findings: code-proven with exact file:line; not individually driven live (cost discipline).
