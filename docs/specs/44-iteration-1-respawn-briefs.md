# Spec 44 — Iteration 1 Respawn Briefs

Branches expected from each respawn (push back to `origin`, then conductor merges
into `refactor/ux-notion-v3-iter-1-merged`).

---

## RESPAWN-WP-CLEANUP — Universal FloatingDock removal

Branch: `refactor/ux-notion-v3-cleanup` (or push a new commit on top).

### What's broken

Per-page `<FloatingDock />` is mounted alongside the global `<BottomDock />`
from `AppShell`, producing a double bottom-right command surface on every
production page. Truncated pills ("Ri-spogliare co...", "Esporta DO...",
"Rig...") look broken on first paint.

### Files to fix

1. `apps/web/app/features/breakdown/components/BreakdownPage.tsx:1086` — remove
   `<FloatingDock primaryAction={{label: "Ri-spogliare con AI", …}} />`.
   Move the `Ri-spogliare con AI` button into the RecapStrip's right side
   (next to `Aggiungi al budget`) OR into a `•••` overflow on the breakdown
   header.
2. `apps/web/app/features/budget/components/BudgetPage.tsx:443, :461` — remove
   BOTH `<FloatingDock />` instances (there are two). The `Rigenera budget`
   action moves into the Budget header (next to `V1` version pill) as a
   `•••` overflow.
3. `apps/web/app/features/schedule/components/SchedulePage.tsx:488` — remove
   `<FloatingDock />` carrying `PIANO DI RIPRESA / Rigenera / Esporta`. Move
   these actions into a dedicated `ScheduleHeader` row above the strip board
   (the existing "PIANO DI RIPRESA · 2 GIORNATE · 9 SCENE9 pag · 9h totali"
   bar can be extended on the right edge with `Rigenera` + `Esporta`).
4. `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:1099`
   — remove `<FloatingDock />` carrying `Esporta PDF`. Move `Esporta PDF`
   into the Element Legend row right slot (after `TRANSITION`), grouped with
   `Indice` and `Focus`.
5. `apps/web/app/features/documents/components/NarrativeEditor.tsx:437, :491`
   — remove both `<FloatingDock />` instances. The `Esporta PDF /
Esporta DOCX / Esporta SIAE` actions move into the TopStrip right slot
   (next to `VERSIONI`).
6. `apps/web/app/features/locations/components/LocationsPage.tsx:487` —
   remove `<FloatingDock />`. The `Sincronizza location` action moves into
   the locations list header.

### Acceptance

- `grep -rn "<FloatingDock" apps/web/app/features` returns ZERO matches.
- All 7 view screenshots in `docs/specs/mockups/lead-final/iter-2/` show
  the BottomDock at bottom-right and no second pill anywhere else.
- New Playwright assertion in `[OHW-044-E]`:
  ```ts
  await expect(
    page
      .locator("text=/Esporta|Rigenera|Ri-spogliare/i")
      .filter({ has: page.locator("button") }),
  ).toHaveCount(0, { hasNot: page.getByTestId("bottom-dock") });
  ```
- BottomDock is the ONLY bottom-right floating surface across all 10 views.

### Code patterns to follow

When moving an action into the TopStrip, use the existing slot:

```tsx
// apps/web/app/features/documents/components/NarrativeEditor.tsx
<NarrativeDocsShell
  …
  topStripActions={[
    { id: 'export', label: 'Esporta PDF', onSelect: handleExport },
    { id: 'export-docx', label: 'Esporta DOCX', onSelect: handleExportDocx },
  ]}
/>
```

If no slot exists, add a `topStripActions?: ReadonlyArray<{id, label, onSelect}>`
prop to the shell and render it inside `TopBar.tsx` after the right slot.

---

## RESPAWN-WP-CHAT-FIX — Cesare drawer header bell/avatar/gear

Branch: `refactor/ux-notion-v3-chat-fix` (continuation).

### What's broken

