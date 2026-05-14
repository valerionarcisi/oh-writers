# Spec 22c — 2D Scene Blocking Render

## Goal

Replace `BlockingPlaceholder.tsx` (90px stub with 🎬 icon) with a real 2D top-down floor plan visualising scene blocking per-scene per-plan: furniture, actor pins, camera pins, movement arrows. Cesare auto-fills from breakdown on first open.

---

## Out of scope (next specs)

- 3D view (⌘V) — `22d`
- Visual light layer — `22e`
- Image background from location scout — `22f`
- Cesare actor movement arrow auto-complete — `22g`
- Mobile editing (PWA = read-only render only)

---

## Deferred to 22c-phase-2

The following were specified for 22c but deferred to a follow-up. They will be tracked in a `22c-phase-2` spec.

- **Bidirectional sync — pin → shot direction.** Phase 1 only invalidates the blocking query when a shot list changes. The reverse (drawing a pin in the editor → creates a shot in the plan; pin deletion → toast confirming shot deletion) is deferred.
- **Detach blocking UI.** The server fn (`detachBlocking`) exists, but the `Detach blocking` button in the card is rendered disabled. No user-facing way to fork actor positions per-plan yet.
- **Cone rotation drag.** Camera pins can be moved but not rotated by dragging the cone arc. Direction is whatever Cesare assigned.
- **Arrow draw (shift+drag).** Spec describes shift+drag to draw blocking/movement arrows. Not yet implemented.
- **Door/window toggle in opening tool.** The opening tool in the blocking editor always creates a `kind: "door"` — no UI to switch to `kind: "window"` after placement.
- **Layer toggles in fullscreen editor.** The Location / Attori / Camere checkboxes in the editor sidebar are decorative; toggling them has no effect on the canvas.
- **Furniture popover for label entry.** The fullscreen editor uses `window.prompt()` to label a new furniture rect. Spec calls for a popover with breakdown propRef dropdown.
- **Runtime Zod re-validation of jsonb reads.** The server casts jsonb columns to domain types via `as unknown as`. A future hardening pass should `safeParse` the data on read.

---

## Data model

Three new tables, one per layer.

### `locations` — project-level asset

```ts
locations {
  id: uuid PK
  projectId: uuid FK → projects
  name: text                        // "Pizzeria Sottoscala"
  templateKey: text                 // "pizzeria" | "cucina" | "sala" | ...
  gridSize: integer default 50      // cm per cell
  widthCm: integer                  // canvas width in cm
  heightCm: integer                 // canvas height in cm
  primitives: jsonb                 // Primitive[]
  createdAt: timestamp
  updatedAt: timestamp
}
```

`Primitive` (Zod, in `packages/domain/src/blocking/blocking.types.ts`):

```ts
type Primitive =
  | { type: 'wall';      x: number; y: number; w: number; h: number }
  | { type: 'furniture'; x: number; y: number; w: number; h: number; label: string; propRef?: string }
  | { type: 'opening';   x: number; y: number; w: number; h: number; kind: 'door' | 'window' }
```

All coordinates in cm from top-left. Ortho-aligned only. No diagonals.

### `scene_blockings` — per-scene, inherited across plans by default

```ts
scene_blockings {
  id: uuid PK
  sceneId: uuid FK → scenes
  locationId: uuid FK → locations
  actorPositions: jsonb              // ActorPosition[]
  isSuggested: boolean default true  // cleared on first user edit
  createdAt: timestamp
  updatedAt: timestamp
}
```

`ActorPosition`:

```ts
type ActorPosition = {
  castId: string
  label: string
  x: number
  y: number
  arrow?: { toX: number; toY: number }  // blocking movement arrow
}
```

### `plan_scene_cameras` — per plan × scene

```ts
plan_scene_cameras {
  id: uuid PK
  planId: uuid FK → shot_plan_scenarios
  sceneId: uuid FK → scenes
  cameraPins: jsonb                       // CameraPin[]
  detachedActors: boolean default false
  overrideActorPositions: jsonb nullable  // ActorPosition[] — populated only when detachedActors=true
  isSuggested: boolean default true
  createdAt: timestamp
  updatedAt: timestamp
}
```

`CameraPin`:

```ts
type CameraPin = {
  shotId: string        // FK → shot_plan_shots.id
  label: string         // "A · MASTER"
  x: number
  y: number
  coneAngle: number     // degrees, field of view width
  coneDirection: number // degrees, 0=up, clockwise
  movement?: { toX: number; toY: number }  // dolly/pan end position
}
```

---

## Location templates

Defined in `packages/domain/src/blocking/blocking.templates.ts`. Each template is a `{ templateKey, widthCm, heightCm, primitives: Primitive[] }`.

Initial set:

| key | description |
|-----|-------------|
| `sala` | Generic interior room, table + chairs |
| `cucina` | Kitchen with counter, island |
| `pizzeria` | Restaurant with tables, counter, door, window |
| `ufficio` | Office with desks, window |
| `camera_da_letto` | Bedroom with bed, wardrobe, window |
| `esterno_strada` | Exterior street, minimal (two walls as sidewalk borders) |
| `auto_interno` | Car interior, two front seats + rear seats |
| `vuota` | Empty canvas, no primitives |

