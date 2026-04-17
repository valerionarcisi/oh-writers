# Spec 15 — Timeline Scaletta

Supersedes `04b-outline-drag-drop.md`. Replaces the card-grid outline with a
**vertical drag-and-drop timeline** modelled after DaVinci Resolve's timeline
panel — scenes as clips on a vertical track, proportional weight indicators,
inline comments as side annotations.

The timeline component is **generic**: it can render screenplay scenes, schedule
days, or any ordered list of items with a weight and optional annotations. This
spec implements the screenplay outline use case; the schedule strip board (Spec 12) will reuse the same component with a different data adapter.

---

## Context

Spec 04b described a card-grid grouped by act. That design is replaced entirely.
The writer needs to feel the _rhythm_ of the story — which acts are heavy, which
scenes are short, where the pacing drags. A vertical timeline with proportional
weight indicators communicates this at a glance, without sacrificing readability.

The `OutlineEditor.tsx` and `OutlineEditor.module.css` components are replaced.
The data model (`OutlineContent` JSON in `documents.content`) is preserved and
extended.

---

## Data Model

Extends `OutlineContentSchema` in `packages/domain/src/outline.schema.ts`:

```ts
export const OutlineCommentSchema = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  authorName: z.string(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});

export const OutlineSceneSchema = z.object({
  id: z.string().uuid(),
  heading: z.string(), // "INT. PIZZERIA - SERA"
  description: z.string(), // what happens
  characters: z.array(z.string()),
  pageEstimate: z.number().nullable(), // drives weight indicator
  notes: z.string().nullable(), // private writer notes (not comments)
  comments: z.array(OutlineCommentSchema), // NEW — side annotations
  color: z.string().nullable(), // NEW — hex, for act color coding
});

export const OutlineActSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  color: z.string().nullable(), // NEW — tint for act zone
  scenes: z.array(OutlineSceneSchema),
});

export const OutlineContentSchema = z.object({
  acts: z.array(OutlineActSchema),
});

export type OutlineContent = z.infer<typeof OutlineContentSchema>;
export type OutlineAct = z.infer<typeof OutlineActSchema>;
export type OutlineScene = z.infer<typeof OutlineSceneSchema>;
export type OutlineComment = z.infer<typeof OutlineCommentSchema>;
```

No new DB table. Comments live in the JSON document alongside the scene.
`resolvedAt` lets the writer mark a comment as done without deleting it.

---

## Generic Timeline Component

Lives in `apps/web/app/features/timeline/` — a new shared feature folder,
separate from the outline domain.

### TimelineItem interface

```ts
// features/timeline/timeline.types.ts
export interface TimelineItem {
  id: string;
  label: string; // primary text (scene heading, schedule day label)
  sublabel?: string; // secondary text (description excerpt)
  weight?: number | null; // drives the proportional bar (pages, hours, etc.)
  tags?: string[]; // character pills, location tags, etc.
  color?: string | null; // optional hex tint for the weight bar
  commentCount?: number; // badge shown on the card
  isResolved?: boolean; // faded style for completed/cut scenes
}

export interface TimelineGroup {
  id: string;
  label: string; // act title, week label, etc.
  color?: string | null; // tint for the act zone background
  items: TimelineItem[];
}
```

### TimelinePanel component

```ts
// features/timeline/components/TimelinePanel.tsx
interface TimelinePanelProps {
  groups: TimelineGroup[];
  /** Called when items are reordered or moved between groups */
  onReorder: (groups: TimelineGroup[]) => void;
  /** Called when a card is clicked */
  onSelect?: (itemId: string, groupId: string) => void;
  /** Renders the detail panel for the selected item */
  renderDetail?: (itemId: string, groupId: string) => React.ReactNode;
  /** Label shown in the empty state */
  emptyLabel?: string;
}
```

`TimelinePanel` owns drag-and-drop logic (via `@dnd-kit/core` +
`@dnd-kit/sortable`), layout, and weight bar rendering. It is unaware of
outlines, documents, or server functions — those live in the outline adapter.

---

## Layout