When `data-cesare ≠ closed`, the BottomDock hides per spec. But the Cesare
drawer header does NOT mount bell, avatar, gear icons (it shows only the
session selector + `↗ - ×`). Result: user loses access to notifications,
account menu, and settings while chatting. Spec §"Cesare Panel" and
§"Drawer header" explicitly require those three icons in the header.

### Files to fix

1. `apps/web/app/features/predictions/components/CesareSheet.tsx` — drawer
   header. Inside the `_drawerHeader` section, between the session-selector
   chip and the window-control group `↗ ↙ − ×`, mount three buttons:
   - `<button aria-label="Notifiche" onClick={openNotificationDrawer}>🔔</button>`
   - `<button aria-label="Account" onClick={openAccountMenu}>{userInitials}</button>`
   - `<button aria-label="Impostazioni" onClick={openSettings}>⚙</button>`
     These three handlers MUST share the exact same source-of-truth handlers
     as `BottomDock` — extract them into a shared `useShellGlobalActions()`
     hook in `apps/web/app/features/app-shell/hooks/use-shell-global-actions.ts`.
2. `packages/ui/src/shell/BottomDock/BottomDock.tsx` — refactor to consume
   the same hook so the action handlers don't drift.
3. Add a `↙` step-back button next to `↗`. Per spec, `↗ ↙ − ×` order. The
   `↙` cycles `full → expanded → peek → closed`.

### Peek state

The peek pill (`✦ Cesare · in attesa · ×`) currently exposes only the close
button. Per the spec the dock is hidden, so the user has no global commands
at all in peek. Fix: when state is `peek`, render the bell/avatar/gear inline
on the peek pill (between `Cesare` label and `×`), OR show BottomDock
underneath the peek pill when state === 'peek' (cleaner — peek is the
"parked" Cesare state and the user should still have a dock).

### Acceptance

- Cesare expanded screenshot shows bell/avatar/gear in the drawer header.
- Cesare peek pill shows bell/avatar/gear inline OR BottomDock visible
  alongside the peek pill.
- Clicking the drawer-header bell opens the same `NotificationCenterDrawer`
  SplitDrawer as clicking the BottomDock bell.
- Playwright `[OHW-044-A]` asserts:
  ```ts
  await page.getByTestId("cesare-open").click();
  await expect(page.getByTestId("cesare-drawer-header-bell")).toBeVisible();
  await expect(page.getByTestId("cesare-drawer-header-account")).toBeVisible();
  await expect(page.getByTestId("cesare-drawer-header-settings")).toBeVisible();
  ```

---

## RESPAWN-WP-SIDEBAR-NOTION — Focus mode + shortcut wiring + label

Branch: `refactor/ux-notion-v3-sidebar-notion` (continuation).

### What's broken

1. The button at `«` top-left has `aria-label="Focus mode (⌃⌥F)"` but actually
   toggles `data-shell` between `full` and `collapsed`. Misleading label.
2. There is no true Focus mode in the shipped build. Spec §Glossary defines
   focus as "rail + topstrip + dock hidden". Clicking the button collapses
   the rail but topstrip + dock are still visible.
