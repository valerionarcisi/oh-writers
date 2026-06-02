import type { SceneWithPlanSummary } from "../server/shooting-plan.server";
import type { ShootingDayView } from "../../schedule/server/schedule.server";

// Standard shooting day duration used for the duration bar (8 hours = 480 minutes)
export const SHOOTING_DAY_MINUTES = 480;

export interface DayCell {
  dayNumber: number;
  date: string | null;
  sceneCount: number;
  shotCount: number;
  totalMinutes: number;
  durationPct: number;
  isOverloaded: boolean;
  primaryLocation: string | null;
  sceneIds: string[];
}

export interface WeekGroup {
  weekIndex: number;
  label: string;
  dateRangeLabel: string | null;
  cells: DayCell[];
  totalScenes: number;
  totalShots: number;
  totalMinutes: number;
  activeDayCount: number;
}

const DAY_ABBREVS_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const;
const DAY_ABBREVS_LONG_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"] as const;
const MONTH_NAMES_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
] as const;

export const formatDateShort = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${day} ${MONTH_NAMES_IT[(month - 1) as number] ?? ""}`;
};

export const getDayAbbrev = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  return DAY_ABBREVS_IT[date.getDay()] ?? "";
};

export const getDayOfWeek = (isoDate: string): number => {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const date = new Date(year, month - 1, day);
  // ISO week: Mon=0, Sun=6
  return (date.getDay() + 6) % 7;
};

// Derive day cells from schedule shooting days, enriched with shot plan data
export const buildDayCells = (
  shootingDays: ShootingDayView[],
  scenes: SceneWithPlanSummary[],
): DayCell[] => {
  const sceneMap = new Map(scenes.map((s) => [s.sceneId, s]));

  return shootingDays
    .filter((d) => d.dayType === "shoot")
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day): DayCell => {
      const sceneIds = day.strips.map((s) => s.sceneId);
      const dayScenes = sceneIds.map((id) => sceneMap.get(id)).filter(Boolean) as SceneWithPlanSummary[];

      const sceneCount = dayScenes.length;
      const shotCount = dayScenes.reduce((sum, s) => sum + s.shotCount, 0);
      const totalMinutes = dayScenes.reduce((sum, s) => sum + (s.totalMinutes ?? 0), 0);
      const durationPct = Math.min(100, Math.round((totalMinutes / SHOOTING_DAY_MINUTES) * 100));
      const isOverloaded = durationPct >= 90;

      // Primary location: most common location among scenes
      const locationCounts = new Map<string, number>();
      for (const s of dayScenes) {
        locationCounts.set(s.location, (locationCounts.get(s.location) ?? 0) + 1);
      }
      let primaryLocation: string | null = null;
      let maxCount = 0;
      for (const [loc, count] of locationCounts) {
        if (count > maxCount) {
          maxCount = count;
          primaryLocation = loc;
        }
      }

      return {
        dayNumber: day.dayNumber,
        date: day.date,
        sceneCount,
        shotCount,
        totalMinutes,
        durationPct,
        isOverloaded,
        primaryLocation,
        sceneIds,
      };
    });
};

// Groups day cells into ISO calendar weeks (Mon–Sun)
// Pads the week with "null" slots where no shooting day falls
export interface WeekSlot {
  dayOfWeek: number; // 0=Mon, 6=Sun
  dayCell: DayCell | null;
  isWeekend: boolean;
}

export interface WeekRow {
  weekIndex: number;
  label: string;
  dateRangeLabel: string | null;
  slots: WeekSlot[];
  activeDays: number;
  totalScenes: number;
  totalShots: number;
  totalMinutes: number;
}

// Formats the per-week sidebar label ("Settimana N" in Italian). The UI passes a
// locale-aware formatter; the default keeps the historical Italian label so the
// utils stay usable (and unit-testable) without a translator.
export type WeekLabelFormatter = (weekNumber: number) => string;

const defaultWeekLabel: WeekLabelFormatter = (n) => `Settimana ${n}`;

// Assign day cells to weeks. When days have dates, we use actual calendar week
// placement. When no dates are assigned, we space them sequentially Mon–Fri.
export const buildWeekRows = (
  cells: DayCell[],
  weekLabel: WeekLabelFormatter = defaultWeekLabel,
): WeekRow[] => {
  if (cells.length === 0) return [];

  const hasDates = cells.some((c) => c.date !== null);

  if (hasDates) {
    return buildWeekRowsFromDates(cells, weekLabel);
  }
  return buildWeekRowsSequential(cells, weekLabel);
};

const buildWeekRowsFromDates = (
  cells: DayCell[],
  weekLabel: WeekLabelFormatter,
): WeekRow[] => {
  // Map each cell to its ISO week key (year-week)
  const weekMap = new Map<string, DayCell[]>();

  for (const cell of cells) {
    if (!cell.date) continue;
    const [year, month, day] = cell.date.split("-").map(Number);
    if (!year || !month || !day) continue;
    const d = new Date(year, month - 1, day);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    // Monday of this week
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
    const arr = weekMap.get(weekKey) ?? [];
    arr.push(cell);
    weekMap.set(weekKey, arr);
  }

  // Sort week keys
  const sortedKeys = Array.from(weekMap.keys()).sort();

  return sortedKeys.map((mondayStr, idx): WeekRow => {
    const [my, mm, md] = mondayStr.split("-").map(Number);
    if (!my || !mm || !md) return buildEmptyWeek(idx + 1, weekLabel);

    const monday = new Date(my, mm - 1, md);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const weekCells = weekMap.get(mondayStr) ?? [];
    const slots: WeekSlot[] = Array.from({ length: 7 }, (_, dow): WeekSlot => {
      const slotDate = new Date(monday);
      slotDate.setDate(monday.getDate() + dow);
      const slotDateStr = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, "0")}-${String(slotDate.getDate()).padStart(2, "0")}`;
      const cell = weekCells.find((c) => c.date === slotDateStr) ?? null;
      return { dayOfWeek: dow, dayCell: cell, isWeekend: dow >= 5 };
    });

    const mondayLabel = `${monday.getDate()} ${MONTH_NAMES_IT[monday.getMonth()] ?? ""}`;
    const sundayLabel = `${sunday.getDate()} ${MONTH_NAMES_IT[sunday.getMonth()] ?? ""}`;
    const dateRangeLabel = `${mondayLabel} – ${sundayLabel}`;

    const activeDays = slots.filter((s) => s.dayCell !== null).length;
    const totalScenes = weekCells.reduce((sum, c) => sum + c.sceneCount, 0);
    const totalShots = weekCells.reduce((sum, c) => sum + c.shotCount, 0);
    const totalMinutes = weekCells.reduce((sum, c) => sum + c.totalMinutes, 0);

    return {
      weekIndex: idx + 1,
      label: weekLabel(idx + 1),
      dateRangeLabel,
      slots,
      activeDays,
      totalScenes,
      totalShots,
      totalMinutes,
    };
  });
};

