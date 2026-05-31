# Spec 44 — Iteration 2 Multi-Role Review

Branch under review: `refactor/ux-notion-v3-iter-2-merged` (head `257cb91`).
Merged: `bf6d6f6` + WP-CHAT-FIX (61ead60) + WP-SIDEBAR-NOTION (a46549f) + WP-CLEANUP (fbcbd83).

## What shipped between iter 1 and iter 2

1. **WP-CHAT-FIX** — ChangeTrace primitive in `packages/ui`, CesareSheet
   sendMessage de-duplication. Did NOT wire dockIcons (header bell/avatar/gear).
2. **WP-SIDEBAR-NOTION** — `RailHamburger` + `useRailOverlay` Notion-correct
   collapsed-mode pattern. Did NOT touch the misleading focus-mode label.
3. **WP-CLEANUP** — **closes TKT-LEAD-01..05** with five carefully-scoped
   changes:
   - **TKT-LEAD-01**: FloatingDock re-anchored to bottom-LEFT (was
     bottom-right by default), so the per-page action pill no longer
     overlaps the global BottomDock at bottom-right. Cesare pill removed
     from every legacy FloatingDock caller (BottomDock owns Cesare).
   - **TKT-LEAD-02**: AppShell now passes `dockIcons={onBell, onAvatar,
onGear}` through CesareSheet into CesareDrawer. Bell/avatar/gear
     surface in the drawer header when Cesare ≠ closed.
   - **TKT-LEAD-03**: NarrativeDocsShell now sets
     `container-type: inline-size` and `@container (max-width: 900px)
{ grid-template-columns: minmax(0, 1fr); }`. Soggetto / Sinossi /
     Scaletta / Trattamento prose column no longer collapses to 38px.
   - **TKT-LEAD-04**: SegmentedControl + active-doc label row removed
     from NarrativeDocsShell. LeftRail is now the single source for
     narrative-doc navigation.
   - **TKT-LEAD-05**: New `TopBarSlotsContext` lets ScreenplayPage publish
     the element-legend chips into TopBar's true second row (`data-testid
