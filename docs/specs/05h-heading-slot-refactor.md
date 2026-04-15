# 05h — Heading Slot Refactor

Sub-spec of `05g-scene-autocomplete-and-numbering.md`. Fixes a structural bug in
the current two-slot scene heading that breaks text input when either slot is
empty.

## Problem

Current schema (`apps/web/app/features/screenplay-editor/lib/schema.ts`):

```
heading  { content: "prefix title" }              ← block, textblock-ish
  prefix { content: "text*", isolating: true }    ← inline-rendered
  title  { content: "text*", isolating: true }    ← inline-rendered
```

Both `prefix` and `title` are PM nodes with inline text content, rendered as
sibling `<span>`s inside a single `<h2>`. When one slot is empty, ProseMirror
inserts `<br class="ProseMirror-trailingBreak">` but its DOM→state input
mapping resolves typed characters into the **preceding text node** — not the
empty slot where the caret visually sits.

### Observed failures

1. **Space/Tab navigation prefix→title fails to hold:** PM selection moves to
   title (assertion via `__ohWritersBlock()` passes), but the next keystroke
   gets routed back into prefix. All subsequent `Space` presses re-trigger
   navigation. Result: `"INT. CUCINA - NOTTE"` becomes `"INT.CUCINA-NOTTE"`
   collapsed into prefix. Covered by test S02.

2. **Scene button from scratch is a no-op:** user opens a fresh screenplay,
   clicks the "Scene" toolbar button. Cursor is already inside the empty
   heading's prefix → `setElement("scene")` returns `false` per
   `schema-commands.ts:64`. User types, input lands in Action because that's
   where the cursor actually was before the click.

## Fix

Promote `prefix` and `title` from inline-rendered nodes to **block textblocks**,
and make `heading` a wrapper that lays them out horizontally via CSS flex.

### New schema

```typescript
heading: {
  content: "prefix title",
  group: "block",
  attrs: { scene_number: { default: "" } },
  parseDOM: [{ tag: "h2.pm-heading", getAttrs }],
  toDOM: (node) => ["h2", { class: "pm-heading", "data-number": ... }, 0],
},

prefix: {
  content: "text*",
  defining: true,
  isolating: true,
  parseDOM: [{ tag: "p.pm-heading-prefix" }],
  toDOM: () => ["p", { class: "pm-heading-prefix" }, 0],
},

title: {
  content: "text*",
  defining: true,
  isolating: true,
  parseDOM: [{ tag: "p.pm-heading-title" }],
  toDOM: () => ["p", { class: "pm-heading-title" }, 0],
},
```

Each slot is now its own PM textblock: it owns its trailing BR, its own DOM
text node, its own input anchor. PM's DOM→state mapping can no longer merge
typed input into a sibling.

### New CSS

`pm-heading` becomes a flex container; `pm-heading-prefix` / `pm-heading-title`
are block children displayed inline via `display: inline-block` or inside a
flex row. Existing scene-number `::before`/`::after` pseudos on `h2.pm-heading`
stay unchanged.

```css
.pm-heading {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.pm-heading-prefix,
.pm-heading-title {
  margin: 0;
  display: inline-block;
  min-width: 1ch; /* keeps empty slot clickable */
}
```

## Required code changes

1. **Schema** (`schema.ts`) — update node specs as above.
2. **Migration** — any persisted `pmDoc` with old inline-slot shape round-trips
   cleanly because the node names and content expression are unchanged; only
   the DOM serialization changes. Re-parse from Fountain on load handles stale
   docs.
3. **Keymap** (`plugins/keymap.ts`) — existing `positionAtPrefixEnd` /
   `positionAtTitleStart` still work: they compute based on node size, which
   is identical for textblocks.
4. **schema-commands.ts** — `setElement("scene")` cursor offset (`blockStart +
4`) must be recomputed. Heading now has block children, not inline, which
   may shift open-token arithmetic. Verify with a test doc log.
5. **Scene-button no-op fix** — when `setElement("scene")` is called with
   cursor already inside a heading slot AND the doc has no other content,
   treat it as "focus this heading" rather than no-op. Or: if the heading is
   the very first node and empty, don't no-op.
6. **CSS** (`ScreenplayEditor.module.css` or prosemirror-styles) — add flex
   layout for `.pm-heading` and block reset for the two slot `<p>`s.
7. **Fountain parser** (`fountain-to-doc.ts`) — no change: already emits
   `heading` with `prefix` + `title` children; the node names are identical.
8. **Serializer** (`doc-to-fountain.ts`) — no change; walks by node name.

## Tests

- **Unit (Vitest):**
  - `keymap.test.ts` — Space/Tab/Backspace slot navigation still returns
    correct positions with the new block children.
  - `fountain-to-doc.test.ts` / `doc-to-fountain.test.ts` — round-trip stays
    green.
- **E2E (Playwright):**
  - `screenplay-authoring.spec.ts` S02 — the failing case. Expected green.
  - New: "scene from scratch" — open fresh screenplay, click `Scene` toolbar,
    type prefix, Tab, type title, Enter. Assert `.pm-heading-prefix` and
    `.pm-heading-title` contain the typed text separately.
  - `scene-heading.spec.ts` OHW-090..096 — must stay green.

## Slot autocomplete — must survive refactor

The `buildSlotPickerPlugin("prefix")` / `buildSlotPickerPlugin("title")`
plugins in `plugins/scene-slot-picker.ts` already harvest vocabulary from
every filled slot across the doc (`collectSlotValues`). After the refactor:

- `collectSlotValues` walks by node name (`"prefix"` / `"title"`), unchanged.
- The picker's `applyAt` replaces the slot's inline range via
  `$from.start()`/`.end()` — still correct because these are the slot-local
  inner bounds regardless of whether the slot is an inline node or a
  textblock.
- Prefix-picker's "hop to title" jump computes `titleContentStart =
headingStart + newPrefixSize + 1` — must be re-verified. With textblock
  slots the +1 still points past the title's opening token into its text
  content.

Test: S04 / OHW-096 — after typing `"I"` in a fresh scene's prefix, the
dropdown must list `"INT."` drawn from existing headings in the doc. Picking
it must land the cursor in the empty title slot ready for free text.

## Out of scope

- Changing the Fountain serialization format.
- Touching the scene-number logic (`sceneNumberForInsertion`).
- Migrating old persisted docs (no schema version change, content expr
  unchanged).
