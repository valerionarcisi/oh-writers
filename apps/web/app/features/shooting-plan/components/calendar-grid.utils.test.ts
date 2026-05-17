import { describe, it, expect } from "vitest";
import {
  buildDayCells,
  buildWeekRows,
  formatMinutes,
  getDayOfWeek,
  getDayAbbrev,
  SHOOTING_DAY_MINUTES,
} from "./calendar-grid.utils";
import type { SceneWithPlanSummary } from "../server/shooting-plan.server";
import type { ShootingDayView } from "../../schedule/server/schedule.server";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const makeScene = (
  sceneId: string,
  shotCount: number,
  totalMinutes: number | null,
  location = "Int. Test",
): SceneWithPlanSummary => ({
  sceneId,
  sceneNumber: parseInt(sceneId, 10),
  sceneHeading: `SC.${sceneId}`,
  intExt: "INT",
  location,
  shotCount,
  totalMinutes,
});

const makeDay = (
  dayNumber: number,
  sceneIds: string[],
  date: string | null = null,
): ShootingDayView => ({
  id: `day-${dayNumber}`,
  dayNumber,
  date,
  dayType: "shoot",
  notes: null,
  strips: sceneIds.map((sceneId, i) => ({
    id: `strip-${dayNumber}-${i}`,
    shootingDayId: `day-${dayNumber}`,
    sceneId,
    position: i,
    bannerColor: "white",
    isLocked: false,
    estimatedHours: null,
    resolvedHours: 0,
    sceneNumber: parseInt(sceneId, 10),
    sceneHeading: `SC.${sceneId}`,
    location: "Test",
    intExt: "INT",
    timeOfDay: null,
    pageCount: 1,
  })),
  totalPageCount: sceneIds.length,
  totalHours: 0,
});

// ─── buildDayCells ────────────────────────────────────────────────────────────

describe("buildDayCells", () => {
  it("returns an empty array for no shooting days", () => {
    expect(buildDayCells([], [])).toEqual([]);
  });

  it("aggregates shotCount and totalMinutes from scenes", () => {
    const scenes = [makeScene("1", 5, 60), makeScene("2", 3, 40)];
    const day = makeDay(1, ["1", "2"]);
    const cells = buildDayCells([day], scenes);

    expect(cells).toHaveLength(1);
    expect(cells[0]!.sceneCount).toBe(2);
    expect(cells[0]!.shotCount).toBe(8);
    expect(cells[0]!.totalMinutes).toBe(100);
  });

  it("computes durationPct as percentage of SHOOTING_DAY_MINUTES", () => {
    const scenes = [makeScene("1", 1, SHOOTING_DAY_MINUTES / 2)];
    const day = makeDay(1, ["1"]);
    const [cell] = buildDayCells([day], scenes);
    expect(cell!.durationPct).toBe(50);
  });

  it("clamps durationPct at 100", () => {
    const scenes = [makeScene("1", 1, SHOOTING_DAY_MINUTES * 2)];
    const day = makeDay(1, ["1"]);
    const [cell] = buildDayCells([day], scenes);
    expect(cell!.durationPct).toBe(100);
  });

  it("marks isOverloaded when durationPct >= 90", () => {
    const scenes = [makeScene("1", 1, Math.round(SHOOTING_DAY_MINUTES * 0.9))];
    const day = makeDay(1, ["1"]);
    const [cell] = buildDayCells([day], scenes);
    expect(cell!.isOverloaded).toBe(true);
  });

  it("does not mark isOverloaded when durationPct < 90", () => {
    const scenes = [makeScene("1", 1, Math.round(SHOOTING_DAY_MINUTES * 0.5))];
    const day = makeDay(1, ["1"]);
    const [cell] = buildDayCells([day], scenes);
    expect(cell!.isOverloaded).toBe(false);
  });

  it("picks the most common location as primaryLocation", () => {
    const scenes = [
      makeScene("1", 1, 60, "Int. A"),
      makeScene("2", 1, 60, "Int. A"),
      makeScene("3", 1, 60, "Ext. B"),
    ];
    const day = makeDay(1, ["1", "2", "3"]);
    const [cell] = buildDayCells([day], scenes);
    expect(cell!.primaryLocation).toBe("Int. A");
  });

  it("handles scenes with null totalMinutes", () => {
    const scenes = [makeScene("1", 3, null)];
    const day = makeDay(1, ["1"]);
    const [cell] = buildDayCells([day], scenes);
    expect(cell!.totalMinutes).toBe(0);
    expect(cell!.durationPct).toBe(0);
  });

  it("filters out non-shoot days", () => {
    const travelDay: ShootingDayView = {
      ...makeDay(1, []),
      dayType: "travel",
    };
    const cells = buildDayCells([travelDay], []);
    expect(cells).toHaveLength(0);
  });

  it("sorts by dayNumber ascending", () => {
    const scenes = [makeScene("1", 1, 30), makeScene("2", 1, 30)];
    const day2 = makeDay(2, ["2"]);
    const day1 = makeDay(1, ["1"]);
    const cells = buildDayCells([day2, day1], scenes);
    expect(cells[0]!.dayNumber).toBe(1);
    expect(cells[1]!.dayNumber).toBe(2);
  });

  it("handles 30 shooting days without performance issues", () => {
    const scenes = Array.from({ length: 30 }, (_, i) =>
      makeScene(String(i + 1), 10, 60),
    );
    const days = scenes.map((s, i) => makeDay(i + 1, [s.sceneId]));
    const cells = buildDayCells(days, scenes);
    expect(cells).toHaveLength(30);
  });
});

// ─── buildWeekRows (sequential mode — no dates) ───────────────────────────────

