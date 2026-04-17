# Spec 08 — Scene Numbering (Manual Edit + Resequence)

## Context

Scene numbers are a first-class artefact in production: once a script goes into pre-production, scenes are locked and any new scene gets a suffixed number (`12A`, `12B`) while removed scenes become `OMITTED`. During development, writers want the opposite — clean sequential numbering that auto-updates as scenes move.

Oh Writers needs to serve both modes:

- **Manual edit**: click a scene number in the editor gutter and type a new one (e.g. `12A`, `OMITTED`, or just `47`).
- **Resequence**: a menu action that renumbers every scene `1, 2, 3, …` sequentially, overwriting any manual values.

This spec assumes Spec 06 (toolbar popover) is in place — the "Ricalcola numerazione" entry lives there.

---

## User Story

As a writer, I want to click a scene number to override it for shooting-script needs, and I want a one-click action that resets the whole screenplay to clean sequential numbers when I've reorganized the outline.

---

## Behaviour

### Scene-number storage

Each `scene_heading` node in the ProseMirror schema gains an optional `number` attribute (string, max 10 chars). When present it overrides the auto-computed sequential number; when absent or empty the scene displays its computed index.

The doc is source of truth — no separate DB column for scene numbers. Yjs carries the attribute like any other node attr.

### Display in the editor

Scene numbers render in a **non-editable gutter** on both sides of the scene heading (left and right, mirroring industry convention). The gutter shows:

- the manual `number` attr if set
- otherwise the 1-based sequential index among `scene_heading` nodes in document order

Gutter cells are clickable. Click → opens a tiny inline popover with a text input pre-filled with the current value (manual or computed) and two buttons: **Salva** / **Rimuovi override**. Esc cancels. Enter saves.

### Manual edit — validation

- Allowed characters: `A-Z`, `0-9`, space, `-`, and the literal `OMITTED`
- Max length: 10
- Whitespace trimmed; uppercased on save
- Empty input after trim + Save → same as "Rimuovi override" (clears the attribute)

Invalid input → inline error under the field, save button disabled.

### Resequence action

Menu item **"Ricalcola numerazione scene"** in the toolbar popover.

On click:

1. Confirmation dialog: _"Sovrascrivere tutti i numeri scena manuali con una numerazione sequenziale?"_
2. On confirm → a ProseMirror transaction walks every `scene_heading` node in document order and sets `number = String(index + 1)` (or removes the attr entirely — choose removal so the gutter falls back to the computed index, which is identical and cheaper)
3. Transaction runs through Yjs so collaborators see the change

Implementation note: prefer clearing the attribute over writing sequential strings. Clearing means "follow document order" forever, which is what the writer asked for. Writing `"1", "2", "3"` would re-diverge from document order the moment a scene is inserted.

### Interaction with collaboration

- Manual edits and resequence both go through regular ProseMirror transactions → Yjs syncs them automatically
- Two collaborators editing the same scene number: last-write-wins via Yjs (acceptable — scene numbers rarely race)

---

## UI

### Gutter