---

## Cesare precompilato

### Trigger

Server function `getOrCreateBlocking(sceneId, planId)`:
1. Load existing `scene_blocking` + `plan_scene_cameras`.
2. If either is missing OR both have `isSuggested = true`, call Cesare.
3. Return the blocking data (suggested or user-edited).

### Input (maximum context)

```ts
{
  fountainText: string,            // full scene fountain text
  sceneHeading: string,            // "INT. PIZZERIA SOTTOSCALA — NOTTE"
  cast: BreakdownElement[],        // from breakdownOccurrences for this scene
  props: BreakdownElement[],       // from breakdownOccurrences for this scene
  shots: ShotView[],               // active plan's shots for this scene
  locationPrimitives: Primitive[], // existing furniture/walls
  projectSuggestionHistory: {      // accepted/ignored Cesare suggestions
    accepted: string[]
    ignored: string[]
  }
}
```

Implemented via `buildCesareBlockingPrompt()` in `packages/domain/src/blocking/cesare-blocking-prompt.ts`. Uses Haiku + prompt caching (consistent with Cesare pattern). Mock available via `MOCK_AI=true`.

### Output (MVP — actor positions + camera placement)

Cesare infers:
- **Actor positions**: parses fountain action text to place actors near relevant furniture (`"Giulia siede al tavolo"` → pin on `TAVOLO PRINCIPALE`; `"Sergio entra dalla porta"` → pin near `PORTA`).
- **Camera positions**: places each camera pin at a plausible distance/angle for its `shotSize` and named subject (`CU Giulia` → close, facing Giulia's position; `WS Master` → wide, facing scene center).

`parseCesareBlockingResponse()` validates output via Zod. Falls back to safe defaults (actors at center, cameras at perimeter) on parse error — never throws.

All returned data has `isSuggested = true`. Badge "SUGGERITO" shown on the card. First user drag/edit clears `isSuggested`.

---

## Bidirectional sync — shot ↔ camera pin

Managed by `useBlockingSync` hook.

| User action | Effect |
|---|---|
| `+CU` in QuickAddToolbar | Server adds shot → `useBlockingSync` calls Cesare to place new camera pin → `isSuggested=true` |
| New camera pin drawn in ⌘B editor | Creates shot in active plan (shotSize inferred from label, editable) |
| Delete shot | Toast: "Rimuovere anche il pin camera dalla pianta?" — confirm → deletes pin |
| Delete camera pin | Toast: "Rimuovere anche lo shot dal piano?" — confirm → deletes shot |
| Drag any pin | Updates coordinates, sets `isSuggested=false` on that item |
| Click camera pin | Highlights corresponding shot block in timeline (and vice versa) |
| Click "Detach blocking" | Copies `actorPositions` from `scene_blockings` into `plan_scene_cameras.overrideActorPositions`, sets `detachedActors=true` |

"Detach blocking" button appears only when `detachedActors = false` and the active plan's shot list differs from the scene's default actor arrangement.

---

## Components

### `BlockingCard.tsx`

Replaces `BlockingPlaceholder.tsx` in `ParallelPlansEditor`. Orchestrator component.

Layout:

```
┌─ ANTEPRIMA BLOCKING · [scene tab strip] ─────────────────────┐
│ [sidebar 180px]         │  [BlockingCanvas flex-grow]         │
│ Personaggi: ...         │                                     │
│ Camera: N posizioni     │                                     │
│ Luce: (text field)      │                                     │
│ Note: (text field)      │                                     │
│                         │  [legenda: ■ CAMERA ● PERS ■ ARREDO]│
│ [⌘V Vista 3D – soon]    │                                     │
│ [⌘B Blocking Editor]    │                                     │
└─────────────────────────────────────────────────────────────┘
```

Tab strip shows all scenes of the active plan that share this location (`SC.3 · SC.7`). Active tab drives which pin layer is shown. Sidebar updates on tab change.

"⌘V Vista 3D" is rendered but disabled with `title="Prossimamente"`.

### `BlockingCanvas.tsx`

SVG-based renderer. Receives all data as props — no server calls.

```ts
interface BlockingCanvasProps {
  primitives: Primitive[]
  actorPositions: ActorPosition[]
  cameraPins: CameraPin[]
  isSuggested: boolean
  readOnly?: boolean             // true on mobile/PWA
  onActorDrag?: (castId, x, y) => void
  onCameraRotate?: (shotId, coneDirection) => void
  onCameraMove?: (shotId, x, y) => void
  onArrowDraw?: (type, id, toX, toY) => void
  onPinClick?: (type, id) => void
}
```

Renders:
- `wall` primitives: dark grey filled rect
- `furniture` primitives: light grey rect + centered label
- `opening` primitives: gap in wall rect + small icon (door arc / window line)
- Actor pins: green circle + label + optional movement arrow
- Camera pins: red rect + translucent cone (SVG `<path>`) + label + optional movement arrow

Grid lines: `var(--color-border)` at gridSize intervals, opacity 0.3, hidden when `readOnly`.

Inline editing (when `!readOnly`):
- Drag actor/camera: `onPointerDown/Move/Up` on the pin element
- Rotate cone: drag on arc edge of cone path
- Shift+drag from pin: draws movement arrow

### `BlockingPin.tsx`

Renders a single actor pin or camera pin as an SVG group (`<g>`). Handles its own pointer events. Used by both `BlockingCanvas` (inline) and `BlockingEditorCanvas` (fullscreen).

### `BlockingEditorPage.tsx`

Route: `apps/web/app/routes/projects/$projectId/shooting-plan/blocking-editor.tsx`

Full-screen modal, opened via ⌘B shortcut or button. URL carries `?scene=<sceneId>&plan=<planId>`.

```
┌─ toolbar ──────────────────────────────────────────────────────┐
│ ← Chiudi  │ [select] [wall] [furniture] [opening] │ Grid ⊞    │
│           │ Snap: ON │ ⌘Z Undo  ⌘⇧Z Redo          │ Zoom +/−  │
├─ layers ──┴─ canvas ──────────────────────────────────────────┤
│ ☑ Location │                                                   │
│ ☑ Attori   │  [BlockingEditorCanvas]                          │
│ ☑ Camere   │                                                   │
│            │                                                   │
│ + Aggiungi │                                                   │
│   mobile   │                                                   │
└────────────┴──────────────────────────────────────────────────┘
```

Tools:
- **select**: click to select element, shows resize handles at corners; drag to move
- **wall**: drag to create new wall rect
- **furniture**: drag to create new furniture rect; on release opens small popover (label + optional propRef from breakdown dropdown)
- **opening**: click on a wall to add door/window (toggles between the two with a follow-up click)

Auto-save on pointer-up. Close → navigate back to shooting plan page.

### `BlockingEditorToolbar.tsx`

Toolbar strip for `BlockingEditorPage`. Receives active tool, undo/redo state, grid/snap toggles as props. No internal state.

---

## Server functions

All in `apps/web/app/features/shooting-plan/server/blocking.server.ts`.

```ts
getOrCreateBlocking({ sceneId, planId })
  → ResultShape<{ sceneBlocking, planCameras }, DbError>

saveActorPositions({ sceneBlockingId, positions })
  → ResultShape<void, DbError | ForbiddenError>

saveCameraPin({ planSceneCamerasId, pin })
  → ResultShape<void, DbError | ForbiddenError>

deleteCameraPin({ planSceneCamerasId, shotId })
  → ResultShape<void, DbError | ForbiddenError>

detachBlocking({ planSceneCamerasId, sceneBlockingId })
  → ResultShape<void, DbError | ForbiddenError>

saveLocationPrimitives({ locationId, primitives })
  → ResultShape<void, DbError | ForbiddenError>
```

All require `requireUser()` + project membership check.

---

## Hooks

### `useBlockingSync`

Manages bidirectional shot ↔ camera pin sync. Subscribes to shot list changes (via `useQueryClient` + `onSuccess` of shot mutations). On shot add → calls `getOrCreateBlocking` to trigger Cesare re-placement. On shot delete → shows confirmation toast.

### `useBlocking`

Thin wrapper around `getOrCreateBlocking`. Exposes mutation helpers for actor and camera pin updates.

Used by `BlockingCard` to drive the `BlockingCanvas`.

---

## Routing changes

New route file:
```
apps/web/app/routes/projects/$projectId/shooting-plan/blocking-editor.tsx
```

Keyboard shortcut ⌘B in `ShootingPlanPage` navigates to this route (preserving current `scene` + `plan` query params).

---

## CSS

All components use CSS Modules. No new tokens needed beyond existing `--color-accent-*` and `--color-surface-*`. SVG elements styled inline (fills/strokes as `var()` references) to support theme switching.

---

## Testing

**Vitest (unit):**
- `cesare-blocking.ts`: `buildCesareBlockingPrompt` builds correct structure from mocked inputs; `parseCesareBlockingResponse` handles valid + malformed + empty LLM output
- `blocking.templates.ts`: all templates parse without Zod errors
- `useBlockingSync` (with mock server fns): shot add → camera pin created; shot delete → confirmation triggered

**Playwright (E2E):**
- `[OHW-022c-01]` Open shooting plan on seeded scene → blocking card renders (not placeholder)
- `[OHW-022c-02]` Cesare precompilato: first open shows actor + camera pins with SUGGERITO badge
- `[OHW-022c-03]` Drag actor pin → badge disappears, position saved on reload
- `[OHW-022c-04]` Add +CU shot → new camera pin appears on canvas
- `[OHW-022c-05]` Delete shot → confirmation toast → pin removed
- `[OHW-022c-06]` ⌘B opens blocking editor; add furniture rect → appears on inline canvas after close
- `[OHW-022c-07]` Tab strip: two scenes same location → switching tab updates pins
- `[OHW-022c-08]` Detach blocking button → actor positions editable independently per plan

---

## Migration

New migration: `packages/db/drizzle/0022_blocking.sql`

Creates: `locations`, `scene_blockings`, `plan_scene_cameras`.

No changes to existing tables.