```
┌─────────────────────────────────────────────────────────┬──────────────────┐
│  Scaletta                              + Nuova scena    │  Detail panel    │
├─────────────────────────────────────────────────────────┤  (slide-in from  │
│                                                         │   right when a   │
│  ● ACT I — SETUP                          3 scene·~5pg │   card is        │
│  ┌──┬──────────────────────────────────────────────┐   │   selected)      │
│  │▓▓│ ⠿  1. INT. PIZZERIA - SERA          ~2pg     │   │                  │
│  │▓▓│    Marco convince il suocero…                │   │  ┌─────────────┐ │
│  │  │    [MARCO] [SUOCERO]              💬 2       │   │  │ Heading     │ │
│  └──┴──────────────────────────────────────────────┘   │  │ Description │ │
│  ┌──┬──────────────────────────────────────────────┐   │  │ Page est.   │ │
│  │▓▓│ ⠿  2. EXT. STRADA - NOTTE          ~1pg     │   │  │ Characters  │ │
│  │▓ │    Marco attacca i volantini…                │   │  ├─────────────┤ │
│  │  │    [MARCO]                                   │   │  │ Comments    │ │
│  └──┴──────────────────────────────────────────────┘   │  │ ──────────  │ │
│                                                         │  │ + Add note  │ │
│  ● ACT II — CONFRONTATION                 4 scene·~9pg │  └─────────────┘ │
│  ┌──┬──────────────────────────────────────────────┐   │                  │
│  │▓▓│ ⠿  3. INT. PIZZERIA - SERA          ~3pg     │   │                  │
│  │▓▓│    La serata di stand-up inizia…             │   │                  │
│  │▓▓│    [MARCO] [PUBBLICO] [JOHN]      💬 1       │   │                  │
│  └──┴──────────────────────────────────────────────┘   │                  │
│  ...                                                    │                  │
└─────────────────────────────────────────────────────────┴──────────────────┘
```

### Weight bar

- Left column, fixed width `8px`.
- Height of the colored fill = `(scene.pageEstimate / maxPageEstimate) * 100%`,
  clamped to `[20%, 100%]` so every bar is visible.
- When `pageEstimate` is null, bar shows at 30% with a dashed style.
- Color: act color if set, else `--color-accent`.
- Transitions smoothly when the page estimate is edited.

### Card anatomy

| Zone          | Content                                                   |
| ------------- | --------------------------------------------------------- |
| Left          | Weight bar (8px column)                                   |
| Handle        | `⠿` grip, visible on hover, cursor grab                   |
| Number        | Auto-numbered within each act, updates on reorder         |
| Heading       | Scene heading, editable inline on click                   |
| Description   | Truncated to 2 lines, editable in detail panel            |
| Tags          | Character pills                                           |
| Comment badge | `💬 N` — count of unresolved comments, click opens detail |

---

## Drag and Drop

Uses `@dnd-kit/core` + `@dnd-kit/sortable` (already in the CLAUDE.md stack).

- **Drag within act** — reorders scenes inside the act.
- **Drag between acts** — moves scene to a different act at the drop position.
- Scene numbers auto-update after every reorder.
- Drop zone: dashed border + `--color-accent` tint on the target slot.
- During drag: source card becomes semi-transparent (`opacity: 0.4`),
  placeholder slot shown at the insertion point.
- `prefers-reduced-motion`: skip translate animation, only opacity change.

Act headers are also draggable — drag an act header to reorder entire act blocks.
Scene cards cannot be dropped onto an act header (only between them).

---

## Detail Panel

Slides in from the right when a card is clicked. Does NOT push the timeline —
overlays it, anchored to the right edge of the timeline container (not the
viewport). Width: `320px` fixed. Closes on Escape or clicking outside.

### Sections

**Editing fields** (all inline, auto-save on blur):

- Heading (text input)
- Description (textarea, auto-grows)
- Page estimate (number input, `0.5` step)
- Private notes (textarea, collapsible)
- Characters (tag input, same as 04b)

**Comments thread**:

- List of comments, newest first.
- Each comment: avatar initial, author name, date, body.
- Unresolved comments: normal style. Resolved: faded + strikethrough label.
- Actions per comment: **Resolve** / **Unresolve**, **Delete** (own comments only).
- `+ Add comment` input at the top of the thread — Enter to submit.
- Comments stored in the outline JSON (no separate DB table).
- `authorId` / `authorName` from the current session user.

---

## Act Management

- **Add act**: `+ Aggiungi atto` button below the last act.
- **Rename act**: click the act title inline.
- **Delete act**: `⋯` menu on act header → **Elimina atto**. Moves all scenes
  to the previous act. If it is the first act, moves to the next. Confirm
  dialog if the act has scenes.
- **Reorder acts**: drag the act header.
- **Act color**: `⋯` menu → **Colore** → small color picker (6 preset swatches +
  custom hex). Color tints the act zone background and the weight bars of its
  scenes.

---

## Adding Scenes

- **`+ Nuova scena` button** top right → appends to the last act.
- **`+` slot between cards** — appears on hover between two cards, inserts at
  that position.
