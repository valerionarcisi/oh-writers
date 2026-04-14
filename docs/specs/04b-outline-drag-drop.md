# Spec 04b — Outline / Scaletta (Drag-and-Drop Scene Cards)

## Overview

The Outline (Scaletta) is a structured, visual representation of the story divided into acts and scenes. Each scene is a card that can be reordered by dragging. The writer builds the story structure here before moving to the screenplay.

---

## Data Model

The outline is stored as a JSON structure in the `documents` table (type = "outline"). The content field holds:

```typescript
const OutlineContentSchema = z.object({
  acts: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(), // "Act I — Setup", "Act II — Confrontation"
      scenes: z.array(
        z.object({
          id: z.string().uuid(),
          heading: z.string(), // "INT. PIZZERIA - SERA"
          description: z.string(), // Free text — what happens in this scene
          characters: z.array(z.string()), // Character names involved
          pageEstimate: z.number().nullable(), // Estimated page count
          notes: z.string().nullable(), // Writer's private notes
        }),
      ),
    }),
  ),
});

type OutlineContent = z.infer<typeof OutlineContentSchema>;
```

No new DB table needed — the outline content lives in `documents.content` as JSON. Versions are handled by the universal versioning system (Spec 06b).

---

## UI: Card Layout

```
┌─────────────────────────────────────────────────────┐
│ Outline                              + Add scene    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ACT I — SETUP                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⠿  1. INT. PIZZERIA - SERA                ~2pg │ │
│ │    Marco convince il suocero a prestargli       │ │
│ │    il locale per la serata di stand-up.         │ │
│ │    [MARCO] [SUOCERO]                            │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⠿  2. EXT. STRADA - NOTTE                 ~1pg │ │
│ │    Marco attacca i volantini per la serata.     │ │
│ │    [MARCO]                                      │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⠿  3. INT. CASA MARCO - GIORNO            ~2pg │ │
│ │    La moglie scopre cosa sta combinando.        │ │
│ │    [MARCO] [ELENA]                              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ACT II — CONFRONTATION                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⠿  4. INT. PIZZERIA - SERA                ~3pg │ │
│ │    La serata di stand-up inizia male...         │ │
│ │    [MARCO] [PUBBLICO] [JOHN]                    │ │
│ └─────────────────────────────────────────────────┘ │
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

### Scene Card Anatomy

Each card contains:

| Part           | Position     | Description                                              |
| -------------- | ------------ | -------------------------------------------------------- |
| Drag handle    | Left (`⠿`)   | 6-dot grip icon, visible on hover                        |
| Scene number   | After handle | Auto-numbered (1, 2, 3...) — updates on reorder          |
| Scene heading  | Top line     | `INT/EXT. LOCATION - TIME` — editable inline             |
| Page estimate  | Top right    | `~2pg` — editable                                        |
| Description    | Body         | Free text — what happens in this scene. Editable inline. |
| Character tags | Bottom       | Colored pills with character names. Click to add/remove. |

### Act Headers

- Collapsible — click to expand/collapse all scenes in the act
- Editable title (double-click to rename)
- Scene count + total page estimate shown when collapsed: `Act II — 6 scenes · ~22pg`
- Acts can be added, renamed, and removed

---

## Interactions

### Drag and Drop

- **Drag a scene** within an act to reorder
- **Drag a scene** between acts to move it
- Scene numbers auto-update after every reorder
- Drop zone highlighted during drag (teal border)
- Smooth animation on drop (CSS transitions)

### Library choice

Use **@dnd-kit/core** + **@dnd-kit/sortable** — lightweight, accessible, works with React 19. No heavy dependencies.

### Adding a scene

- **"+ Add scene" button** at the top right — adds to the end of the last act
- **"+" button** between scenes — inserts at that position
- **"+ Add scene" at the end of each act** — adds within that act
- New scene starts with empty heading and description, cursor focuses on heading

### Editing a scene

- Click on any field to edit inline (heading, description, page estimate)
- No modal — everything is inline editing
- Auto-save on blur or after 2 seconds of inactivity

### Deleting a scene

- Hover reveals a `...` menu button on the top right of the card
- Menu: **Delete**, **Duplicate**, **Move to act...**
- Delete requires confirmation (inline, not modal — "Delete? Yes / No")

### Adding/removing characters

- Click the character tag area to open a dropdown
- Dropdown shows all characters used in the project (from screenplay + other scenes)
- Type to filter, Enter to add
- Click `×` on a tag to remove

---

## Act Management

- **Add act**: button below the last act, or via `...` menu on the outline header
- **Rename act**: double-click the act title
- **Delete act**: via `...` menu — moves all scenes to the previous act (never deletes scenes)
- **Reorder acts**: drag the act header to reorder entire act blocks
- **Default acts**: new outline starts with 3 acts: "Act I", "Act II", "Act III"

---

## Empty State

When the outline has no scenes:

```
┌─────────────────────────────────────────────┐
│                                             │
│     Start building your story structure     │
│                                             │
│     Add scenes to outline the narrative     │
│     arc before writing the screenplay.      │
│                                             │
│          [+ Add first scene]                │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Connection to Screenplay

The outline and screenplay are separate documents but connected by scene headings. When the screenplay is written:

- Scene headings in the outline should match scene headings in the screenplay
- Future: a sync feature that detects new scenes in the screenplay and suggests adding them to the outline (not in this spec)
- Future: clicking a scene card could navigate to that scene in the screenplay editor (not in this spec)

---

## Implementation Order

1. Define `OutlineContentSchema` in domain package
2. Create `OutlineEditor` component with static card layout
3. Add inline editing (heading, description, page estimate)
4. Add character tag management
5. Integrate `@dnd-kit` for drag-and-drop reorder within acts
6. Add drag between acts
7. Add act management (add, rename, delete, reorder)
8. Auto-save integration
9. Empty state
10. Connect to version system (Spec 06b)
