# 11d — Budget: Production Categories & Day Cost View

## Overview

Extends the budget page with inferred production category sections (locations, photography, sound, scenography, costumes, vehicles, extras, VFX, stunts) and a "Per giornata" toggle that shows the cost breakdown per shooting day.

Above-the-line items (story rights, producer, director fees) are deferred to a future spec.

---

## Scope

- New accordion sections in the budget main column, one per production category
- Sections appear only when the breakdown contains elements of that category
- Rates inferred from rate card or set manually; quantities inferred from schedule
- Toggle "Per categoria / Per giornata" to switch the main column view
- Day cost view is read-only — computed from schedule + budget at query time
- No new DB tables required

---

## Category Sections

Each section is a collapsible accordion. Sections are ordered as listed below and hidden when the breakdown has no elements for that category.

| Section | Breakdown categories | Row model |
|---|---|---|
| 📍 Locations | `locations` | Per-element (one row per unique location) |
| 🎬 Fotografia | `equipment` | Aggregate (one row, AI estimate) |
| 🎵 Suono | `sound` | Aggregate |
| 🏛 Scenografia | `props` + `set_dress` | Aggregate |
| 👗 Costumi & Make-up | `wardrobe` + `makeup` | Aggregate |
| 🚗 Veicoli | `vehicles` | Per-element (one row per unique vehicle) |
| 👥 Comparse | `extras` + `atmosphere` | Aggregate (quantity × days × rate) |
| ✨ VFX / SFX | `vfx` + `sfx` | Aggregate (AI estimate per scene count) |
| 🎯 Stunt | `stunts` | Aggregate |

### Per-element sections (Locations, Veicoli)

Each unique breakdown element becomes a budget line with:
- `linked_element_id` pointing to the breakdown element
- `linked_category` set to the breakdown category
- `quantity` = number of schedule days containing at least one scene where the element appears
- `rate` = value from rate card entry with matching name, or 0 if not found

### Aggregate sections

A single `budget_line` per section with:
- `linked_category` set to the primary category (e.g. `equipment` for Fotografia)
- `quantity` = element count from breakdown
- `rate` = AI estimate or 0
- User can override with `actual`

### Comparse

- `quantity` = average extras per scene × shooting days
- `rate` = rate card entry named "Comparsa" or "Extra", otherwise 0

---

## Regeneration Behaviour

When `generateBudget` runs:

1. For each active breakdown element in the project → upsert a budget line:
   - Match on `(budget_id, linked_element_id)` for per-element lines
   - Match on `(budget_id, linked_category)` for aggregate lines
2. Update `quantity` from current schedule/breakdown data
3. **Preserve `actual`** — never overwrite a value the user has set
4. Lines whose element was removed from the breakdown are **not deleted** — they remain with a visual "stale" indicator until the user removes them manually

### Existing EquipmentWidget lines

Lines with `top_sheet = 'production'` and no `linked_category` (generated before this spec) remain visible in a fallback "Altro" section until the user regenerates the budget. After regeneration they are replaced by the categorised lines.

---

## DB Changes

None. The existing `budget_lines` columns `linked_element_id` and `linked_category` are sufficient.

---

## Server Functions

### Updated: `generateBudget`

Existing function extended to:
- Query all breakdown elements grouped by category
- Upsert production category lines as described above
- Compute quantities from schedule day assignments

### New: `getDayCosts`

```typescript
export const getDayCosts = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<DayCost[], ForbiddenError | NotFoundError>> => {
    // requires schedule to exist; returns empty array if no schedule
  });

type DayCost = {
  dayId: string
  dayNumber: number
  date: string | null                          // ISO date if set on the schedule day
  scenes: { number: number; heading: string }[]
  breakdown: {
    cast: number        // pro-rated cast cost for scenes on this day
    crew: number        // total crew cost ÷ shooting days
    locations: number   // sum of rates for locations appearing in this day's scenes
    vehicles: number    // sum of rates for vehicles appearing in this day's scenes
    other: number       // all remaining category totals ÷ shooting days
    contingency: number // contingencyPercent applied to day subtotal
  }
  total: number
}
```

Returns `[]` (not an error) when no schedule exists — the day view simply shows an empty state.

---

## UI Changes

### BudgetPage

- Toolbar gains a view toggle: **"Per categoria"** / **"Per giornata"**
- Toggle is disabled (greyed out) when no schedule exists, with tooltip "Pianifica le giornate nello schedule per attivare questa vista"
- The `main col` renders either `CategoryView` or `DayView` based on toggle state
- Sidebar (`TotalWidget`) is unchanged in both modes

### CategoryView

Replaces the current flat widget list. Renders sections in order:
1. CastWidget (unchanged)
2. CrewWidget (unchanged)
3. One accordion per production category (only if non-empty after generation)
4. MiscWidget (contingency lines, unchanged) — renamed to `ContingencyWidget`

The current `EquipmentWidget` is removed; its lines surface in the fallback "Altro" section.

### DayView

Read-only. Renders one accordion per shooting day:
- Header: day number, location name(s), scene numbers, bar chart of cost relative to most expensive day, total
- Expanded body: table of cost breakdown (cast / crew / locations / vehicles / other / contingency)
- Days with total > average day cost × 1.5 are highlighted in red as a warning

### Per-element section widget (LocationsWidget, VehiclesWidget)

Mirrors the existing CastWidget pattern:
- Table with one row per element
- Columns: name, scene count, days (inferred, read-only), rate (editable), total
- "Stale" badge on rows whose breakdown element no longer exists
- No "add row" — elements come from breakdown only

### Aggregate section widget

Shared `CategoryLineWidget` component, parameterised by `linkedCategory`:
- Single row: category name, element count (from breakdown), rate (editable or AI value), total
- AI-estimated values shown in muted italic until user sets `actual`

---

## Total Widget Update

The sidebar `TotalWidget` gains new line items for each non-zero production category, replacing the current single "Equipment" row.

---

## Testing

- Vitest: `generateBudget` upsert logic — preserves `actual`, updates `quantity`, handles missing schedule
- Vitest: `getDayCosts` — correct pro-rating of cast, crew distributed evenly, location matched to scene
- Playwright: regenerate budget → Locations section appears with correct rows; editing a rate persists; toggling to day view shows correct totals