- **`+ Aggiungi scena` at the bottom of each act** — appends within that act.
- New scene: empty heading, empty description, cursor focuses on heading in the
  detail panel (which opens automatically).

---

## Empty State

```
┌─────────────────────────────────────────────┐
│                                             │
│      Inizia a costruire la tua storia       │
│                                             │
│   Aggiungi scene per delineare la struttura │
│   narrativa prima di scrivere la sceneggiatura. │
│                                             │
│          [+ Prima scena]                    │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Connection to Screenplay

- Scene headings in the outline are free text — not hard-linked to screenplay
  scenes in this spec.
- Future (not in scope): sync button that reads scene headings from the
  screenplay ProseMirror doc and suggests adding missing ones to the outline.
- Future (not in scope): click a scene card → jumps to that heading in the
  screenplay editor.

---

## Auto-save

Same pattern as `NarrativeEditor`: debounced 2s after any change, immediate on
blur of any field. Uses existing `saveDocument` server function. Save indicator
reuses `SaveIndicator` component.

---

## Versioning

Outline content is versioned via the unified `VersionsDrawer` (Spec 12).
The `+ Versioni` button in the outline toolbar opens the drawer with scope
`{ kind: "document", documentId, docType: "outline" }`.

---

## Server

No new server functions. All mutations go through the existing
`saveDocument({ projectId, type: "outline", content })`.

Comments are part of the document JSON — saving the document saves the comments.
The server validates the full `OutlineContentSchema` on write.

---

## Files

### New — Timeline generic component

```
apps/web/app/features/timeline/
├── components/
│   ├── TimelinePanel.tsx
│   ├── TimelinePanel.module.css
│   ├── TimelineCard.tsx
│   ├── TimelineCard.module.css
│   ├── TimelineGroup.tsx
│   ├── TimelineGroup.module.css
│   ├── TimelineDetailPanel.tsx
│   └── TimelineDetailPanel.module.css
├── hooks/
│   └── useTimelineDnd.ts        ← @dnd-kit wiring
├── timeline.types.ts
└── index.ts
```

### New — Outline adapter

```
apps/web/app/features/documents/
├── components/
│   ├── OutlineTimeline.tsx      ← adapter: OutlineContent → TimelineGroup[]
│   ├── OutlineTimeline.module.css
│   ├── OutlineDetailPanel.tsx   ← scene fields + comments thread
│   └── OutlineDetailPanel.module.css
├── hooks/
│   └── useOutlineTimeline.ts    ← state + auto-save + comment mutations
```

### Modified

- `apps/web/app/features/documents/components/OutlineEditor.tsx` → **deleted**,
  replaced by `OutlineTimeline.tsx`
- `apps/web/app/features/documents/components/OutlineEditor.module.css` → **deleted**
- `packages/domain/src/outline.schema.ts` — extend with `comments`, `color`
- `apps/web/app/routes/_app.projects.$id.outline.tsx` — swap `OutlineEditor`
  for `OutlineTimeline`

---

## Tests

Playwright, tagged `[OHW-200..210]`, new file
`tests/outline/timeline.spec.ts`:

| Tag     | Scenario                                                             |
| ------- | -------------------------------------------------------------------- |
| OHW-200 | Empty outline shows empty state with "Prima scena" CTA               |
| OHW-201 | Add scene → card appears in timeline, detail panel opens             |
| OHW-202 | Edit heading inline → card updates, auto-saves                       |
| OHW-203 | Drag scene within act → order changes, numbers update                |
| OHW-204 | Drag scene between acts → scene moves, source act updates count      |
| OHW-205 | Drag act header → act order changes, scenes follow                   |
| OHW-206 | Weight bar height is proportional to pageEstimate                    |
| OHW-207 | Add comment → appears in detail panel thread                         |
| OHW-208 | Resolve comment → comment fades, badge count decreases               |
| OHW-209 | Delete act with scenes → confirm dialog, scenes move to adjacent act |
| OHW-210 | Act color change → weight bars and zone tint update                  |

---

## Constraints

- `@dnd-kit` only — no other DnD library.
- `TimelinePanel` must be importable with zero knowledge of outlines or
  documents. The adapter (`OutlineTimeline`) does the mapping.
- Comments stored in JSON — no new DB table, no new server functions.
- No photorealistic colors — act color picker limited to 6 design-system swatches
  - custom hex. Swatches use `--color-*` tokens.
- Weight bar transition: `height 200ms ease`. Respect `prefers-reduced-motion`.
- Detail panel does not push the timeline — overlay only.
- Commit: `[OHW] feat: vertical timeline scaletta with DnD and comments`.