// No dates: lay days out sequentially Mon–Fri, 5 per week
const buildWeekRowsSequential = (
  cells: DayCell[],
  weekLabel: WeekLabelFormatter,
): WeekRow[] => {
  const weeks: WeekRow[] = [];
  let weekIdx = 0;
  let cellIdx = 0;

  while (cellIdx < cells.length) {
    weekIdx++;
    const slots: WeekSlot[] = [];

    for (let dow = 0; dow < 7; dow++) {
      const isWeekend = dow >= 5;
      if (isWeekend || cellIdx >= cells.length) {
        slots.push({ dayOfWeek: dow, dayCell: null, isWeekend });
      } else {
        slots.push({ dayOfWeek: dow, dayCell: cells[cellIdx] ?? null, isWeekend: false });
        cellIdx++;
      }
    }

    const weekCells = slots.map((s) => s.dayCell).filter(Boolean) as DayCell[];
    weeks.push({
      weekIndex: weekIdx,
      label: weekLabel(weekIdx),
      dateRangeLabel: null,
      slots,
      activeDays: weekCells.length,
      totalScenes: weekCells.reduce((sum, c) => sum + c.sceneCount, 0),
      totalShots: weekCells.reduce((sum, c) => sum + c.shotCount, 0),
      totalMinutes: weekCells.reduce((sum, c) => sum + c.totalMinutes, 0),
    });
  }

  return weeks;
};

const buildEmptyWeek = (
  idx: number,
  weekLabel: WeekLabelFormatter = defaultWeekLabel,
): WeekRow => ({
  weekIndex: idx,
  label: weekLabel(idx),
  dateRangeLabel: null,
  slots: Array.from({ length: 7 }, (_, dow) => ({
    dayOfWeek: dow,
    dayCell: null,
    isWeekend: dow >= 5,
  })),
  activeDays: 0,
  totalScenes: 0,
  totalShots: 0,
  totalMinutes: 0,
});

export const formatMinutes = (m: number): string => {
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
};

// Exported for testing
export const DAY_ABBREVS_IT_EXPORT = DAY_ABBREVS_IT;
export const MONTH_NAMES_IT_EXPORT = MONTH_NAMES_IT;
