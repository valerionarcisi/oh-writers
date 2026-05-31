# Spec 44 — Iteration 1 Multi-Role Review

Branch under review: `refactor/ux-notion-v3` (head `bf6d6f6`).
Viewport: 756x469 (chrome-agent default).
Login: `test@ohwriters.dev` (live).
Reference: `docs/specs/44-notion-ux-reference.md`, `docs/specs/44-app-uxbugs.md`,
`docs/specs/mockups/shell-canva-notion.html`,
`docs/specs/44-shell-refactor-notion-style.md`.

Screenshots: `docs/specs/mockups/lead-final/iter-1/`.

Severity legend:

- **blocker** — breaks core spec contract or page unusable.
- **major** — Notion-noncompliant interaction or visible regression.
- **minor** — polish issue.
- **cosmetic** — token nit.

---

## Software Engineer

1. **apps/web/app/features/documents/components/NarrativeEditor.tsx:437, :491** — **blocker** — `<FloatingDock primaryAction={…} />` mounted in addition to global `BottomDock` from `AppShell`. Two bottom-right pill surfaces compete. SRP: page should not render a global command surface — that belongs to AppShell. Remove FloatingDock from NarrativeEditor; the per-page `Esporta PDF` / `Esporta DOCX` / `Esporta SIAE` action moves to TopStrip right slot or a `•••` overflow.
2. **apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:1099** — **blocker** — same FloatingDock leak ("Esporta PDF" pill).
3. **apps/web/app/features/breakdown/components/BreakdownPage.tsx:1086** — **blocker** — FloatingDock with "Ri-spogliare con AI" pill duplicates BottomDock.
4. **apps/web/app/features/budget/components/BudgetPage.tsx:443, :461** — **blocker** — TWO FloatingDock instances ("Rigenera"); double-double-dock.
5. **apps/web/app/features/schedule/components/SchedulePage.tsx:488** — **blocker** — FloatingDock with `PIANO DI RIPRESA · Rigenera · E…` overlaps BottomDock; bell completely obscured.
6. **apps/web/app/features/locations/components/LocationsPage.tsx:487** — **blocker** — FloatingDock + Locations page is also entirely unstyled (see QA §1) suggesting a CSS module export regression.
7. **apps/web/app/features/predictions/components/CesareSheet.tsx** — **major** — drawer header does NOT mount bell/avatar/gear buttons when `data-cesare ≠ closed`. Spec §"Cesare Panel" + §"Drawer header" explicit: "Window-control icons rightmost: bell, avatar, gear (carried from Dock when state ≠ closed)". Currently the user has zero access to notifications/account/settings while Cesare is expanded/full/peek. Add three header buttons that share handlers with BottomDock.
8. **apps/web/app/features/app-shell/components/AppShell.tsx:717** — **major** — Focus toggle aria-label is `Focus mode (⌃⌥F)` but the button actually toggles `full ↔ collapsed`, not focus. Misleading label + accessibility regression. Either rename button "Comprimi barra (⌘\)" or actually wire it to focus mode.
9. **apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx (TopBar slot)** — **major** — Element Legend is rendered in `viewbarCenter` ROW 1, not as a SEPARATE SECOND ROW per spec. Buttons SCENE/ACTION/CHARACTER overlap Indice/VERSIONI (right slot) at common viewport widths and become invisible. Spec §Glossary "Element Legend — SECOND ROW of the Top Strip". Refactor TopBar to expose a true `topStripRow2` slot.
10. **apps/web/app/features/documents/components/NarrativeEditor.tsx:454-460 + NarrativeDocsShell** — **blocker** — `pageShell` flex parent collapses prose column to ~38px wide (single character per line) on viewports ≤ 1100px. The `MarginNotesColumn` aside is greedy and steals all width. Spec §Per-page mitigations says prose column owns `min(720, 80%)`. Add explicit grid template: `grid-template-columns: minmax(0, 720px) minmax(220px, 1fr)` or equivalent flex `flex: 1 1 0; min-width: 0` on the prose lane.
11. **apps/web/app/features/documents/components/NarrativeDocsShell (or tabs row)** — **major** — `_docTypeLabel_g65jo_22` renders the active doc-type a SECOND time next to the tab row (TKT-LEAD-04). Looks like a 5th tab. Either remove the duplicate label or move it to TopStrip breadcrumb only.
12. **packages/ui/src/shell/TopBar/TopBar.tsx** — **minor** — Breadcrumb text gets clipped by the rail-collapse chevron's hit area (`«noramica`, `«ceneggiatura`). Add `padding-inline-start: var(--space-12)` to the breadcrumb container or move the chevron outside the breadcrumb row.
13. **apps/web/app/features/app-shell/components/AppShell.tsx (keybinding handler 340-365)** — **minor** — `cmd+\` and `ctrl+alt+f` handlers exist but did not fire from chrome-agent. Likely the editor's iframe-style focus captures keystrokes before the document handler. Move the handler up to `window` or check `e.isComposing` + `useHotkeys` per Spec 25 react-aria rules.
14. **apps/web/app/features/documents/components/NarrativeEditor.tsx:454-460** — **minor** — `rightAside={<MarginNotesColumn .../>}` is rendered for every doc type incl. Trattamento, but `TreatmentToc` left aside + MarginNotes right aside = 3-column at narrow viewports, no graceful collapse. Layout is broken on Trattamento (INDICE text overlaps editor toolbar).
15. **packages/ui/src/shell/LeftRail/LeftRail.tsx** — **minor** — Project name label collapses to `…` on Schedule view (TKT-LEAD-07). Verify the picker reads `currentProject?.title` not a placeholder fallback. The bug is reproduced via screenshot `iter1-schedule.png`.
16. **apps/web/app/features/predictions/components/CesareSheet.tsx (peek state)** — **major** — In peek state the floating pill `✦ Cesare · in attesa · ×` exposes only "close". No bell/avatar/gear — same gap as expanded/full. User has NO command surface in this mode. Either show BottomDock when peek (deviation from spec §BottomDock "hidden when Cesare ≠ closed") OR add the three icons to the peek pill.

---

## Security Engineer

1. **apps/web/app/features/predictions/components/CesareSheet.tsx** — **minor** — Cesare composer textarea receives free-text user input that is later concatenated into LLM prompts. Verify input is escaped before being interpolated into system prompt + that scope chips (page name, scene number) come from server-validated routes, not user-editable URL params. Risk: prompt injection elevating an agent to run a write tool out of scope. Add a Zod parser on the client payload before `askCesare`.
2. **apps/web/app/features/app-shell/components/AppShell.tsx (push notifications)** — **minor** — `firePush` is called server-side without checking origin. Ensure the VAPID subject + the notification payload do not leak `projectId`, `userId`, or session titles to the push provider. Audit the payload constructor.
3. **apps/web/app/features/locations/components/LocationsPage.tsx** — **cosmetic** — Locations page renders unstyled HTML + a brown placeholder. If a CSS module fails to load, the user-visible markup may include innerHTML expansions that could XSS via location names. Confirm the page uses `text` not `innerHTML` even in the fallback.
4. **General** — **cosmetic** — `BottomDock` exposes a settings button that routes to global account settings. Confirm the route uses `withProjectAccess` (or equivalent auth gate) before rendering team-scoped data.

---

## Product Owner

1. **TKT-LEAD-01 universal double-dock — STILL BLOCKER**. Every production page renders both the spec-44 BottomDock and the legacy per-page FloatingDock. The user's intent ("one command surface, no truncated pills") is violated on 7+ pages. Spec §"One command surface" goal failed.
2. **TKT-LEAD-02 Cesare drawer missing bell/avatar/gear — STILL MAJOR**. Spec §Cesare Panel explicitly lists those three icons in the drawer header when `data-cesare ≠ closed`. User has no notifications/account access while chatting. Goal "one command surface (Dock OR Cesare header)" fails: NEITHER carries the icons when Cesare ≠ closed.
3. **TKT-LEAD-03 Soggetto prose column collapsed — STILL BLOCKER**. The main writing surface is unreadable. User's stated priority (writer-director productivity, Italian prose) is impossible.
4. **TKT-LEAD-04 duplicate doc-type label — STILL MAJOR**. SOGGETTO appears as the active tab AND as a "page chip" next to TRATTAMENTO. Visually parses as a 5th tab; the user clicks the chip and nothing happens. Confusing.
5. **TKT-LEAD-05 Sceneggiatura Element Legend hidden — STILL MAJOR (not fixed)**. Earlier WP-DOCS-FINAL marked this fixed, but the DOM shows the legend is rendered in the WRONG row (overlapping with Indice/VERSIONI) and Transition is clipped offscreen. The user sees zero of the legend. Spec contract: explicit ROW 2.
6. **No Focus mode implementation**. The `«` button labelled "Focus mode (⌃⌥F)" toggles full↔collapsed. Spec §Glossary defines focus as "rail + topstrip + dock hidden". This mode does not exist in the shipped build. The `⌃⌥F` shortcut is wired but the resulting state is collapsed, not focus.
7. **Cesare full-page → SplitDrawer trace flow**. Spec §"Cross-component flow" requires `[Mostra modifiche]` inside a Step Block → SplitDrawer with target page + diff. I could not reach this flow because there are no Cesare runs in the seed data. Marked as untested gap; respawn brief should add a seed Cesare conversation with a completed write tool so the flow can be QA'd.
8. **No regression on rail SESSIONI section**. The LeftRail Sessioni Cesare section appears on the Trattamento page (after WP-SIDEBAR-NOTION merge). Good. Matches Notion §3 reference (Chats tab in sidebar).

---

## QA Engineer

1. **Locations page completely unstyled** — **blocker**. `/projects/<id>/locations` renders raw HTML buttons, no layout, brown placeholder block. Regression introduced after the WP-SIDEBAR-NOTION work. Suspect: CSS module resolution failure or a Leaflet container without dimensions. See `iter1-locations.png`.
2. **Trattamento layout overlap** — **major**. INDICE box overlaps editor toolbar (H2/H3/List buttons) on /treatment. The 3-column layout (TreatmentToc + editor + MarginNotes) collapses at viewport ≤ 1100px and produces overlapping z-stack. See `iter1-treatment.png`.
3. **Scaletta empty-state column collapsed** — **major**. `Nessun atto. Aggiungi il primo atto per iniziare la scaletta.` rendered single-word-per-line, identical TKT-LEAD-03 mechanism. See `iter1-outline.png`.
4. **Playwright coverage gaps**:
   - `[OHW-044-D]` claims to cover "Sceneggiatura Element Legend; Breakdown RecapStrip; Soggetto margin notes collapse" but does not assert legend is on ROW 2, does not assert prose-column min width, does not assert tab row has no duplicate doc-type label. Three assertion gaps.
   - `[OHW-044-A]` claims to cover Cesare states `closed → expanded → peek → full → closed` but does not assert bell/avatar/gear in drawer header. Missing assertion.
   - No `[OHW-044-X]` for the trace flow (Cesare full → Step Block "Mostra modifiche" → SplitDrawer with target page).
   - No regression test for "shell-focus-toggle" semantics — current test would pass even with the wrong state.
5. **Sad-path tests missing**:
   - What happens when Cesare expansion fails (no project access)? Probably the drawer crashes silently.
   - What happens if MarginNotesColumn queries fail (empty rightAside)? Should the prose column expand to full width? Currently no test.
6. **Cost smoke for Cesare (Spec 43 compat)** — Not verified in this iteration. Need a manual cost-budget assertion run.

---

## Tech Writer

1. **docs/specs/44-shell-refactor-notion-style.md §AppShell shell state** — **minor** — describes a "hamburger top-left always visible" in collapsed mode. Shipped behaviour shows narrow rail strip with `»` instead. Either update the spec to match shipped (narrow strip, no hamburger) OR the shipped behaviour is wrong per Notion §1.
2. **docs/specs/44-shell-refactor-notion-style.md §Glossary "Element Legend"** — **minor** — says "second row of the Top Strip, only on Sceneggiatura". Shipped: legend collides with row 1 controls. Add a rendered example or screenshot in the spec to make the contract unambiguous.
3. **docs/specs/44-design-notes.md / 44-lead-report.md / 44-respawn-tickets.md** — **cosmetic** — these are stale "all-green" reports authored by earlier WP-LEAD work but the iteration-1 walk-through proves them inaccurate (e.g. WP-DOCS-FINAL stated TKT-LEAD-05 was closed; it is not). Add a "Status as of YYYY-MM-DD" header per artefact.
4. **CLAUDE.md "Never do" list** — **cosmetic** — does not yet codify the "Never reintroduce per-page FloatingDock now that BottomDock owns bottom-right". Add a one-line entry per spec §WP-DOCS deliverable.
5. **docs/conventions/css.md** — **cosmetic** — no convention for "prose column lane must have `min-width: 0` to survive flex parents". Add a paragraph; cross-link to TKT-LEAD-03.

---

## Counts by severity (iteration 1)

| Severity  | Count  | New (not in lead-watcher log)                                                                                                      |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| blocker   | 7      | 2 (Locations unstyled, double-FloatingDock count = 2 in Budget)                                                                    |
| major     | 9      | 4 (Element Legend row mis-stacked, peek-state command-gap, Trattamento overlap, Scaletta column collapse, mislabeled focus button) |
| minor     | 6      | 3 (keybinding focus capture, Trattamento 3-column, project label truncation)                                                       |
| cosmetic  | 4      | 1 (docs status stamps)                                                                                                             |
| **total** | **26** | **10**                                                                                                                             |

**Decision**: blockers + majors = **16**. Pragmatic gate **fails** (requires zero blockers + zero majors).
Proceed to respawn briefs and dispatch iteration 2.
