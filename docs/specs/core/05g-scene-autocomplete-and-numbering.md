# Spec 05g — Structured Scene Heading + Numbering with Letters

> Scene heading is **structured data**, not free text. Two editable slots —
> prefix and title — with per-slot autocomplete fed by whatever the user has
> already typed elsewhere in the doc. Persistent numbering with letter suffixes
> for mid-insertions.

## Why

Today the scene heading is one monolithic text line the user types by hand.
Three problems fall out of that:

1. **No source of truth for the prefix.** Writers forget the trailing dot,
   capitalise inconsistently, type `INT ` vs `INT.`, or invent new ones
   (`EST.`, `I/E`). The text looks fine but downstream (scene numbering,
   breakdown, scheduling) can't rely on it.
2. **No source of truth for the title.** The same location appears as
   `KITCHEN - NIGHT`, `Kitchen — night`, `KITCHEN NIGHT` across a draft. No
   dedupe, no scouting list, no breakdown pivot.
3. **Scene numbers can't survive re-ordering.** Industry convention: once a
   script is locked, inserting a new scene between `4` and `5` produces `4A`,
   a second `4B`. Order-derived numbering renumbers everything, defeating the
   whole convention.

We fix all three by making the heading an **object** with two string slots,
each backed by a picker that suggests values already used elsewhere in the
doc. Nothing is hardcoded — whatever the writer types becomes the canonical
vocabulary of the screenplay.

## Domain model

```ts
// packages/domain/src/scene-heading.ts
export interface SceneHeading {
  readonly prefix: string; // "INT.", "EXT.", "EST.", "I/E", whatever the writer types
  readonly title: string; // "RISTORANTE - FORNO/CUCINA - NOTTE", free text
  readonly scene_number: string; // "1", "1A", "12BC"
}
```

All three are strings. There is **no enum, no canonical list, no forced
punctuation.** The writer owns the vocabulary.

## ProseMirror schema

```
scene
  heading (attrs: { scene_number: string })
    prefix (inline, content: "text*", isolating: true)
    title  (inline, content: "text*", isolating: true)
  body*
```

- `prefix` and `title` are inline nodes inside the heading.
- `isolating: true` means Backspace at the start of `title` doesn't fuse the
  two nodes into one — it just moves the cursor to the end of `prefix`.
- `scene_number` stays on the heading node, not on the children.
- `toDOM` renders:
  ```html
  <h2 class="pm-heading" data-number="1">
    <span class="pm-heading-prefix">INT.</span>
    <span class="pm-heading-title">RISTORANTE - FORNO/CUCINA - NOTTE</span>
  </h2>
  ```
  Separator between the two spans is a CSS `margin-inline-start` on
  `.pm-heading-title`, not a literal space character. Keeps the data clean.

## Navigation inside the heading

The user moves between the two slots through natural editing keys — we do
not repurpose global shortcuts just for the heading.

- **Tab inside prefix** → move cursor to start of `title`. If `title` is
  empty the cursor lands in the empty slot ready to type.
- **Space inside prefix** → same as Tab (idiomatic: `INT.` + space and you're
  in the title). The space is **not inserted** — it is consumed as a
  navigation key.
- **Backspace at start of title** → cursor to end of prefix, no text deleted,
  no nodes fused.
- **Enter inside title** → close the heading: create an empty `action` node
  right after the scene and place the cursor in it. Same as today's
  Strategy A but from the `title` slot.
- **Enter inside prefix** → same as Enter in `title` — writers sometimes
  fill just the prefix and want to bail out.
- **Arrow keys** → default PM behaviour; `isolating: true` keeps the caret
  from tunnelling through child boundaries unexpectedly.

## Pickers

Two pickers, both structurally identical, differ only in the slot they
attach to and the function that feeds them.

### `scenePrefixPicker`

- Active when `$from.parent.type.name === "prefix"`.
- Options = **all distinct prefixes already present in the doc**, ordered by
  frequency (most-used first), tie-break alphabetical.
- Filter by the characters the user has typed (prefix-match,
  case-insensitive).
- Arrow keys navigate; Enter applies the highlighted suggestion.
- Enter with no highlight (or Tab) **registers the typed value as-is** — that
  string is now part of the project's vocabulary and will appear in the
  picker next time.
- Click applies.
- Escape dismisses; the current text stays in the slot.
- Cursor always visible and editable under the dropdown.

### `sceneTitlePicker`

- Active when `$from.parent.type.name === "title"`.
- Options = **all distinct titles already present in the doc**, same ordering
  and filtering rules as the prefix picker.

### Source-of-truth functions (pure, in `packages/domain`)

```ts
// packages/domain/src/scene-heading.ts

/** Deduplicate + sort by frequency (desc), tie-break alphabetical. */
export const rankByFrequency = (values: readonly string[]): string[];

/** Filter suggestions by what the user has typed (prefix-match, case-insensitive). */
export const filterSuggestions = (
  suggestions: readonly string[],
  typed: string,
): string[];
```

Extracting `prefix[]` and `title[]` from the PM doc is done in a small
editor-side adapter — domain stays framework-free.

## Scene numbering

Unchanged from the earlier version of this spec — the numbering logic
(`sceneNumberForInsertion`, `parseSceneNumber`, `nextLetterSuffix`,
`renumberAll`, `compareSceneNumbers`) is already merged. Numbers live on the
`scene_number` attr of the heading node, computed at creation time.

Mid-insertion rule: inserting a new scene between scene `N` and scene `M`
where `M === N+1` produces `${N}A`. If `N` already has a letter (`4A`), the
next insertion after it produces `4B`. Letters always belong to the scene
they follow.

