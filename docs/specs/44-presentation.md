# Spec 44 — Shell Refactor (Notion-style) Presentation Deck

Date: 2026-05-29
PR: [#2 — Spec 44 Notion-style shell refactor](https://github.com/valerionarcisi/oh-writers/pull/2)
Reference: `docs/specs/44-shell-refactor-notion-style.md`,
`docs/specs/44-lead-report.md`,
`docs/specs/44-shipped-screenshots.md`

---

## Why

- The legacy shell tried to do too many things in the top bar (project + section tabs + version + scope chip + save state) and shipped per-page right panels that fought the editor for horizontal space.
- Cesare was a per-page bottom-sheet drawer with no resumable chats, no single command surface, and a duplicated dock-vs-Cesare-header icon set.
- The refactor introduces a Notion-class shell (Canva Left Rail + slim Top Strip + bottom-right BottomDock + floating Cesare drawer) so the editor always wins, Cesare always lives bottom-right, and there is exactly one command surface at a time.

![](mockups/shipped/dashboard__closed-full.png)

---

## Shell map

- **Left Rail** (240px / 56px collapsed) owns project identity, Document Type / Production View nav, Sessioni Cesare, Recents and tool icons.
- **Top Strip** (slim, one row, two on Sceneggiatura with the Element Legend) holds breadcrumb + scope chip + version pill + save state. No section tabs, no project name.
- **BottomDock** (`bell · avatar · gear · ✦ Cesare`) anchored bottom-right; hides when Cesare ≠ closed or shell = focus.

![](mockups/shipped/breakdown__closed-full.png)

---

## Cesare — four user-facing states

- `closed` (dock pill bottom-right) → `expanded` (floating 480×640 sub-window) → `peek` (44px pill bar) → `full` (whole viewport).
- The editor never reflows on any transition — Cesare is anchored bottom-right, never a side column.
- `body[data-cesare]` only persists `closed | expanded`; `peek` and `full` are runtime-only inside the drawer reducer; `expanded-split` is internal to the SplitDrawer co-existence flow.

| Dock visible (closed)                              | Cesare expanded (dock hidden)                                |
| -------------------------------------------------- | ------------------------------------------------------------ |
| ![](mockups/shipped/screenplay__closed-full.png)   | ![](mockups/shipped/screenplay__expanded-full.png)           |

---

## SplitDrawer + Trace flow

- Separate primitive from Cesare — owns the Notion `»` right-anchored auxiliary pattern (`closed | open | full`).
- Powers `NotificationCenterDrawer`, `VersionsDrawer`, and the `[Mostra modifiche]` trace overlay where Cesare full-page chat narrows to half the viewport while the SplitDrawer shows the affected page with diff markers.
- Single shell-level mount via `SplitDrawerProvider` + `SplitDrawerHost` with a discriminated payload (`trace`, `notifications`).

| Cesare full (entry)                               | Cesare + SplitDrawer co-exist (shell proxy)          |
| ------------------------------------------------- | --------------------------------------------------- |
| ![](mockups/shipped/traceflow__step2_cesare-full.png) | ![](mockups/shipped/traceflow__step3_split-mock.png) |

---

## Shell — collapse, hover-reveal, focus

- `⌘\` toggles `full ↔ collapsed` (Notion shortcut); `⌃⌥F` toggles `focus`.
- `collapsed`: rail becomes a 56px icon strip with a 4px hover sentinel at the left edge that slides the rail in as a temporary overlay (NOT a grid column). A `»` lock-open chip returns to `full`.
- `focus`: rail + top strip + dock all hidden; no hover-reveal; Cesare peek still reachable bottom-right.

| Shell collapsed                                          | Shell focus                                       |
| -------------------------------------------------------- | ------------------------------------------------- |
| ![](mockups/shipped/dashboard__shell-collapsed.png)      | ![](mockups/shipped/dashboard__shell-focus.png)   |

---

## Per-page mitigations

- **Sceneggiatura** gets the Element Legend slot in the Top Strip second row — no right panel.
- **Soggetto / Sinossi / Trattamento** keep a margin notes column rendered via the new `CollapsibleNote` primitive; notes single-line collapse when Cesare ≠ closed.
- **Breakdown** drops the legacy `CATEGORIE 7 / CESARE 1 ALERT` panel; `RecapStrip` lives above the editor; Cesare owns the deep cost breakdown.

![](mockups/shipped/soggetto__closed-full.png)

---

## Out-of-scope + next

- **Out of scope**: mobile / PWA narrow-viewport rail redesign (container queries already cover it), Monaco / Yjs / Fountain logic, reserved-column Cesare under any preference flag.
- **Next**: live trace markers in `[Mostra modifiche]` (needs real Cesare write tool runs against seeded scenes), `VersionsDrawer` migration onto `SplitDrawer`, reconcile WP-DESIGN's `expanded-split` 5-state machine with the 4-state spec glossary in docs, finish §3.2 token replacements that sat outside WP-A/B/C/D ownership (`OpportunityDrawer`, `NominatimCombobox`, `PlacesCombobox`, `UserSettingsPage`).
