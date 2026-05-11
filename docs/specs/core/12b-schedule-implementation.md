# Spec 12b — Shooting Schedule implementation (rule-based, no AI)

> **Status:** ✅ done
> **Depends on:** Spec 10f (Breakdown table), Spec 12 (Schedule product spec)
> **Date:** 2026-05-11

---

## Scope

Rule-based strip board with Italy country calendar. No AI generation (Spec 17). No call sheets, constraints UI, or location module integration.

---

## DB — migration 0018

```sql
CREATE TABLE schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Piano di Lavorazione',
  start_date date,
  country_code text NOT NULL DEFAULT 'IT',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shooting_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  day_number integer NOT NULL,
  date date,
  day_type text NOT NULL DEFAULT 'shoot' CHECK (day_type IN ('shoot','travel','rest','prep')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE strips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  shooting_day_id uuid REFERENCES shooting_days(id) ON DELETE SET NULL,
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  banner_color text NOT NULL DEFAULT 'white'
    CHECK (banner_color IN ('white','yellow','blue','green','red','pink','grey')),
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## Domain — `packages/domain/src/schedule/`

### `italy-calendar.ts`

- Fixed Italian national holidays (Jan 1, 6; Apr 25; May 1; Jun 2; Aug 15; Nov 1; Dec 8; Dec 25, 26)
- `isWorkingDay(date, countryCode)` — false on Sunday or national holiday
- `nextWorkingDay(date, countryCode)` — advance past non-working days
- `assignDates(dayCount, startDate, countryCode)` — array of Date for each shooting day

### `schedule-generator.ts`

`generateStrips(scenes)` — rule-based:

1. Sort by (location, timeOfDay desc) — groups same location, night after day
2. Greedy pack to 8 pages/day target (pageEnd - pageStart, default 1 if null)
3. Banner color: red=hasSpecialEffect, yellow=EXT DAY, blue=NIGHT, white=default

### `page-count.ts`

`pageCountColor(pages)` — `'green'` (6–9), `'yellow'` (4–6 | 9–12), `'red'` (<4 | >12)

---

## Server — `features/schedule/server/schedule.server.ts`

- `getSchedule({ projectId })` → full schedule view with days + strips + scene data
- `generateSchedule({ projectId, startDate? })` → idempotent: delete + recreate
- `moveStrip({ stripId, targetDayId, targetPosition })` → reorder, return updated schedule
- `updateShootingDay({ dayId, patch })` → date, dayType, notes
- `addShootingDay({ scheduleId, afterDayNumber? })` → insert empty day, renumber
- `removeShootingDay({ dayId })` → moves strips to unscheduled, deletes day, renumbers

---

## UI Components

- `SchedulePage` — route `/_app/projects/$id_/schedule`, empty state or board
- `StripBoard` — horizontal scroll flex of columns
- `ShootingDayColumn` — header (day#, date, type badge, page bar) + strips stack
- `StripCard` — color band, scene#, INT/EXT, location, time, page count, lock toggle
- `UnscheduledTray` — collapsible, sorted by scene number
- `PageCountBar` — colored progress bar (green/yellow/red)

Drag-and-drop: HTML5 drag API (no library). `onDragStart` sets stripId in dataTransfer; `onDrop` on day column or tray calls `moveStrip`.

---

## E2E Tests

- [OHW-361] Generate schedule → strips appear, grouped by location
- [OHW-362] Drag strip to different day → page counts update
- [OHW-363] Add shooting day → new column appears
- [OHW-364] Set date on day → date displays in header
- [OHW-365] Lock strip → drag is blocked

---

## Out of scope

AI suggestions, call sheets, constraints, schedule PDF export, multi-schedule per project, Italy holiday date picker highlights, merge/split days.
