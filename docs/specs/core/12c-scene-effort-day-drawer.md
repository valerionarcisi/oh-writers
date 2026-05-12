# Spec 12c — Scene Effort & Shooting Day Drawer

> **Status:** done
> **Depends on:** Spec 12b (schedule implementation)
> **Date:** 2026-05-11

---

## Problem

The current generator packs scenes by page count (target 8 pages/day). Page count is a proxy for shooting time but is often wrong: a 1-page car chase takes a full day; a 4-page dialogue in one room shoots in two hours. The director needs to assign an explicit effort estimate per scene, and the schedule must be rebuilt around those estimates.

---

## Daily Capacity

**8 hours net** — "alla francese" (no mandatory break deduction, call is 8h call-to-wrap).
Hardcoded as `DAILY_CAPACITY_HOURS = 8` in `packages/domain/src/schedule/effort.ts`.
Future: configurable per schedule (`schedules.capacity_hours`). Not in this spec.

---

## Effort Model

Each strip has an optional `estimated_hours` override (stored in DB). When `null`, the effort is auto-calculated:

```
resolvedHours(pageCount, override) = override ?? pageCount * 1.0
```

1 page = 1 hour by default. This fills an 8-page/8-hour day — a reasonable starting point for an independent feature. The director overrides per scene where reality differs.

The generator (in `generateStrips`) is updated to pack by `resolvedHours` against the 8h capacity instead of the current page-count heuristic.

---

## DB — migration 0019

```sql
ALTER TABLE strips
  ADD COLUMN estimated_hours real;
-- null = auto (pageCount * 1.0), explicit value = director override
```

---

## Domain changes — `packages/domain/src/schedule/`

### `effort.ts` (new)

```typescript
export const DAILY_CAPACITY_HOURS = 8;

export const resolveEffortHours = (
  pageCount: number,
  override: number | null,
): number => override ?? pageCount * 1.0;
```

### `schedule-generator.ts` (update)

Replace page-count packing with hour-based packing:

```typescript
// Before: pack until currentPageCount + scenePages > PAGE_TARGET (8)
// After:  pack until currentHours + sceneHours > DAILY_CAPACITY_HOURS (8)
const sceneHours = resolveEffortHours(
  scene.pageCount,
  scene.estimatedHours ?? null,
);
```

`generateStrips` input type gains `estimatedHours: number | null` per scene. The output strip carries `estimatedHours` (null = auto, to be stored).

---

## Server — `features/schedule/server/schedule.server.ts`

### Type changes

`StripView` gains:

```typescript
estimatedHours: number | null; // raw DB value, null = auto
resolvedHours: number; // estimatedHours ?? pageCount * 1.0
```

`ShootingDayView` gains:

```typescript
totalHours: number; // sum of resolvedHours for all strips in the day
```

`loadScheduleView` selects `strips.estimatedHours` in the existing query.

### New server function

```typescript
export const updateStripEffort = createServerFn({ method: "POST" })
  .validator(z.object({
    stripId: z.string().uuid(),
    estimatedHours: z.number().min(0.5).max(24).nullable(),
  }))
  .handler(async ({ data }): Promise<ResultShape<void, ...>> => {
    // auth + permission check
    // db.update(strips).set({ estimatedHours: data.estimatedHours }).where(eq(strips.id, data.stripId))
  });
```

---

## UI

### `ShootingDayColumn` — clickable header

The day header (day number + date + type badge) becomes a button that opens `ShootingDayDrawer`. The existing drag-drop and remove button are unaffected.

### `ShootingDayDrawer` (new component)

Slide-in panel from the right (same pattern as `SceneDrawer`). Opens on day header click.

**Header:** "Giorno N" · date (if set) · day type badge · close button

**Capacity bar:**

```
[████████░░░░░░░░] 6.5h / 8h
```

Color: green if ≤ 8h, yellow 8–10h, red > 10h.

**Scene list:** one row per strip in the day, sorted by position:

- Color band (4px, same color as card)
- Scene number + location
- Page count (muted)
- Effort input: `<input type="number" min="0.5" max="24" step="0.5" />`
  - Placeholder = auto value (e.g. "2.0 (auto)")
  - If overridden, shows the value; clear button resets to auto (sets null)
- Auto-save on blur (no explicit save button)

**Footer:** total hours displayed, advisory if over capacity.

### `ShootingDayColumn.module.css`

Header area gets `cursor: pointer` + hover state. Small hours indicator in the header (e.g. "6.5h") replaces or accompanies the page bar.

---

## Week view layout fix (included here)

`.weeksBoard` changes to `flex-direction: column` with `gap: var(--space-8)`. Each `weekGroup` renders its days in a horizontal `weekDays` flex row. This means weeks stack vertically — multiple weeks scroll down instead of right, which matches the mental model of a calendar.

---

## Out of scope

- Per-schedule configurable capacity (always 8h for now)
- Carry-over / split scenes across days
- Effort suggestions from Cesare AI (Spec 17)
- Export effort data to CSV
