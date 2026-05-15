import { describe, it, expect } from "vitest";
import { computeDayKpis, formatDayHours } from "./day-kpis.js";

describe("computeDayKpis", () => {
  it("returns empty kpis for an empty day", () => {
    const k = computeDayKpis([]);
    expect(k.sceneCount).toBe(0);
    expect(k.totalPages).toBe(0);
    expect(k.totalHours).toBe(0);
    expect(k.locationCount).toBe(0);
    expect(k.castCount).toBe(0);
    expect(k.primaryLocation).toBe(null);
    expect(k.intExtMix).toBe("INT");
  });

  it("aggregates pages, hours, scene count", () => {
    const k = computeDayKpis([
      { pageCount: 2, resolvedHours: 3, location: "CASCINA", intExt: "INT" },
      { pageCount: 1, resolvedHours: 1.5, location: "CASCINA", intExt: "INT" },
      { pageCount: 3, resolvedHours: 4, location: "BOSCO", intExt: "EXT" },
    ]);
    expect(k.sceneCount).toBe(3);
    expect(k.totalPages).toBe(6);
    expect(k.totalHours).toBe(8.5);
    expect(k.locationCount).toBe(2);
    expect(k.primaryLocation).toBe("CASCINA");
    expect(k.intExtMix).toBe("MIX");
  });

  it("picks the most-frequent location as primary", () => {
    const k = computeDayKpis([
      { pageCount: 1, resolvedHours: 1, location: "Bar Centrale", intExt: "INT" },
      { pageCount: 1, resolvedHours: 1, location: "BAR CENTRALE", intExt: "INT" },
      { pageCount: 1, resolvedHours: 1, location: "Cascina", intExt: "INT" },
    ]);
    expect(k.primaryLocation).toBe("BAR CENTRALE");
    expect(k.locationCount).toBe(2);
  });

  it("ignores blank locations", () => {
    const k = computeDayKpis([
      { pageCount: 1, resolvedHours: 1, location: "", intExt: "INT" },
      { pageCount: 1, resolvedHours: 1, location: null, intExt: "INT" },
      { pageCount: 1, resolvedHours: 1, location: "Cucina", intExt: "INT" },
    ]);
    expect(k.locationCount).toBe(1);
    expect(k.primaryLocation).toBe("CUCINA");
  });

  it("counts unique cast across scenes", () => {
    const k = computeDayKpis([
      {
        pageCount: 1,
        resolvedHours: 1,
        location: "X",
        intExt: "INT",
        castIds: ["a", "b"],
      },
      {
        pageCount: 1,
        resolvedHours: 1,
        location: "X",
        intExt: "INT",
        castIds: ["b", "c"],
      },
    ]);
    expect(k.castCount).toBe(3);
  });

  it("returns EXT when only exteriors are present", () => {
    const k = computeDayKpis([
      { pageCount: 1, resolvedHours: 1, location: "Bosco", intExt: "EXT" },
      { pageCount: 1, resolvedHours: 1, location: "Bosco", intExt: "EXT" },
    ]);
    expect(k.intExtMix).toBe("EXT");
  });

  it("returns MIX when INT/EXT scenes are mixed", () => {
    const k = computeDayKpis([
      { pageCount: 1, resolvedHours: 1, location: "Bosco", intExt: "INT/EXT" },
    ]);
    expect(k.intExtMix).toBe("MIX");
  });
});

describe("formatDayHours", () => {
  it("formats whole hours without minutes", () => {
    expect(formatDayHours(8)).toBe("8h");
  });

  it("formats fractional hours as h + m", () => {
    expect(formatDayHours(9.5)).toBe("9h 30m");
    expect(formatDayHours(1.25)).toBe("1h 15m");
  });

  it("clamps zero and negative values", () => {
    expect(formatDayHours(0)).toBe("0h");
    expect(formatDayHours(-1)).toBe("0h");
  });
});
