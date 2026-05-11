import { describe, it, expect } from "vitest";
import { isWorkingDay, assignDates } from "./italy-calendar.js";
import { pageCountColor } from "./page-count.js";
import { generateStrips } from "./schedule-generator.js";

describe("isWorkingDay (IT)", () => {
  it("Monday is a working day", () => {
    expect(isWorkingDay(new Date("2026-05-11"), "IT")).toBe(true); // Monday
  });

  it("Sunday is not a working day", () => {
    expect(isWorkingDay(new Date("2026-05-10"), "IT")).toBe(false); // Sunday
  });

  it("Saturday is a working day", () => {
    expect(isWorkingDay(new Date("2026-05-09"), "IT")).toBe(true); // Saturday
  });

  it("Christmas Day is not a working day", () => {
    expect(isWorkingDay(new Date("2026-12-25"), "IT")).toBe(false);
  });

  it("Ferragosto is not a working day", () => {
    expect(isWorkingDay(new Date("2026-08-15"), "IT")).toBe(false);
  });
});

describe("assignDates", () => {
  it("skips Sunday when assigning 7 days from Saturday", () => {
    const dates = assignDates(7, new Date("2026-05-09"), "IT"); // starts Saturday
    expect(dates).toHaveLength(7);
    // None should be a Sunday
    for (const d of dates) {
      expect(d.getDay()).not.toBe(0);
    }
  });

  it("skips national holidays", () => {
    // Start 2026-04-24 (Friday before Apr 25 holiday)
    const dates = assignDates(3, new Date("2026-04-24"), "IT");
    const isoStrings = dates.map((d) => d.toISOString().slice(0, 10));
    expect(isoStrings).not.toContain("2026-04-25");
  });
});

describe("pageCountColor", () => {
  it("green for ideal range", () => {
    expect(pageCountColor(7)).toBe("green");
    expect(pageCountColor(6)).toBe("green");
    expect(pageCountColor(9)).toBe("green");
  });

  it("yellow for light or heavy day", () => {
    expect(pageCountColor(5)).toBe("yellow");
    expect(pageCountColor(10)).toBe("yellow");
  });

  it("red for extreme values", () => {
    expect(pageCountColor(2)).toBe("red");
    expect(pageCountColor(13)).toBe("red");
  });
});

describe("generateStrips", () => {
  const makeScene = (
    overrides: Partial<Parameters<typeof generateStrips>[0][number]>,
  ) => ({
    id: crypto.randomUUID(),
    number: 1,
    location: "STUDIO",
    intExt: "INT" as const,
    timeOfDay: "DAY",
    pageStart: 1,
    pageEnd: 2,
    hasSpecialEffect: false,
    ...overrides,
  });

  it("groups same-location scenes on the same day", () => {
    const scenes = [
      makeScene({
        id: "a",
        number: 1,
        location: "STUDIO",
        pageStart: 1,
        pageEnd: 3,
      }),
      makeScene({
        id: "b",
        number: 2,
        location: "PARK",
        pageStart: 3,
        pageEnd: 5,
      }),
      makeScene({
        id: "c",
        number: 3,
        location: "STUDIO",
        pageStart: 5,
        pageEnd: 7,
      }),
    ];
    const strips = generateStrips(scenes);
    const studioStrips = strips.filter((s) => ["a", "c"].includes(s.sceneId));
    expect(studioStrips[0].dayIndex).toBe(studioStrips[1].dayIndex);
  });

  it("assigns red banner to special effect scenes", () => {
    const strips = generateStrips([makeScene({ hasSpecialEffect: true })]);
    expect(strips[0].bannerColor).toBe("red");
  });

  it("assigns yellow banner to EXT DAY scenes", () => {
    const strips = generateStrips([
      makeScene({ intExt: "EXT", timeOfDay: "DAY" }),
    ]);
    expect(strips[0].bannerColor).toBe("yellow");
  });

  it("assigns blue banner to NIGHT scenes", () => {
    const strips = generateStrips([makeScene({ timeOfDay: "NIGHT" })]);
    expect(strips[0].bannerColor).toBe("blue");
  });

  it("starts a new day when pages exceed target", () => {
    const scenes = Array.from({ length: 10 }, (_, i) =>
      makeScene({
        id: String(i),
        number: i + 1,
        location: "LOC",
        pageStart: i,
        pageEnd: i + 1,
      }),
    );
    const strips = generateStrips(scenes);
    const dayIndices = new Set(strips.map((s) => s.dayIndex));
    expect(dayIndices.size).toBeGreaterThan(1);
  });
});
