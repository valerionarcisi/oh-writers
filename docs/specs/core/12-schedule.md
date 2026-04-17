# 12 — Schedule & Strip Board

## Overview

The shooting schedule organizes scenes into shooting days. The primary view is the **strip board** — the industry-standard tool used by every first assistant director and production manager in the world.

A strip is one scene. A shooting day is a column of strips. The AD drags and drops strips across days to build the most efficient shooting order, which often differs radically from the narrative order of the screenplay.

---

## Core Concepts

### Strip Board

The strip board is a visual grid:

- **Columns** = shooting days (left to right)
- **Rows** = scenes stacked within each day
- **Strips** = colored cards representing individual scenes

Each strip shows at a glance:

- Scene number
- INT/EXT indicator
- Location name
- Time of day (DAY / NIGHT / DAWN / DUSK)
- Page count (in eighths)
- Cast involved (initials or numbers)

Color coding follows breakdown categories: an action scene involving VFX is different from a dialogue scene. The color of a strip reflects its dominant production complexity.

### Shooting Day

A shooting day has:

- Date (or just a day number if dates are not yet fixed)
- Location (scenes on the same day should ideally be at the same location)
- Estimated page count (total eighths for the day — industry standard is ~8 pages/day for features)
- Cast call list (who is needed that day)
- Day type: `shoot`, `travel`, `rest`, `prep`

### Scene Order vs Narrative Order

The schedule orders scenes by production efficiency, not story order. The screenplay numbers stay fixed — they are never renumbered. The schedule just determines which day each scene is shot.

---

## Data Model

```typescript
export const StripSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  shootingDayId: z.string().uuid().nullable(), // null = unscheduled
  position: z.number().int(), // order within the shooting day
  bannerColor: z.enum([
    "white", // standard dialogue scene
    "yellow", // exterior day
    "blue", // exterior night / interior night
    "green", // insert / second unit
    "red", // action / stunt
    "pink", // VFX heavy
    "grey", // non-shooting day marker
  ]),
  isLocked: z.boolean().default(false), // locked strips cannot be moved
});

export const ShootingDaySchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  dayNumber: z.number().int().positive(),
  date: z.date().nullable(), // null until dates are confirmed
  dayType: z.enum(["shoot", "travel", "rest", "prep"]),
  locationId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  strips: z.array(StripSchema),
  totalPageCount: z.number(), // sum of strip page counts, computed
  castIds: z.array(z.string().uuid()), // computed from strips
});

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int().default(1),
  status: z.enum(["draft", "ai_suggested", "in_review", "locked"]),
  startDate: z.date().nullable(),
  shootingDays: z.array(ShootingDaySchema),
  unscheduledStrips: z.array(StripSchema), // not yet assigned to a day
});

export type Schedule = z.infer<typeof ScheduleSchema>;
export type ShootingDay = z.infer<typeof ShootingDaySchema>;
export type Strip = z.infer<typeof StripSchema>;
```

---

## AI Scheduling

### Optimization criteria

The AI organizes scenes into shooting days trying to minimize:

1. **Location moves** — scenes at the same location grouped on the same day
2. **Cast travel** — actors needed on consecutive days stay on consecutive days
3. **Day/night switches** — avoid alternating day and night shoots
4. **Child actor constraints** — scenes with minors scheduled within legal working hours

The AI does not try to be perfect. It produces a reasonable first draft. The AD always has final control.

### Inputs

- All scenes with their breakdown sheets (confirmed)
- Estimated shooting days from breakdown summary
- Location assignments from location module
- Any manual constraints set by the user (actor unavailability, location booking windows)

### Output

A complete `Schedule` with all strips assigned to shooting days and ordered within each day. Unschedulable strips (missing breakdown data) go to `unscheduledStrips`.

---

## User Flows

### Generate schedule

1. User opens Schedule tab — requires breakdown to be confirmed
2. Button: "Generate AI schedule"
3. AI produces first draft — all strips assigned to days
4. Strip board renders immediately, user can start editing

### Strip board interaction

- **Drag strip** between days or within a day to reorder
- **Drag strip to unscheduled** area to remove from schedule temporarily
- **Click strip** to open scene details (breakdown sheet, notes)
- **Lock strip** to prevent accidental moves
- **Collapse day** to show only the day header and total page count

### Day management

- **Add day** — insert a new shooting day (shoot, travel, rest, prep)
- **Set date** — assign a calendar date to a day number
- **Merge days** — combine two underpopulated days
- **Split day** — divide an overpopulated day (too many pages)

### Page count indicator

Each shooting day shows a page count bar:

- Green: 6–9 pages (ideal range for feature films)
- Yellow: 4–6 pages (light day) or 9–12 pages (heavy day)
- Red: under 4 or over 12 pages (needs attention)

---

## Schedule Constraints

Users can add constraints that the AI respects during generation and that the UI highlights when violated:

```typescript
export const ScheduleConstraintSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  type: z.enum([
    "cast_unavailable", // actor not available on date range
    "location_unavailable", // location not available on date range
    "must_shoot_before", // scene A must be shot before scene B
    "must_shoot_together", // scenes must be on the same day
    "max_pages_per_day", // override default page limit
  ]),
  payload: z.record(z.string(), z.unknown()), // type-specific data
});
```

Violated constraints are highlighted in red on the strip board. The user can override them explicitly.

---

## Server Functions

```typescript
// features/schedule/schedule.server.ts

export const generateSchedule = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      Result<Schedule, ForbiddenError | AiError | ValidationError>
    > => {
      // requires confirmed breakdown
      // calls AI, returns full schedule draft
    },
  );

export const moveStrip = createServerFn({ method: "POST" })
  .validator(
    z.object({
      stripId: z.string().uuid(),
      targetDayId: z.string().uuid().nullable(),
      targetPosition: z.number().int(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      Result<Schedule, NotFoundError | ForbiddenError | ValidationError>
    > => {
      // reorder strips, recalculate page counts
      // return full updated schedule for optimistic UI
    },
  );

export const addConstraint = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scheduleId: z.string().uuid(),
      constraint: ScheduleConstraintSchema.omit({ id: true, scheduleId: true }),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      Result<ScheduleConstraint, ForbiddenError | ValidationError>
    > => {},
  );
```

---

## Call Sheet (future)

The schedule is the foundation for call sheets — daily documents sent to cast and crew with precise arrival times, scenes to be shot, and logistical information. Call sheets are out of scope for v1 but the data model is designed to support them.

---

## Spec References

- Breakdown (schedule inputs): `10-breakdown.md`
- Budget (shooting days affect cost): `11-budget.md`
- Locations (location assignments): `13-locations.md`
- AI infrastructure: `07-ai-predictions.md`
