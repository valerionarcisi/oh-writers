# Spec 05f — Custom Screenplay Editor (ProseMirror)

> Replaces Monaco with a ProseMirror-based editor that renders the screenplay
> as a structured document with physical-page layout — character cue centred,
> dialogue in narrow column, transition flush-right, automatic scene numbers,
> real page breaks. WYSIWYG: what the writer sees on screen is the PDF output.

## Why

Monaco is a code editor — it renders text in fixed monospace columns with no
notion of element-specific margins. The current "indent via spaces" approach
(`CHARACTER_INDENT = "      "`) is fragile, breaks on font changes, and does
not match what a real screenplay looks like on paper.

Professional writers expect the editor to show the page exactly as it will
print. That means:

- Character cue visually centred (~3.7" from left)
- Dialogue in a narrow column (2.5" left, ~3.5" wide)
- Parenthetical indented (~3.1")
- Transition flush-right
- Automatic scene numbers flush-left AND flush-right
- True page separation with `(MORE)` / `(CONT'D)` when dialogue splits across
  pages
- Scene-heading bold

None of this is achievable with Monaco without ugly hacks. A structured editor
model is the correct tool.

## Decision — ProseMirror

ProseMirror is the chosen framework:

- **Structured document model** — each Fountain element is a typed node, not
  a string with indent spaces
- **Full CSS layout control** — block-level CSS determines position; no fixed
  columns
- **Yjs binding is mature** (`y-prosemirror`) — keeps Spec 09 (real-time
  collab) working
- **Battle-tested** — Notion, Atlassian, Evernote ship on it
- **Plugin-based** — scene numbers, paginator, autocomplete become orthogonal
  plugins

Alternatives considered and rejected:

- **Tiptap** — React wrapper on PM. Cleaner API but abstracts away the
  low-level view we need for the paginator.
- **Lexical** — fast, modern, but Yjs integration less proven.
- **CodeMirror 6** — code-editor DNA, same layout limits as Monaco at this
  level of tipographic control. CM6 remains the mobile target per existing
  strategy; it is complementary, not a replacement on desktop.
- **Vanilla contenteditable** — cross-browser selection bugs make it a
  non-starter.

## Scope

### In scope

- Full replacement of Monaco on desktop for the screenplay editor
- ProseMirror schema with typed nodes for every Fountain element
- Physical-page CSS layout (white page on dark canvas, correct margins)
- Automatic scene numbering with left + right gutter rendering
- Automatic page breaks with `(MORE)` / `(CONT'D)` carry-over for dialogue
- All Spec 05e keybindings (Tab/Enter/Alt+letter) ported to PM commands
- Element picker widget on empty lines (already DOM-portable)
- Autocomplete for character cues, scene locations, transitions (ported)
- Yjs binding via `y-prosemirror` for real-time collaboration
- Fountain import/export (roundtripable)
- Migration of existing screenplays from Fountain-with-indent-spaces to
  ProseMirror doc JSON
- PDF export reads from the PM doc (more accurate than Fountain re-parsing)

### Out of scope (separate specs)

- **Title page** (first page with title/author centred) — future sub-spec
- **Dual dialogue** (two characters side-by-side) — future
- **Act breaks** (`ACT I` / `ACT II` headers) — future
- **Revision marks** (asterisks in margins for revision colours) — ties into
  Spec 06b
- **Mobile editor** — CodeMirror 6, covered by future spec
- Title-page and cover-page layout polish

## Visual Reference

The target look is a standard US Letter screenplay:

- Dark canvas background `#2a2927` filling the viewport behind the page
- White page `#ffffff`, 8.5" × 11" (816px × 1056px at 96dpi) drop-shadowed,
  centred
- Physical margins: 1.5" left / 1" right / 1" top / 1" bottom
- Courier Prime 12pt, single-line spacing (line-height 1.0, ~14px line)
- Scene-heading **bold**, uppercase, left-flush (at 1.5")
- Action left-flush, unchanged width (6" wide max)
- Character cue uppercase, offset to ~3.7" from page left edge (≈ 2.2" from
  margin start)
- Dialogue offset to ~2.5" from page left, max-width ~3.5"
- Parenthetical offset to ~3.1", italic, grey
- Transition flush-right at the right margin (1" from right edge)
- Scene numbers: small grey digits in the left gutter (~0.5" from page edge)
  AND the right gutter, aligned with the scene heading line

## Document Model (ProseMirror Schema)

```
doc
├── title?         (top-level, optional — future, not in v1)
├── scene+         (one or more scenes; each scene groups a heading and its
│                   body blocks)
│   ├── heading    (single-line block, inline text, attrs: { number: int })
│   ├── (body)+    where body is one of:
│   │   ├── action
│   │   ├── character     (always followed by zero or more parens/dialogues)
│   │   ├── parenthetical
│   │   ├── dialogue
│   │   └── transition
│   │   └── shot          (forced-action / general — future Alt+G)
└── transition?    (top-level transitions outside a scene, e.g. FADE OUT.)
```

All blocks are **block-level** (no mixed inline). Text within a block is
plain `text` inline with optional `em`/`strong`/`underline` marks (Spec 05e
bold/italic — already on roadmap).

**Scene `number` is a computed attribute**, not text. The scene-numbers
plugin recomputes it on every transaction and rewrites the heading node's
attrs when the order changes. Rendering of the number is done by a widget
decoration (absolute-positioned span in the gutter) — the number is never
part of the editable text.

### Schema — TypeScript

```typescript
// features/screenplay-editor/lib/schema.ts
import { Schema } from "prosemirror-model";

export const schema = new Schema({
  nodes: {
    doc: { content: "(scene | transition)+" },

    scene: {
      content: "heading body*",
      group: "block",
      defining: true,
      parseDOM: [{ tag: "section.pm-scene" }],
      toDOM: () => ["section", { class: "pm-scene" }, 0],
    },

    heading: {
      content: "text*",
      attrs: { number: { default: null } },
      parseDOM: [{ tag: "h2.pm-heading" }],
      toDOM: () => ["h2", { class: "pm-heading" }, 0],
    },

    action: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-action" }],
      toDOM: () => ["p", { class: "pm-action" }, 0],
    },

    character: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-character" }],
      toDOM: () => ["p", { class: "pm-character" }, 0],
    },

    parenthetical: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-parenthetical" }],
      toDOM: () => ["p", { class: "pm-parenthetical" }, 0],
    },

    dialogue: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-dialogue" }],
      toDOM: () => ["p", { class: "pm-dialogue" }, 0],
    },

    transition: {
      content: "text*",
      group: "body",
      parseDOM: [{ tag: "p.pm-transition" }],
      toDOM: () => ["p", { class: "pm-transition" }, 0],
    },

    text: { group: "inline" },
  },

  marks: {
    strong: { parseDOM: [{ tag: "strong" }], toDOM: () => ["strong", 0] },
    em: { parseDOM: [{ tag: "em" }], toDOM: () => ["em", 0] },
    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM: () => ["u", 0],
    },
  },
});
```

## CSS Layout

One CSS Module `prosemirror.module.css` drives the look.

```css
/* features/screenplay-editor/styles/prosemirror.module.css */

.editorRoot {
  /* ProseMirror root — fills the page card */
  font-family: var(--font-mono);
  font-size: 12pt; /* industry standard — never parameterise */
  line-height: 1;
  color: #111;
  caret-color: #111;
  outline: none;
  padding-block-start: 1in; /* 1" top margin */
  padding-block-end: 1in;
}

.editorRoot
  :is(
    .pmHeading,
    .pmAction,
    .pmCharacter,
    .pmDialogue,
    .pmParenthetical,
    .pmTransition
  ) {
  /* Reset browser defaults — every element spacing is explicit */
  margin: 0;
}

/* Scene heading — bold, uppercase, full width from left margin */
.pmHeading {
  font-weight: 700;
  text-transform: uppercase;
  margin-block-start: 2em; /* blank line above */
  margin-block-end: 1em;
}
.pmHeading:first-of-type {
  margin-block-start: 0;
}

/* Action — full width, no indent */
.pmAction {
  margin-block-end: 1em;
}

/* Character — centred on the page's text column */
.pmCharacter {
  text-transform: uppercase;
  margin-inline-start: 2.2in; /* 3.7" - 1.5" = 2.2" from margin */
  margin-block-start: 1em;
}

/* Parenthetical — italic, slight indent */
.pmParenthetical {
  font-style: italic;
  margin-inline-start: 1.6in; /* 3.1" - 1.5" */
  max-inline-size: 2in;
}

/* Dialogue — narrow column */
.pmDialogue {
  margin-inline-start: 1in; /* 2.5" - 1.5" */
  max-inline-size: 3.5in;
}

/* Transition — flush right */
.pmTransition {
  text-transform: uppercase;
  text-align: end;
  margin-block: 1em;
}

/* Scene number gutters (rendered by the scene-numbers plugin as absolute
   widgets positioned relative to the page card). */
.pmSceneNumberLeft,
.pmSceneNumberRight {
  position: absolute;
  font-size: 10pt;
  color: #999;
  user-select: none;
  pointer-events: none;
}
.pmSceneNumberLeft {
  inset-inline-start: 0.5in;
}
.pmSceneNumberRight {
  inset-inline-end: 0.5in;
}

/* Page break — rendered by the paginator plugin as a block-level marker.
   Visually a dark gap between white pages; in print a real page break. */
.pmPageBreak {
  display: block;
  block-size: calc(var(--dark-gap, 24px));
  margin-inline: -1.5in -1in; /* extend through the page margins */
  background: transparent;
  page-break-after: always;
}

/* Carry-over labels inserted by paginator when dialogue splits a page */
.pmMore {
  text-transform: uppercase;
  margin-inline-start: 2.2in;
  font-style: italic;
  color: #666;
}
.pmContd::after {
  content: " (CONT'D)";
  color: #666;
}
```

Values in `in` units are intentional — the CSS matches the physical page
specification one-for-one. No CSS variables for page geometry: the numbers
are industry standard and must not drift.

## Plugins

### 1. `keymap` — keyboard behaviour

Wraps Spec 05e/05d keybindings as PM commands:

- `Tab` → apply `nextElementOnTab(currentType)` to the block at cursor
- `Enter` → split block, new block's type = `nextElementOnEnter(currentType)`
- `Alt+S/A/C/D/P/T` → force block type (same six as today)
- `Cmd+Shift+F` → fire `screenplay:toggleFocusMode` DOM event (unchanged)

The _logic_ (`nextElementOnTab`, `nextElementOnEnter`, `applyElement`) is
already pure and editor-agnostic. Only the _commands_ change: instead of
`executeEdits` on a Monaco model, we call PM `setBlockType` transactions.

### 2. `scene-numbers` — automatic numbering

Plugin state tracks the scene index at every `heading` node. On each
transaction:

1. Walk the doc, assign incrementing index to every `heading`
2. If a heading's current `attrs.number` differs, dispatch a transaction
   updating the node attrs
3. Decorations set: for each heading, insert a left-gutter widget and a
   right-gutter widget showing the number

Widgets are block-level decorations anchored to the start of the heading
node. They render as `<span>` elements with absolute positioning via the
CSS classes above. The page card is `position: relative` so the absolute
positioning works.

### 3. `paginator` — page break rendering

The hardest plugin. On every significant change:

1. Measure the actual pixel position of every block via
   `view.coordsAtPos(pos)`
2. Find the first block whose bottom crosses the 10" mark (11" page - 1"
   bottom margin)
3. Insert a `pm-page-break` block-level widget decoration before that block
4. **Dialogue carry-over**: if the split happens inside a `dialogue`, split
   the dialogue and insert `(MORE)` at the end of page N and
   `CHARACTER (CONT'D)` at the start of page N+1
5. Repeat until all content is paginated

`(MORE)` / `(CONT'D)` are **decorations**, not model nodes — they appear on
screen but never enter the doc. The export layer (Fountain / PDF) inserts
them into the output string when it detects the same condition.

v1 fallback: if MORE/CONT'D logic is too delicate, ship page breaks only and
tolerate dialogue splitting mid-sentence until v1.1.

### 4. `autocomplete`

Reimplements current dropdown logic on top of PM:

- `character` block context → show unique character names from the doc
- `heading` block after `INT./EXT. ` trigger → show locations + next scene
  number
- `transition` block (empty or partial) → show FADE OUT, CUT TO, etc.

Rendering is a DOM dropdown positioned via `view.coordsAtPos(cursor)`. Zero
PM-widget magic — the dropdown is a portal to `document.body`.

### 5. `element-picker`

The existing empty-line element picker (Spec 05e #3) is already a pure DOM
widget. It ports by:

- Listening for PM selection changes instead of Monaco cursor events
- Reading the current block type via `state.selection.$from.parent.type.name`
- Showing/hiding the widget on type === `action` && empty content

### 6. `yjs-sync`

Wires `y-prosemirror`:

- `ySyncPlugin(yXmlFragment)` — doc ↔ Yjs sync
- `yCursorPlugin(awareness)` — remote cursors
- `yUndoPlugin()` — collaborative undo

The ws-server (Spec 09) is unchanged — same y-websocket protocol, same room
auth.

## Fountain Import/Export

Two pure functions, extensively tested:

```typescript
// features/screenplay-editor/lib/fountain-to-doc.ts
export const fountainToDoc = (text: string): Node;

// features/screenplay-editor/lib/doc-to-fountain.ts
export const docToFountain = (doc: Node): string;
```

**Invariant:** `fountainToDoc(docToFountain(d)) equals d` (up to whitespace
normalisation). Tested with a corpus of real screenplays (seed files + a
few public-domain scripts).

`fountainToDoc` reuses the existing `detectElement` line-classifier — it
walks the input line by line, classifies each line, groups them into scenes,
emits PM nodes.

`docToFountain` walks the PM doc in document order, emits:

- heading → `INT./EXT. LOCATION - TIME` (uppercase, no number — numbering is
  derived on export if the output format requires it)
- character → indented cue (for Fountain interop, the character line is
  written with `CHARACTER_INDENT` spaces so the file is still valid Fountain
  when opened outside Oh Writers)
- dialogue → indented block with `DIALOGUE_INDENT`
- parenthetical → wrapped in `()`, indented
- transition → flush-right with padding to `TRANSITION_COLUMN_WIDTH`

Import/export preserves the Fountain format on disk for portability. The
**runtime** uses PM doc exclusively.

## Data Migration

### Schema change

```sql
-- packages/db/migrations/NNNN_add_pm_doc.sql
ALTER TABLE screenplays
ADD COLUMN pm_doc JSONB;

-- Index for queries that extract statistics from the doc
CREATE INDEX screenplays_pm_doc_gin ON screenplays USING gin (pm_doc);
```

### Backfill

One-off script (`scripts/backfill-pm-doc.ts`):

1. Select every `screenplays` row where `pm_doc IS NULL`
2. For each: `pm_doc = fountainToDoc(content).toJSON()`
3. `UPDATE screenplays SET pm_doc = $1 WHERE id = $2`
4. Log any parse failures — fix the fountain text manually, re-run

### Runtime reads

Loader priority:

1. `pm_doc` → use directly
2. fallback: `fountainToDoc(content)` → save back so the column fills over
   time (self-healing migration)

### Writes

Every save writes both:

- `pm_doc` — source of truth at runtime
- `content` — `docToFountain(pm_doc)` for export compatibility

### Yjs state

`yjs_state` column is reset during migration — the existing `y-monaco` state
is incompatible with `y-prosemirror`. On first load after migration, the
server initialises a new Yjs doc from `pm_doc`.

## Files To Add

```
features/screenplay-editor/
├── components/
│   └── ProseMirrorView.tsx           NEW — mounts the editor
├── lib/
│   ├── schema.ts                     NEW — PM schema definition
│   ├── schema-commands.ts            NEW — setBlockType commands
│   ├── fountain-to-doc.ts            NEW — Fountain → PM doc
│   ├── doc-to-fountain.ts            NEW — PM doc → Fountain
│   └── plugins/
│       ├── keymap.ts                 NEW — keybindings
│       ├── scene-numbers.ts          NEW — auto scene numbering
│       ├── paginator.ts              NEW — page break rendering
│       ├── autocomplete.ts           NEW — dropdown (ported)
│       ├── element-picker.ts         NEW — empty-line picker (ported)
│       └── yjs-sync.ts               NEW — y-prosemirror wiring
└── styles/
    └── prosemirror.module.css        NEW — page layout
```

## Files To Remove

```
features/screenplay-editor/
├── components/
│   └── MonacoWrapper.tsx             DELETE
└── lib/
    ├── fountain-language.ts          DELETE (Monaco-specific tokenizer)
    ├── fountain-keybindings.ts       DELETE (Monaco-specific)
    ├── fountain-autocomplete.ts      DELETE (logic moves to plugin)
    ├── fountain-page-breaks.ts       DELETE (replaced by paginator)
    └── fountain-element-picker.ts    DELETE (re-ported as plugin)
```

## Files To Keep (reused as-is)

```
features/screenplay-editor/lib/
├── fountain-constants.ts             (CHARACTER_INDENT, DIALOGUE_INDENT,
│                                      SCENE_HEADING_RE, transitions)
├── fountain-element-detector.ts      (detectElement — pure, used by
│                                      fountain-to-doc)
├── fountain-element-transforms.ts    (nextElementOnTab/Enter — pure,
│                                      used by keymap plugin)
└── page-counter.ts                   (line counting — still useful for the
                                      toolbar "Page X of Y" indicator)
```

## Dependencies

Add:

- `prosemirror-state@^1.4.3`
- `prosemirror-view@^1.33.1`
- `prosemirror-model@^1.19.4`
- `prosemirror-transform@^1.8.0`
- `prosemirror-commands@^1.5.2`
- `prosemirror-keymap@^1.2.2`
- `prosemirror-history@^1.3.2`
- `y-prosemirror@^1.2.6`

Remove:

- `@monaco-editor/react`
- `monaco-editor`
- `y-monaco` (if present)

Total new dep weight ≈ 150 KB gzipped (ProseMirror is lightweight). Monaco
alone is ~2 MB gzipped — net bundle reduction is significant.

## Server Functions

Additions in `features/screenplay-editor/server/screenplay.server.ts`:

```typescript
// Save PM doc (preferred) — also writes Fountain for export compat
saveScreenplay({
  id: ScreenplayId,
  pmDoc: unknown,    // PM doc JSON
  fountain: string,  // docToFountain(pmDoc) — computed client-side
}): ResultShape<Screenplay, NotFoundError | ForbiddenError | DbError>;
```

The existing `getScreenplay` extends its view to include `pmDoc` alongside
`content`. Client prefers `pmDoc`; if absent falls back to parsing `content`.

PDF export server function (Spec 05 existing) switches input from Fountain
string to PM doc JSON — exact output instead of re-parsing.

## Keybindings Parity Matrix

Every Spec 05e binding must work identically after migration:

| Action          | Key           | v1 status | Notes                                     |
| --------------- | ------------- | --------- | ----------------------------------------- |
| Cycle element   | `Tab`         | required  | skips dialogue → action (existing matrix) |
| Next element    | `Enter`       | required  | flow matrix unchanged                     |
| Force scene     | `Alt+S`       | required  |
| Force action    | `Alt+A`       | required  |
| Force character | `Alt+C`       | required  |
| Force dialogue  | `Alt+D`       | required  |
| Force paren     | `Alt+P`       | required  |
| Force transit.  | `Alt+T`       | required  |
| Focus mode      | `Cmd+Shift+F` | required  |
| Empty picker    | (cursor only) | required  | widget on empty action block              |
| Bold            | `Cmd+B`       | future    | Spec 05e #6                               |
| Italic          | `Cmd+I`       | future    |
| Underline       | `Cmd+U`       | future    |

## Testing Strategy

### Vitest (pure logic)

- `fountain-to-doc.test.ts` — input Fountain → expected doc shape, for every
  element type plus edge cases (empty, comments, boneyards)
- `doc-to-fountain.test.ts` — expected Fountain for each node type
- `roundtrip.test.ts` — `fountainToDoc → docToFountain` on a corpus of real
  scripts, asserting equality
- `scene-numbers.test.ts` — state reducer: given a doc mutation, expected
  attribute updates

### Playwright (UI / E2E) — tags

- `[OHW-05f-01]` Tab on action block creates character block
- `[OHW-05f-02]` Enter after character creates dialogue block
- `[OHW-05f-03]` Alt+letter bindings work in every block context
- `[OHW-05f-04]` Typing `INT. KITCHEN - DAY` in a new scene shows scene
  number `1` in both gutters; adding a second scene renumbers to 1 and 2
- `[OHW-05f-05]` Empty-line picker appears on an empty action block and
  applies the chosen type
- `[OHW-05f-06]` Dialogue longer than one page produces a page-break widget
  and `(MORE)` / `(CONT'D)` labels
- `[OHW-05f-07]` Two browser tabs collaborating: changes in one appear in
  the other within 300 ms, scene numbers stay consistent
- `[OHW-05f-08]` Fountain import → editor shows correct layout for every
  element
- `[OHW-05f-09]` Export PDF produces output matching the editor view

## Implementation Phases

Each phase ends with a working commit, in order:

1. **Schema + bare view** — PM mounts, renders a hardcoded doc, nothing else
2. **Fountain import/export** — round-trip tests green
3. **Keybindings + element picker** — typing feels like Monaco version
4. **CSS layout + scene numbers** — visual match to StudioBinder
5. **Autocomplete** — character/location/transition dropdowns
6. **Paginator (page breaks only, no MORE/CONT'D)** — visible pages
7. **Yjs integration + DB migration** — collaboration working
8. **PDF export via PM doc** — output matches view
9. **MORE/CONT'D carry-over** (v1.1, optional for initial ship)

Each phase is a separate commit / PR. Phases 1–3 land together as a feature
flag-gated preview before flipping the default.

## Rollout

- Feature flag `screenplay_editor_v2` (default off for existing projects)
- New projects opt-in automatically after Phase 7 lands
- Existing projects migrate on first open after the flag flips
- Rollback: revert the flag; `content` column still holds Fountain for the
  old Monaco editor

## Risks and Mitigations

| Risk                                    | Mitigation                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Paginator complexity blows the timeline | Phase 9 (MORE/CONT'D) is optional for v1. Ship with hard page breaks only if needed.                                                 |
| Performance on 200-page docs            | Benchmark early (Phase 4). PM handles this in practice (Notion ships bigger docs); if not, the decorations plugin can chunk updates. |
| Yjs migration loses history             | `yjs_state` is wiped — users lose undo history across the migration. Acceptable; communicate in release notes.                       |
| Fountain roundtrip drift                | Heavy Vitest coverage on roundtrip; any drift is a bug to fix before merge.                                                          |
| Bundle size regression                  | Monaco (~2 MB) is removed; PM (~150 KB) replaces it. Net reduction.                                                                  |

## Out-of-Spec Follow-ups

After this spec ships, update:

- `docs/architecture.md` — Frontend → "Editor: ProseMirror" (remove Monaco)
- `CLAUDE.md` — "Never Do" loses Monaco rules, gains PM rules
- `docs/specs/05-screenplay-editor.md` — update "Monaco Editor — Setup"
  section to reflect PM
- Memory: `project_editor_strategy.md` updates to "ProseMirror desktop, CM6
  mobile"
