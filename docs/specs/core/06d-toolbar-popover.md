# Spec 06 — Toolbar Popover Menu

## Context

The screenplay editor toolbar currently exposes individual buttons (Import PDF already landed in Spec 05c; Export PDF, Versions, etc. are growing). As Spec 07 (Title Page) and Spec 08 (Scene Renumber + PDF Export) add more actions, the toolbar will become crowded. We consolidate screenplay-level actions behind a single popover menu anchored to the top-right of the editor.

This spec only introduces the menu shell and migrates existing entries. Frontespizio composition (Spec 07) and renumber logic (Spec 08) live in their own specs — this spec just reserves their slots in the menu.

---

## User Story

As a writer, I want one clear "actions" button in the top-right of the editor so I can reach Import, Export, Versions, Title Page, and Renumber without hunting across the toolbar.

---

## Behaviour

### Entry point

A single icon button in the top-right of the screenplay toolbar (`⋯` or similar). Click toggles a popover anchored to the button.

### Menu items (in order)

1. **Import PDF** — triggers the existing `ImportPdfButton` file picker flow (migrated from toolbar-level button)
2. **Export PDF** — placeholder / wired to Spec 08 exporter when it lands
3. **Ricalcola numerazione scene** — wired in Spec 08
4. **Versioni** — opens the existing `VersionsList` drawer/modal
5. **Frontespizio** — opens the title-page editor from Spec 07

Disabled items (export, renumber, title page) render greyed-out with a tooltip "Disponibile a breve" until their owning spec lands — this keeps the menu layout stable as features arrive.

### Interaction

- Click outside → closes
- `Esc` → closes
- `Enter` / click on item → runs action, closes popover
- Keyboard navigation with `ArrowUp` / `ArrowDown`, focus trap while open
- Respects `prefers-reduced-motion`

---

## UI

Popover is a plain floating panel, flex column of menu items. Anchored under the trigger, right-aligned. No external library — pure CSS Module + React state. Focus management handled manually (a `useMenuPopover` hook encapsulates keyboard + outside-click + focus trap).

Each item is a `<button>` with a leading icon and label. Destructive/danger styling not needed for any item in this spec.

---

## Test fixtures

No new fixtures. Uses the same project/screenplay seeded by existing E2E setup.

---

## Error handling

This spec has no server surface. Errors from the underlying actions (Import PDF, etc.) surface through their own existing flows.

---

## Files

### Create

| File                                                                        | Purpose                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| `features/screenplay-editor/components/ToolbarMenu.tsx` + `.module.css`     | Popover trigger + panel                          |
| `features/screenplay-editor/components/ToolbarMenuItem.tsx` + `.module.css` | Single menu row (icon + label + disabled state)  |
| `features/screenplay-editor/hooks/useMenuPopover.ts`                        | Open/close state, outside-click, Esc, focus trap |

### Modify

| File                                                          | Change                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `features/screenplay-editor/components/ScreenplayToolbar.tsx` | Remove inline `<ImportPdfButton>`; add `<ToolbarMenu>` in top-right slot                        |
| `features/screenplay-editor/components/ImportPdfButton.tsx`   | Split: keep the file-picker + confirmation logic as `useImportPdf()` hook, consumed by the menu |
| `features/screenplay-editor/components/ScreenplayEditor.tsx`  | Pass `onImport`, `onOpenVersions`, `onOpenTitlePage` handlers to the menu                       |
| `features/screenplay-editor/index.ts`                         | Export the menu component                                                                       |

---

## Tests

Playwright — `tests/editor/toolbar-menu.spec.ts`

| Tag     | Description                                                                          |
| ------- | ------------------------------------------------------------------------------------ |
| OHW-100 | Toolbar shows a single menu trigger; Import PDF button no longer sits in the toolbar |
| OHW-101 | Click trigger → popover opens, Esc closes                                            |
| OHW-102 | Click outside popover closes it                                                      |
| OHW-103 | Arrow keys move focus between enabled items                                          |
| OHW-104 | "Import PDF" item opens the system file picker (same flow as Spec 05c)               |
| OHW-105 | "Versioni" item opens the versions drawer                                            |
| OHW-106 | Export PDF, Ricalcola numerazione, Frontespizio render as disabled with tooltip      |

Existing Spec 05c import tests (OHW-070 …) must continue to pass after Import PDF is moved inside the popover — update selectors to reach it through the menu.

---

## Scope — not in this spec

- Title page UI itself → Spec 07
- Scene renumber logic and manual edit → Spec 08
- PDF export → Spec 08
- Mobile/compact layout of the menu → future