## Migration of existing documents

Documents saved today have heading nodes with a single `text*` content
containing the full `INT. FOO - NIGHT` string. That content must be split
into the two new child nodes.

```ts
// packages/domain/src/scene-heading.ts

const SPLIT_RE = /^(\S+?[.\/])\s+(.+)$/;

export const splitLegacyHeading = (
  raw: string,
): {
  readonly prefix: string;
  readonly title: string;
} => {
  const m = SPLIT_RE.exec(raw.trim());
  if (m) return { prefix: m[1]!, title: m[2]! };
  return { prefix: "", title: raw.trim() }; // fallback — user can edit
};
```

Two entry points:

1. **Fountain import** — `fountainToDoc` calls `splitLegacyHeading` on every
   scene heading line before constructing the `heading` node.
2. **`pm_doc` load** — a `migratePmDoc(json)` function runs at read-time on
   the server (or client) and rewrites legacy headings idempotently. A
   heading whose content is a single `text` node is legacy; one with two
   child nodes (`prefix` + `title`) is already current.

`migratePmDoc` is a pure function, testable without a DB.

## Fountain round-trip

- **Export**: `${prefix} ${title}` when prefix is non-empty, otherwise just
  `${title}`. No punctuation injected — whatever the writer typed is what
  goes out.
- **Import**: line that matches `SPLIT_RE` is split; line that doesn't is
  treated as a heading with an empty prefix and the full string as title.
  This is deliberate — if a writer imports `EST FOO` without a dot, we keep
  it as-is rather than forcing `EST.`.

## `setElement("scene")` — corrected semantics

Today the command always inserts a _new_ scene after the current one, using
the current block's text as the heading. This is wrong in two common cases:

1. Cursor is on an empty body line → user expects "turn this line into a
   heading", not "duplicate the empty line into a new scene below".
2. Cursor is on a populated action line → behaviour is fine but placement
   is surprising (goes after the whole scene, not after the current block).

New rules:

- Current block is a heading → no-op.
- Current block is **empty** → convert it in-place to a heading (both
  `prefix` and `title` empty, cursor in `prefix`, picker opens).
- Current block has text → wrap the block's text into a new scene's
  `title`, inserted **immediately after the current block** (not at the end
  of the scene), cursor in the new `prefix`.

Scene number is computed with `sceneNumberForInsertion` against the filtered
list of _numbered_ headings (synthetic pre-heading scenes are skipped).

## Plugin registration order

```
[
  history(),
  scenePrefixPicker,   // only fires when cursor in prefix slot
  sceneTitlePicker,    // only fires when cursor in title slot
  autocomplete,        // character / transition autocomplete (unchanged)
  fountainKeymap,      // tab/enter/backspace rules for screenplay blocks
  standardKeymap,      // undo/redo/delete/backspace fallbacks
  paginator,
]
```

First match wins for `handleKeyDown`. The two scene pickers live before the
autocomplete because they are scope-restricted (only active inside their
slot) and the `handleKeyDown` is cheap to dismiss.

## Out of scope for 05g

- Scene number locking / revisions (Spec 06).
- Multi-line headings.
- Renumber toolbar action — deferred to 05h (it lives in the More menu).
- Element picker on empty blocks — deferred to 05h.
- Visual ghost-text placeholder in empty slots — deferred to polish pass.

## Testing

Vitest (pure domain):

- `rankByFrequency(["INT.", "EXT.", "INT.", "I/E"])` → `["INT.", "EXT.", "I/E"]`
- `filterSuggestions(["INT.", "EXT.", "I/E"], "i")` → `["INT.", "I/E"]`
- `splitLegacyHeading("INT. FOO - NIGHT")` → `{ prefix: "INT.", title: "FOO - NIGHT" }`
- `splitLegacyHeading("INT/EXT. FOO")` → `{ prefix: "INT/EXT.", title: "FOO" }`
- `splitLegacyHeading("EST FOO")` → `{ prefix: "", title: "EST FOO" }`
- `migratePmDoc` — idempotent on an already-migrated doc; splits a legacy
  doc correctly.

Vitest (PM integration):

- Typing into an empty prefix slot filters the picker live.
- Enter on a highlighted suggestion fills the slot and moves cursor to
  title.
- Enter with no highlight registers the typed string and moves cursor to
  title.
- Tab in prefix moves to title without inserting a tab character.
- Space in prefix moves to title without inserting a space character.
- Backspace at start of title moves to end of prefix without fusing.
- Enter in title closes the heading and creates an action below.
- `setElement("scene")` on an empty block → in-place conversion, no new
  scene, cursor in prefix.
- `setElement("scene")` on a populated block → new scene inserted right
  after, current block's text becomes the new `title`.

Playwright smoke:

- Click toolbar Scene on an empty line → prefix slot focused, picker open
  with existing prefixes from the doc.
- Select `INT.` from picker → cursor jumps to title slot, title picker
  opens with existing titles.
- Type `KIT` → title picker filters to titles starting with `KIT`.
- Enter on highlighted title → cursor jumps to action block below.
- Reload page → heading renders correctly with both slots.

## Non-goals / explicit decisions

- **No hardcoded prefix list.** Every prefix the user sees in the picker
  was typed by the user at some point. A fresh document shows an empty
  picker — the user types the first one manually.
- **No forced uppercase in the data.** CSS renders the heading uppercase;
  the model keeps the writer's casing so round-trip to Fountain stays
  faithful.
- **No scene-number lock.** Renumber (deferred to 05h) is destructive.
