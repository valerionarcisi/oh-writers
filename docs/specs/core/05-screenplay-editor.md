# Spec 05 — Screenplay Editor

## User Stories

- As a writer I want an editor with a professional screenplay format
- As a writer I want to navigate between elements with Tab and Enter without using the mouse
- As a writer I want autocomplete for characters and locations already used
- As a writer I want to see the page counter in real time
- As a writer I want a focus mode with no distractions
- As a writer I want to export the screenplay as a PDF

## Routes

```
/projects/:id/screenplay     → screenplay editor
```

## Screenplay Format (Professional Standard)

- Font: Courier Prime 12pt
- Page: A4 or Letter (selectable)
- Standard US margins (Left 1.5", Right 1", Top/Bottom 1")

## Elements

```
SCENE HEADING    → uppercase, full width left
Action           → full width
CHARACTER        → centered (3.7" from left), UPPERCASE
(Parenthetical)  → slightly indented (3.1")
Dialogue         → indented (2.5" from left, up to 6")
TRANSITION:      → flush right
```

## Monaco Editor — Setup

- Custom language `fountain-screenplay` with tokenizer for each element
- Syntax highlighting
- Autocomplete for CHARACTER and SCENE HEADING locations
- Keybindings: Tab cycles elements, Enter confirms, @/# trigger autocomplete

## Page Counter

- 1 page ≈ 55 lines (industry standard estimate)
- Updated in real time
- Displayed as: "Page 12 / ~90 min"

## Real-time Collaboration

- Other users' cursors visible with a unique color and name
- Yjs CRDT for conflict resolution
- "N people online" indicator in the toolbar

## Focus Mode

- Toggle with Ctrl/Cmd+Shift+F
- Hides: sidebar, toolbar, header
- Dark background, text centered only

## PDF Export

- Professional format with margins, font, pagination
- Page 1: title + author centered
- Subsequent page headers: title + page number

## tRPC Procedures

```ts
// screenplays.get(projectId) → Screenplay
// screenplays.save(screenplayId, content) → Screenplay
// screenplays.getYjsState(screenplayId) → Uint8Array
// screenplays.exportPdf(screenplayId) → Buffer
// screenplays.parseScenes(screenplayId) → Scene[]
```

## PDF Generation Pipeline

1. Load `yjsState` from DB → apply to Yjs doc → extract plaintext
2. Run fountain parser → structured scene list with elements
3. Render to PDF via `pdfkit` (server-side, no headless browser)
4. Return `Buffer` to client as a file download

## Screenplay Parser

- Server-side, regex/state machine to identify elements
- Updated on every save (debounced, every 60s or manual)
- Scenes are **upserted by position** (`number`): renaming a heading updates the row, predictions are preserved
- Stale scenes (deleted from screenplay) are deleted; their predictions cascade-delete

## Test Coverage

- Tab from ACTION → CHARACTER type with correct margin
- Enter from CHARACTER → cursor in DIALOGUE
- Autocomplete CHARACTER shows only previously used names
- Page counter updates while writing
- PDF export → file downloaded with correct format
- Two users simultaneously → cursors visible, no conflicts