describe("buildWeekRows — sequential (no dates)", () => {
  it("returns an empty array for no cells", () => {
    expect(buildWeekRows([])).toEqual([]);
  });

  it("places 5 days in week 1 columns Mon–Fri", () => {
    const cells = Array.from({ length: 5 }, (_, i) => ({
      dayNumber: i + 1,
      date: null,
      sceneCount: 1,
      shotCount: 2,
      totalMinutes: 60,
      durationPct: 12,
      isOverloaded: false,
      primaryLocation: "Int. Test",
      sceneIds: [String(i + 1)],
    }));
    const weeks = buildWeekRows(cells);
    expect(weeks).toHaveLength(1);
    const week = weeks[0]!;
    expect(week.slots.filter((s) => s.dayCell !== null)).toHaveLength(5);
    expect(week.slots[5]!.isWeekend).toBe(true);
    expect(week.slots[6]!.isWeekend).toBe(true);
  });

  it("spans 2 weeks for 6 shoot days", () => {
    const cells = Array.from({ length: 6 }, (_, i) => ({
      dayNumber: i + 1,
      date: null,
      sceneCount: 2,
      shotCount: 5,
      totalMinutes: 120,
      durationPct: 25,
      isOverloaded: false,
      primaryLocation: null,
      sceneIds: [],
    }));
    const weeks = buildWeekRows(cells);
    expect(weeks).toHaveLength(2);
  });

  it("aggregates week totals correctly", () => {
    const cells = Array.from({ length: 5 }, () => ({
      dayNumber: 1,
      date: null,
      sceneCount: 2,
      shotCount: 4,
      totalMinutes: 80,
      durationPct: 16,
      isOverloaded: false,
      primaryLocation: null,
      sceneIds: [],
    }));
    const [week] = buildWeekRows(cells);
    expect(week!.totalScenes).toBe(10);
    expect(week!.totalShots).toBe(20);
    expect(week!.totalMinutes).toBe(400);
    expect(week!.activeDays).toBe(5);
  });
});

// ─── buildWeekRows (date mode) ────────────────────────────────────────────────

describe("buildWeekRows — date mode", () => {
  it("places Monday cell in slot 0 and Friday cell in slot 4", () => {
    const monday: import("./calendar-grid.utils").DayCell = {
      dayNumber: 1,
      date: "2026-06-01", // Monday
      sceneCount: 3,
      shotCount: 10,
      totalMinutes: 200,
      durationPct: 41,
      isOverloaded: false,
      primaryLocation: "Int. Test",
      sceneIds: [],
    };
    const friday: import("./calendar-grid.utils").DayCell = {
      dayNumber: 2,
      date: "2026-06-05", // Friday
      sceneCount: 2,
      shotCount: 6,
      totalMinutes: 100,
      durationPct: 20,
      isOverloaded: false,
      primaryLocation: "Ext. B",
      sceneIds: [],
    };
    const weeks = buildWeekRows([monday, friday]);
    expect(weeks).toHaveLength(1);
    const week = weeks[0]!;
    expect(week.slots[0]!.dayCell?.dayNumber).toBe(1);
    expect(week.slots[4]!.dayCell?.dayNumber).toBe(2);
    expect(week.slots[1]!.dayCell).toBeNull();
    expect(week.slots[5]!.isWeekend).toBe(true);
  });

  it("produces 2 week rows for days spread across 2 calendar weeks", () => {
    const week1Day: import("./calendar-grid.utils").DayCell = {
      dayNumber: 1,
      date: "2026-06-01",
      sceneCount: 1,
      shotCount: 3,
      totalMinutes: 60,
      durationPct: 12,
      isOverloaded: false,
      primaryLocation: null,
      sceneIds: [],
    };
    const week2Day: import("./calendar-grid.utils").DayCell = {
      dayNumber: 2,
      date: "2026-06-08",
      sceneCount: 2,
      shotCount: 5,
      totalMinutes: 90,
      durationPct: 18,
      isOverloaded: false,
      primaryLocation: null,
      sceneIds: [],
    };
    const weeks = buildWeekRows([week1Day, week2Day]);
    expect(weeks).toHaveLength(2);
  });
});

// ─── formatMinutes ────────────────────────────────────────────────────────────

describe("formatMinutes", () => {
  it("formats 0 minutes correctly", () => expect(formatMinutes(0)).toBe("0m"));
  it("formats minutes only", () => expect(formatMinutes(45)).toBe("45m"));
  it("formats whole hours", () => expect(formatMinutes(120)).toBe("2h"));
  it("formats hours and minutes", () => expect(formatMinutes(95)).toBe("1h 35m"));
});

// ─── getDayOfWeek ─────────────────────────────────────────────────────────────

describe("getDayOfWeek", () => {
  it("returns 0 for Monday 2026-06-01", () => expect(getDayOfWeek("2026-06-01")).toBe(0));
  it("returns 4 for Friday 2026-06-05", () => expect(getDayOfWeek("2026-06-05")).toBe(4));
  it("returns 6 for Sunday 2026-06-07", () => expect(getDayOfWeek("2026-06-07")).toBe(6));
});

// ─── getDayAbbrev ─────────────────────────────────────────────────────────────

describe("getDayAbbrev", () => {
  it("returns 'Lun' for 2026-06-01", () => expect(getDayAbbrev("2026-06-01")).toBe("Lun"));
  it("returns 'Ven' for 2026-06-05", () => expect(getDayAbbrev("2026-06-05")).toBe("Ven"));
  it("returns 'Dom' for 2026-06-07", () => expect(getDayAbbrev("2026-06-07")).toBe("Dom"));
});