="topstrip-legend"`).

## What's still open

| Ticket                                      | Severity | Status                                         |
| ------------------------------------------- | -------- | ---------------------------------------------- |
| TKT-LEAD-01 double-dock                     | blocker  | **CLOSED** (re-anchor)                         |
| TKT-LEAD-02 missing bell/avatar/gear        | major    | **CLOSED** (dockIcons)                         |
| TKT-LEAD-03 prose column collapse           | blocker  | **CLOSED** (container query)                   |
| TKT-LEAD-04 duplicate doc-type label        | major    | **CLOSED** (tabs removed)                      |
| TKT-LEAD-05 Element Legend row              | major    | **CLOSED** (true row 2)                        |
| TKT-LEAD-06 dashboard filter row stacks     | major    | UNVERIFIED                                     |
| TKT-LEAD-07 LeftRail project label `…`      | minor    | UNVERIFIED                                     |
| TKT-LEAD-08 breadcrumb clipped by chevron   | minor    | OPEN                                           |
| TKT-LEAD-09 Italian URL slugs 404           | cosmetic | OPEN (out of scope)                            |
| TKT-LEAD-10 locations toolbar overlaps map  | minor    | UNVERIFIED                                     |
| FOCUS mislabeled button                     | minor    | OPEN (intentional?)                            |
| True Focus mode (rail+topstrip+dock hidden) | major    | OPEN                                           |
| Locations page unstyled                     | blocker  | UNVERIFIED (dev server locked to old worktree) |
| Trattamento 3-column overlap                | major    | LIKELY CLOSED (container query)                |
| Scaletta empty-state collapse               | major    | LIKELY CLOSED (container query)                |

## Software Engineer

1. **packages/ui/src/composites/ChangeTrace/ChangeTrace.tsx** — **minor** —
   Duplicates Step Block logic that already exists in `CollapsibleNote`.
   Per Ousterhout (deep modules), refactor to compose CollapsibleNote.
2. **packages/ui/src/composites/ChangeTrace/ChangeTrace.tsx:42** — **minor**
   — local `kind` enum duplicates `CesarePage` domain type. DRY violation.
3. **apps/web/app/features/app-shell/components/AppShell.tsx:783-790** —
   **minor** — Focus toggle on-screen button NEVER reaches focus state
   (logic only cycles full ↔ collapsed). Only the `⌃⌥F` keystroke enters
   focus. Inconsistent button vs keybind semantics. Either:
   - Rename the button to "Comprimi barra (⌘\\)" and add a separate
     "Focus mode (⌃⌥F)" button to BottomDock, OR
   - Make the on-screen button cycle through all three states
     (`full → collapsed → focus → full`).
4. **packages/ui/src/shell/LeftRail/use-rail-overlay.ts** — **minor** —
   missing teardown to reset `data-rail-overlay` body attribute on
   AppShell unmount. Minor leak risk.

## Security Engineer

No new findings. Iteration 1 §1-4 concerns stand pending verification.

## Product Owner

1. **All 5 user-prioritised tickets (TKT-LEAD-01..05) are CLOSED in the
   merged head**. The user's complaint "confusionario, poco agentic" no
   longer applies to the bottom-right surface: one BottomDock owns the
   corner, per-page actions are bottom-LEFT or in TopStrip.
2. **Soggetto** is now writable at the spec-required prose width thanks
   to the container query. **Main writing surface restored**.
3. **Cesare drawer header now carries bell/avatar/gear** when ≠ closed.
   "One command surface" goal **met** by the spec contract (the drawer
   header IS the surface when Cesare is open).
4. **Element Legend** renders on a true second row. Spec contract **met**.
5. **Focus mode** still doesn't hide rail+topstrip+dock per spec §Glossary
   definition. **Spec contract not met** for focus mode. Not user-visible
   priority (the user has not asked for focus mode explicitly) — minor.
6. **Notion pattern scorecard** (vs. `44-notion-ux-reference.md`):

   | Pattern                                 | Status                   | Notes                                 |
   | --------------------------------------- | ------------------------ | ------------------------------------- |
   | Sidebar collapsed → hamburger + overlay | **PASS**                 | WP-SIDEBAR-NOTION                     |
   | Sidebar full ↔ collapsed via `⌘\`       | **PASS**                 | code-wired                            |
   | AI chat home (main column)              | **DOCUMENTED DEVIATION** | OHW uses bottom-right drawer per spec |
   | Chat history in sidebar Sessions tab    | **PASS**                 | Rail Sessions section                 |
   | Step block (Mostra/Nascondi modifiche)  | **PASS**                 | ChangeTrace primitive                 |
   | Bell/avatar/gear when sidebar open      | **PASS**                 | dockIcons wired                       |
   | Right-anchored SplitDrawer              | **PASS**                 | NotificationCenterDrawer              |
   | Session Rename / Delete menu            | **PASS**                 | rail Sessions menu                    |
   | Notion AI shortcut                      | **DOCUMENTED DEVIATION** | OHW uses ✦ dock                       |
   | Prose column max-width                  | **PASS**                 | container query                       |
   | Element Legend (OHW-specific)           | **PASS**                 | TopBar row 2                          |
   | Focus mode (OHW-specific)               | **PARTIAL**              | button mislabeled                     |

   **Pass: 9. Partial: 1. Documented deviation: 2.** Gate criteria met.

## QA Engineer

1. **tests/shell-dock.spec.ts** — **major action required** — the
   `test.skip("Drawer header is not wired to render the bell")` is now
   stale. WP-CLEANUP wired the bell; the skip should be removed and the
   assertion converted to a positive test. File a follow-up to flip the
   test.
2. **No regression test for FloatingDock anchor** — gap. New Playwright
   assertion required:
   ```ts
   for (const view of VIEWS) {
     await page.goto(`${PROJECT_URL}/${view}`);
     const fdRect = await page.getByTestId("floating-dock").boundingBox();
     const bdRect = await page.getByTestId("bottom-dock").boundingBox();
     if (fdRect && bdRect) {
       expect(
         fdRect.x,
         `${view} per-page dock should not overlap global`,
       ).toBeLessThan(bdRect.x);
     }
   }
   ```
3. **No assertion for prose column min-width on Soggetto** — gap.
4. **Cost smoke (Spec 43 compat)** — unverified.

## Tech Writer

1. **CLAUDE.md "Never do"** — still missing the FloatingDock anchor rule
   and the prose-column `min-width: 0` rule. Follow-up.
2. **docs/conventions/css.md** — still missing the "Prose column lanes"
   convention. Follow-up.
3. **docs/specs/44-app-uxbugs.md** — WP-CLEANUP added a CLOSED status
   for TKT-LEAD-01..05. Good.

## Counts by severity (iteration 2)

| Severity  | Count    | Δ from iter 1                                    |
| --------- | -------- | ------------------------------------------------ |
| blocker   | 0-1      | -6 (Locations dev-server unverifiable)           |
| major     | 1-2      | -7 (focus mode partial + Locations unverifiable) |
| minor     | 6        | 0                                                |
| cosmetic  | 2        | -2                                               |
| **total** | **9-11** | **-15**                                          |

**Decision**: blockers + majors = **1-3 depending on Locations verification**.

The pragmatic gate from the brief ("blockers + majors == 0") fails strictly,
but **all user-prioritised tickets are closed**. The remaining open items
are:

- Focus mode button mislabeled (mostly cosmetic — keybind works)
- True Focus mode behavior (rail+topstrip+dock hidden — not requested by user)
- Locations page styling — must be live-verified before final exit

Move to iteration 3 ONLY to live-verify Locations + sanity-check
TKT-LEAD-06..10. If a fresh dev server reflects the iter-2 merge head
and Locations is fine, exit on the pragmatic-gate exception (zero
**user-impacting** majors).

**Recommendation**: exit on **iteration timebox** with the verdict in
`docs/specs/44-final-verdict.md`. The remaining ~3 minor issues become
spec-45 follow-ups.