CSS: absolute-positioned flex columns on `.sceneHeadingBlock::before` and `::after`, or dedicated React decorations via a ProseMirror plugin (prefer the plugin — decorations are outside the doc and don't interfere with selection).

Visual: monospaced, small, muted colour; on hover a subtle background + cursor pointer indicates clickability.

### Inline popover

Floating panel anchored to the clicked gutter cell. Reuses the `useMenuPopover` hook from Spec 06 for outside-click/Esc handling.

### Confirmation dialog

Reuses the existing confirmation dialog component from Spec 05c (Import PDF).

---

## Test fixtures

### Unit — `tests/fixtures/scene-numbering/*.json`

ProseMirror doc fragments serialised as JSON, one per case:

| File                            | Covers                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `01-sequential.json`            | 5 scenes, no manual numbers → gutter shows `1..5`              |
| `02-mixed-manual.json`          | Scenes with some manual numbers (`12A`, `OMITTED`)             |
| `03-all-manual.json`            | Every scene has a manual number                                |
| `04-resequence-clears-all.json` | Before/after pair: manual numbers cleared by resequence action |

### E2E — no new PDFs; reuse Spec 05c seeded screenplay.

---

## Error handling

| Situation                                 | Outcome                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| Invalid character typed into manual input | Inline error, save disabled                             |
| Input exceeds 10 chars                    | Truncated in the input, inline error                    |
| Yjs sync error during resequence          | Toast "Impossibile ricalcolare la numerazione, riprova" |
| Resequence on empty screenplay            | No-op, no toast                                         |

No server function is strictly needed — the transaction runs on the client and propagates via Yjs. We therefore don't introduce a new error class file; validation errors stay local to the popover component.

---

## Files

### Create

| File                                                                           | Purpose                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `features/screenplay-editor/lib/scene-number.ts`                               | Pure helpers: `validateSceneNumber`, `resequenceTransaction`  |
| `features/screenplay-editor/lib/scene-number.test.ts`                          | Vitest for validator + resequence transaction                 |
| `features/screenplay-editor/plugins/sceneNumberGutter.ts`                      | ProseMirror plugin that decorates scene headings with gutters |
| `features/screenplay-editor/components/SceneNumberPopover.tsx` + `.module.css` | Inline edit popover                                           |

### Modify

| File                                                             | Change                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `features/screenplay-editor/schema.ts`                           | Add optional `number` attr to `scene_heading` node                                                                             |
| `features/screenplay-editor/components/ProseMirrorView.tsx`      | Register the new plugin; wire click → `SceneNumberPopover`                                                                     |
| `features/screenplay-editor/components/ToolbarMenu.tsx`          | Enable "Ricalcola numerazione scene" item; wire to confirmation + resequence tx                                                |
| `features/screenplay-editor/lib/fountain-from-pdf.ts` (Spec 05c) | When a scene heading is preceded/followed by a stripped number column, preserve it as the `number` attr instead of dropping it |
| `features/screenplay-editor/lib/doc-to-fountain.ts`              | Serialise `number` attr back into Fountain using the `#12A#` scene-number marker                                               |

The fountain-from-pdf change is a refinement of Spec 05c's Pass 1 "strip scene number columns" rule: capture before stripping. Update spec 05c's text to cross-reference this once Spec 08 lands.

---

## Tests

### Vitest — `scene-number.test.ts`

- `validateSceneNumber` accepts `1`, `12A`, `OMITTED`, rejects lowercase, rejects length > 10, rejects special chars
- `resequenceTransaction` clears the `number` attr on every `scene_heading` in a doc fragment
- Fixture round-trips: applying resequence to `04-resequence-clears-all.json`'s "before" produces its "after"

### Playwright — `tests/editor/scene-number.spec.ts`

| Tag     | Description                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------- |
| OHW-120 | New scenes show sequential numbers in left and right gutter                                          |
| OHW-121 | Click on a gutter cell opens the inline popover pre-filled with the current value                    |
| OHW-122 | Save `12A` → gutter shows `12A` on both sides, persisted across reload                               |
| OHW-123 | Save `OMITTED` → gutter shows `OMITTED`                                                              |
| OHW-124 | Invalid input (`12a`) → inline error, save disabled                                                  |
| OHW-125 | "Rimuovi override" clears the attribute; gutter falls back to the sequential index                   |
| OHW-126 | Toolbar menu "Ricalcola numerazione scene" → confirmation dialog                                     |
| OHW-127 | After confirm, all manual overrides are cleared; gutter shows clean `1, 2, 3…`                       |
| OHW-128 | Resequence on an empty screenplay is a no-op (no error)                                              |
| OHW-129 | Import PDF with scene-number columns preserves the original numbers as manual overrides (Spec 05c +) |
| OHW-130 | Two collaborators: A edits scene 5 → `5A`, B sees the update via Yjs                                 |

---

## Mock mode

No new mocks needed; no server surface.

---

## Scope — not in this spec

- Locked/unlocked pages workflow (production lock) → future
- Scene-number revision colours (blue, pink, yellow pages) → future
- Per-scene metadata panel (shooting day, estimated pages) → Spec 09+
- Bulk "renumber from scene N" partial resequence → future
