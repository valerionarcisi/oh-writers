# Spec 43 — Cesare universal tool layer

> **Status update (spec 47b / A7):** the universal dispatch described here
> originally landed in the legacy V1 path (`handleAskCesare` →
> `callCesareUniversal`), which is no longer wired to the active request/stream
> path. Universal dispatch is now implemented in the **active V2 path**
> (`handleAskCesareV2`, the `askCesare` server fn + `POST /api/cesare/stream`)
> by making the skills registry's `selectForPage` return the full tool superset
> instead of gating per page. The per-page tool gate (`PAGE_SKILL_MAP`) is now an
> ordering hint (`PAGE_PRIMARY_SKILLS`), not a filter. See
> [Spec 47b](./47b-cesare-universal-dispatch-active-path.md) for the details and
> the guards that stayed in place.

## Problem

Today Cesare's tool surface is **page-bound**: each page (`screenplay`,
`locations`, `breakdown`, `schedule`, `budget`, `shooting-plan`, documents)
gets its own factory (`createLocationTools`, `createScreenplayTools`, …) and
its own dispatch branch in `cesare.server.ts`. As a result, when the user is
on the Locations page and asks Cesare to "add these pubs as candidates and
also tweak scene 2 to mention the back room", Cesare cannot reach the
screenplay tools and answers "you have to do it yourself".

The Cesare product positioning we agreed on:

> Cesare is a **layer above the SaaS** that can **see and modify
> everything** if it wants. The page is just _where the user is_, not a
> gate on what Cesare is allowed to do.

This spec turns that positioning into code.

## Scope

In scope for this spec:

1. **Big-bang refactor**: one universal tool factory
   `createUniversalCesareTools(db, projectId, pageContext)` returns the full
   superset of tools regardless of page. The active page is passed only as
   prompt context, never as a filter on the tool set.
2. **Single dispatch**: `callCesareUniversal()` replaces
   `callCesareWith{Location,Breakdown,Schedule,Budget,ShootingPlan,Screenplay,Document}Tools`.
3. **Missing location tools** added so Cesare can be autonomous on the
   Locations page:
   - `list_location_requirements({ scene_number? })`
   - `create_location_requirement({ scene_number, brief })`
   - `find_or_create_requirement_for_scene({ scene_number })`
4. **Notification timing fix**: the in-app badge increments **only** on the
   assistant `onSuccess`, not on user `onSend`. (Visible bug: badge "1"
   appeared as soon as the user pressed Send.)

Out of scope (separate specs):

- Re-think `cesare-intent-classifier`: with a universal toolset, the
  classifier's role becomes "hint the most-likely tool" rather than "gate
  what's available". (Done in 47b: the classifier now runs in the active V2
  path, page-agnostically, whenever the screenplay propose tools are exposed,
  and only forces a tool — never gates the surface.)
- Pricing/cost tuning of the larger system prompt that now ships every
  tool description.
- Permission scoping (e.g. viewer role should not see write tools): handled
  by `withProjectAccess` already at the executor layer.

## Design

### Tool inventory after the refactor

Categorised by domain. All callable from any page.

**Read (cross-feature, zero side effect)**

- `read_scene({ scene_number })`
- `read_scene_range({ from, to })`
- `read_document({ type })` — logline / synopsis / outline / treatment
- `read_budget_lines({ category? })`
- `read_breakdown({ scene_number?, category? })`
- `read_location_requirement({ requirement_id })`
- `list_location_requirements({ scene_number? })` — **NEW**
- `read_shooting_day({ day_number })`
- `search_places({ query, location_bias?, max_results? })`

**Screenplay write**

- `propose_screenplay_edit({ scene_number, find, replace, reason })`
- `rewrite_scene({ scene_number, new_content })` — UN solo slugline
- `merge_scenes({ from, to, hint? })`
- `delete_scene({ scene_number })`
- `propose_screenplay_revision({ scope, instruction, label })`
- `propose_rename_entity({ kind, from, to })`

**Document write**

- existing document generation tools from `cesare-document-tools.ts`

**Location write**

- `add_candidate({ requirement_id, name, address?, lat?, lng?, notes?, photo_names? })`
- `create_location_requirement({ scene_number, brief })` — **NEW**
- `find_or_create_requirement_for_scene({ scene_number })` — **NEW**

**Breakdown / Schedule / Budget / Shooting-plan write**

- existing tools, all unified into the universal factory.

### Page context (system-prompt only)

The prompt continues to receive `pageContext` so Cesare knows where the
user is and what's visually selected. This shapes phrasing and default
arguments ("the user is on Locations looking at SC.1 — most likely they
want a location for that scene"), but never restricts the tool surface.

### `list_location_requirements`

Returns: `[{ id, name, scene_numbers, candidate_count, status }, …]`.
Optional `scene_number` filter narrows to requirements linked to that
scene. This is the tool Cesare must call **before** `add_candidate` so it
never asks the user to copy a UUID.

### `create_location_requirement`

Input: `{ scene_number, brief }`. Reads the scene's slugline + first
action lines to derive a default `name`, `int_ext`, `time_of_day`. Inserts
into `location_requirements` + `location_requirement_scenes`. Returns the
new `requirement_id` so Cesare can chain `add_candidate` immediately.

### `find_or_create_requirement_for_scene`

Idempotent convenience: looks up an existing requirement linked to the
scene; creates one if missing. Returns the same shape as
`create_location_requirement`. This is the canonical entry point for "I
want to add candidates for scene N" — Cesare always calls this, never
juggles UUIDs.

### Notification timing

Today `ohw:notification` (or whatever drives the avatar badge) is
emitted when the user-side message is appended. Move the dispatch to
the `.then()` of `callAskCesare` in `CesareSheet.tsx`, **after** the
assistant reply has arrived and the tool-loop has finished. The badge
must reflect "Cesare did something for you", not "your message is in
flight".

## Migration plan

1. Add the 3 new location tools (read + 2 writes) with executors + tests.
2. Build `createUniversalCesareTools(db, projectId, pageContext)`: merges
   every existing factory. No behaviour change for existing tools.
3. Build `callCesareUniversal()` replacing the per-page dispatch.
4. Update `cesare.server.ts` `handleAskCesare` to call the universal
   entry point for every page.
5. Delete the now-unused `callCesareWith{Location,…}Tools` exports.
6. Move the notification dispatch to assistant `onSuccess`.
7. Update system prompt to include the new tools + reinforce
   "page = context, not gate".

## Tests

- Vitest:
  - `list_location_requirements` returns requirements with linked-scene
    numbers and candidate count.
  - `create_location_requirement` creates row + link, returns the new id.
  - `find_or_create_requirement_for_scene` is idempotent.
  - `add_candidate` happy path (existing tests stay green).
  - `universal-tools.test.ts` — every previously-page-bound tool is present
    in the universal factory (regression guard).
- Playwright mock-ui:
  - `[OHW-043-A]` From Locations page: ask Cesare to add 2 candidates for
    a scene with no existing requirement → requirement created + 2
    candidates inserted → list refreshes.
  - `[OHW-043-B]` From Locations page: ask Cesare to micro-edit a line in
    SC.2 → `propose_screenplay_edit` is the tool used → overlay appears in
    the screenplay editor when the user navigates there.
  - `[OHW-043-C]` Notification badge: send a slow-running Cesare prompt
    (mock with 1500ms delay) → badge stays at 0 during the wait → badge
    increments only after the assistant reply lands.