3. `cmd+\` and `ctrl+alt+f` shortcuts are wired in `AppShell.tsx:340-365`
   but did not fire from chrome-agent (likely captured by Monaco editor
   focus).

### Files to fix

1. `apps/web/app/features/app-shell/components/AppShell.tsx:717` — change
   aria-label to `"Comprimi barra (⌘\\)"` when collapsed, `"Apri barra (⌘\\)"`
   when full, and ADD a SEPARATE button "Focus mode (⌃⌥F)" wired to the
   real focus state.
2. `apps/web/app/features/app-shell/components/AppShell.tsx:340-365` —
   move the keydown listener from `document` to `window` so it fires
   regardless of editor focus. Also add a `useHotkeys` integration
   (per Spec 25 react-aria policy) so the binding survives focus traps.
3. `apps/web/app/features/app-shell/components/AppShell.module.css` — when
   `data-shell="focus"`, hide LeftRail, TopBar, BottomDock. Currently the
   CSS only hides the rail and the focus state is indistinguishable from
   collapsed.

### Acceptance

- Clicking the `«` chevron at top-left toggles `data-shell="full"` ↔
  `"collapsed"` and the aria-label correctly says "Comprimi barra (⌘\\)".
- A SECOND button labelled "Focus mode (⌃⌥F)" sits in the BottomDock OR
  in the TopStrip and toggles `data-shell="focus"` (hides rail + topstrip
  - dock).
- `cmd+\` from anywhere on the page toggles full↔collapsed.
- `ctrl+alt+f` from anywhere toggles focus.
- Playwright `[OHW-044-B]` asserts:
  ```ts
  await page.keyboard.press("Meta+Backslash");
  await expect(page.locator("body")).toHaveAttribute("data-shell", "collapsed");
  await page.keyboard.press("Control+Alt+f");
  await expect(page.locator("body")).toHaveAttribute("data-shell", "focus");
  ```

---

## RESPAWN-WP-PAGES — Prose column collapse + duplicate tab label + Element Legend row

Branch: new — `refactor/ux-notion-v3-pages-iter-2`.

### Three connected page-layout bugs

#### A. Prose column collapsed to 38px (TKT-LEAD-03, NEW BLOCKER)

`apps/web/app/features/documents/components/NarrativeEditor.tsx:454-460` and
`packages/ui/src/composites/NarrativeDocsShell/…` — the `_pageShell_1j7nu_17`
flex item collapses because its sibling `MarginNotesColumn` is greedy.

Fix: convert the layout from naive flex to grid with explicit columns:

```css
.editorLayout {
  display: grid;
  grid-template-columns: minmax(0, 720px) minmax(0, 1fr);
  gap: var(--space-6);
}
@container (max-width: 900px) {
  .editorLayout {
    grid-template-columns: 1fr;
  }
  /* MarginNotesColumn collapses below the prose page or hides */
}
```

For Trattamento (3-column = TOC + prose + notes), use:

```css
.editorLayout[data-with-toc="true"] {
  grid-template-columns: minmax(160px, 220px) minmax(0, 720px) minmax(0, 1fr);
}
```

Add `min-width: 0` to every grid item that contains ProseMirror so the
prose column doesn't bloat its parent.

#### B. Duplicate doc-type label (TKT-LEAD-04, STILL MAJOR)

The `_docTypeLabel_g65jo_22` span renders the active doc-type next to the
tab row, looking like a 5th tab. Either:

- Remove the label entirely (the active tab already shows the doc-type), OR
- Move it to the TopStrip breadcrumb only.

File: `apps/web/app/features/documents/components/NarrativeDocsShell.tsx` (or
wherever the tab strip is composed). Search: `docTypeLabel`.

#### C. Element Legend wrong row (TKT-LEAD-05, STILL MAJOR)

`apps/web/app/features/screenplay-editor/components/ScreenplayPage.tsx`
surfaces the legend via the TopBar slot, but `TopBar.tsx` mounts the
slot in `viewbarCenter` (ROW 1) instead of a true row 2.

Refactor `packages/ui/src/shell/TopBar/TopBar.tsx`:

```tsx
<nav data-row="1" className={styles.row}>
  {breadcrumb} {scopeChip} {versionPill} {saveState}
