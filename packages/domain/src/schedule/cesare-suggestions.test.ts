import { describe, it, expect } from "vitest";
import {
  analyzeSchedule,
  type SuggestionDayInput,
  type SuggestionStripInput,
} from "./cesare-suggestions.js";

const strip = (
  partial: Partial<SuggestionStripInput> & { id: string; sceneNumber: number },
): SuggestionStripInput => ({
  location: null,
  resolvedHours: 2,
  timeOfDay: null,
  sceneHeading: null,
  ...partial,
});

const day = (
  partial: Partial<SuggestionDayInput> & { id: string; dayNumber: number },
): SuggestionDayInput => ({
  strips: [],
  ...partial,
});

describe("analyzeSchedule", () => {
  it("returns no suggestions for an empty schedule", () => {
    expect(analyzeSchedule({ shootingDays: [] })).toEqual([]);
  });

  it("suggests consolidating a sparse-location day onto the dense one", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: [
            strip({ id: "s1", sceneNumber: 1, location: "BAR" }),
            strip({ id: "s2", sceneNumber: 2, location: "BAR" }),
            strip({ id: "s3", sceneNumber: 3, location: "BAR" }),
          ],
        }),
        day({
          id: "d2",
          dayNumber: 3,
          strips: [strip({ id: "s4", sceneNumber: 14, location: "Bar" })],
        }),
      ],
    });

    const consolidate = result.filter(
      (s) => s.kind === "consolidate-location",
    );
    expect(consolidate).toHaveLength(1);
    expect(consolidate[0]!.payload.stripId).toBe("s4");
    expect(consolidate[0]!.payload.targetDayId).toBe("d1");
    expect(consolidate[0]!.message).toMatch(/SC 14/);
    expect(consolidate[0]!.message).toMatch(/giorno 01/);
  });

  it("does not suggest consolidating when a location only appears in one day", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: [strip({ id: "s1", sceneNumber: 1, location: "BAR" })],
        }),
      ],
    });
    expect(result.filter((s) => s.kind === "consolidate-location")).toEqual([]);
  });

  it("flags a day with total hours above the threshold", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 2,
          strips: [
            strip({ id: "s1", sceneNumber: 1, resolvedHours: 6 }),
            strip({ id: "s2", sceneNumber: 2, resolvedHours: 7 }),
          ],
        }),
        day({
          id: "d2",
          dayNumber: 3,
          strips: [strip({ id: "s3", sceneNumber: 3, resolvedHours: 2 })],
        }),
      ],
    });
    const heavy = result.filter((s) => s.kind === "heavy-day");
    expect(heavy).toHaveLength(1);
    expect(heavy[0]!.payload.sourceDayId).toBe("d1");
    expect(heavy[0]!.payload.targetDayId).toBe("d2");
    expect(heavy[0]!.payload.stripId).toBe("s2");
  });

  it("does not flag a day at 10h or below", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: [strip({ id: "s1", sceneNumber: 1, resolvedHours: 10 })],
        }),
      ],
    });
    expect(result.filter((s) => s.kind === "heavy-day")).toEqual([]);
  });

  it("suggests redistributing when an empty day sits next to a full one", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: Array.from({ length: 5 }, (_, i) =>
            strip({
              id: `a${i}`,
              sceneNumber: i + 1,
              resolvedHours: i === 0 ? 4 : 1,
            }),
          ),
        }),
        day({ id: "d2", dayNumber: 2, strips: [] }),
      ],
    });
    const empty = result.filter((s) => s.kind === "empty-day-redistribute");
    expect(empty).toHaveLength(1);
    expect(empty[0]!.payload.sourceDayId).toBe("d1");
    expect(empty[0]!.payload.targetDayId).toBe("d2");
    expect(empty[0]!.payload.stripId).toBe("a0");
  });

  it("does not suggest redistributing when neighbour day is not full", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: [strip({ id: "s1", sceneNumber: 1 })],
        }),
        day({ id: "d2", dayNumber: 2, strips: [] }),
      ],
    });
    expect(
      result.filter((s) => s.kind === "empty-day-redistribute"),
    ).toEqual([]);
  });

  it("flags magic-hour scenes detected from timeOfDay or heading", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: [
            strip({ id: "s1", sceneNumber: 19, timeOfDay: "MAGIC HOUR" }),
            strip({
              id: "s2",
              sceneNumber: 22,
              sceneHeading: "EXT. SPIAGGIA - TRAMONTO",
            }),
            strip({ id: "s3", sceneNumber: 23, timeOfDay: "DAY" }),
          ],
        }),
      ],
    });
    const mh = result.filter((s) => s.kind === "magic-hour");
    expect(mh.map((s) => s.payload.stripId).sort()).toEqual(["s1", "s2"]);
  });

  it("normalizes location case when grouping", () => {
    const result = analyzeSchedule({
      shootingDays: [
        day({
          id: "d1",
          dayNumber: 1,
          strips: [
            strip({ id: "s1", sceneNumber: 1, location: "bar" }),
            strip({ id: "s2", sceneNumber: 2, location: "Bar" }),
            strip({ id: "s3", sceneNumber: 3, location: "BAR" }),
          ],
        }),
        day({
          id: "d2",
          dayNumber: 2,
          strips: [strip({ id: "s4", sceneNumber: 14, location: "  bar  " })],
        }),
      ],
    });
    expect(
      result.filter((s) => s.kind === "consolidate-location"),
    ).toHaveLength(1);
  });
});