</nav>;
{
  elementLegend && (
    <nav data-row="2" className={styles.row}>
      {elementLegend}
    </nav>
  );
}
```

CSS:

```css
.viewbar {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  min-height: 40px;
}
.row[data-row="2"] {
  border-block-start: 1px solid var(--ds-line-soft);
}
```

Move `Esporta PDF` from FloatingDock (per RESPAWN-WP-CLEANUP) into the
row-2 right slot.

#### D. Trattamento layout overlap (NEW MAJOR)

The 3-column collapse in Trattamento produces overlap between INDICE box
and editor toolbar. Same root fix as A — grid template with `min-width: 0`.

#### E. Scaletta empty-state column collapse (NEW MAJOR)

The empty-state placeholder `Nessun atto. Aggiungi il primo atto per
iniziare la scaletta.` is in a flex item with no `min-width: 0` and gets
single-word-per-line. Same fix as A.

#### F. Locations page completely unstyled (NEW BLOCKER)

`apps/web/app/features/locations/components/LocationsPage.tsx` renders
raw HTML with no CSS classes; the page is unusable. Suspect: a CSS module
that was deleted in the WP-SIDEBAR-NOTION merge. Investigate the import
chain. If `LocationsPage.module.css` still exists, verify the className
attribution. If it was deleted, restore from `refactor/ux-notion-v3-pages`
branch or `origin/refactor/ux-notion-v3` 2 merges back.

### Acceptance

- `iter1-soggetto.png` redo shows prose column at ~600-720px wide, full
  paragraphs reflowed normally.
- `iter1-treatment.png` redo shows no INDICE overlap.
- `iter1-outline.png` redo shows empty-state placeholder text reading
  normally.
- `iter1-locations.png` redo shows the styled list+map split layout per
  spec §Locations.
- `iter1-screenplay.png` redo shows the Element Legend on ROW 2,
  visually separated from Indice/VERSIONI.
- No `_docTypeLabel` SPAN renders to the right of the tab row.
- Playwright asserts:
  ```ts
  // [OHW-044-D]
  const prose = page.locator(".ProseMirror").first();
  await expect(prose).toHaveCSS("width", /[6-9][0-9][0-9]px|7[0-9][0-9]px/);
  await expect(
    page.locator('[data-row="2"]').getByText(/SCENE/i),
  ).toBeVisible();
  await expect(page.getByText("SOGGETTO", { exact: true })).toHaveCount(1);
  ```

---

## RESPAWN-WP-DOCS — Documentation drift

Branch: `refactor/ux-notion-v3-docs` (continuation).

### What to fix

1. `docs/specs/44-shell-refactor-notion-style.md §Glossary` — add an explicit
   note that "Element Legend" lives on a true second `data-row="2"` of the
   TopBar (with a dotted-line example or screenshot reference).
2. `CLAUDE.md` "Never do" — append:
   - "Never reintroduce per-page `<FloatingDock />`. The global BottomDock
     in AppShell owns the bottom-right corner; per-page primary actions
     belong in the TopStrip right slot or a `•••` overflow."
   - "Never style prose columns without `min-width: 0` on flex/grid items
     containing ProseMirror. The default content-based sizing collapses
     the column to a single character."
3. `docs/conventions/css.md` — add §"Prose column lanes" with the
   `min-width: 0` rule.
4. `docs/specs/44-design-notes.md`, `docs/specs/44-lead-report.md`,
   `docs/specs/44-respawn-tickets.md` — add a "Status: SUPERSEDED BY
   iter-1 lead-final review" header. They reported "all green" before
   iteration 1 proved them stale.

### Acceptance

- Re-running iter-1 walk-through finds the spec language matches shipped
  behaviour OR shipped behaviour has been updated to match the spec.
- CLAUDE.md never-do list has the 2 new entries.

---

## Dispatch order

All four respawns are INDEPENDENT and can run in parallel:

1. WP-CLEANUP — universal FloatingDock removal.
2. WP-CHAT-FIX — drawer header chrome.
3. WP-SIDEBAR-NOTION — focus mode + shortcuts + label.
4. WP-PAGES — prose column + tab label + legend row + Locations + Trattamento.
5. WP-DOCS — drift sync.

Dispatch via `Agent` tool with `isolation: worktree`; merge results into
`refactor/ux-notion-v3-iter-2-merged` for iteration 2 verification.
