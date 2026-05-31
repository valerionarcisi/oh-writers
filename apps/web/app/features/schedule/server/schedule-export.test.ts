import { describe, it, expect } from "vitest";
import { buildScheduleCsvRows, scheduleToCsv } from "../lib/export-csv";
import type { ShootingDayView } from "./schedule.server";

const makeStrip = (
  overrides: Partial<ShootingDayView["strips"][number]> = {},
): ShootingDayView["strips"][number] => ({
  id: "strip-1",
  shootingDayId: "day-1",
  sceneId: "scene-1",
  position: 0,
  bannerColor: "blue",
  isLocked: false,
  estimatedHours: null,
  resolvedHours: 2,
  sceneNumber: 3,
  sceneHeading: "INT. LIVING ROOM - DAY",
  location: "Living Room",
  intExt: "INT",
  timeOfDay: "DAY",
  pageCount: 2,
  sceneEffort: 2,
  ...overrides,
});

const makeDay = (
  overrides: Partial<ShootingDayView> = {},
): ShootingDayView => ({
  id: "day-1",
  dayNumber: 1,
  date: "2024-07-01",
  dayType: "shoot",
  notes: null,
  crewCallTime: null,
  shootStartTime: null,
  wrapTime: null,
  strips: [makeStrip()],
  totalPageCount: 2,
  totalHours: 2,
  ...overrides,
});

describe("buildScheduleCsvRows", () => {
  it("returns one row per strip", () => {
    const day = makeDay({
      strips: [makeStrip({ sceneNumber: 1 }), makeStrip({ sceneNumber: 2 })],
    });
    const rows = buildScheduleCsvRows([day]);
    expect(rows).toHaveLength(2);
  });

  it("maps day fields onto each row", () => {
    const day = makeDay({ dayNumber: 3, date: "2024-07-05" });
    const [row] = buildScheduleCsvRows([day]);
    expect(row?.day).toBe(3);
    expect(row?.date).toBe("2024-07-05");
  });

  it("maps strip fields onto the row", () => {
    const strip = makeStrip({
      sceneNumber: 7,
      sceneHeading: "EXT. BEACH - SUNSET",
      intExt: "EXT",
      timeOfDay: "SUNSET",
      location: "Malibu Beach",
      pageCount: 3,
    });
    const [row] = buildScheduleCsvRows([makeDay({ strips: [strip] })]);
    expect(row?.sceneNumber).toBe(7);
    expect(row?.heading).toBe("EXT. BEACH - SUNSET");
    expect(row?.intExt).toBe("EXT");
    expect(row?.dayNight).toBe("SUNSET");
    expect(row?.location).toBe("Malibu Beach");
    expect(row?.pages).toBe(3);
  });

  it("returns empty array for days with no strips", () => {
    const day = makeDay({ strips: [] });
    expect(buildScheduleCsvRows([day])).toHaveLength(0);
  });

  it("uses empty string when date is null", () => {
    const day = makeDay({ date: null });
    const [row] = buildScheduleCsvRows([day]);
    expect(row?.date).toBe("");
  });

  it("uses empty string when timeOfDay is null", () => {
    const strip = makeStrip({ timeOfDay: null });
    const [row] = buildScheduleCsvRows([makeDay({ strips: [strip] })]);
    expect(row?.dayNight).toBe("");
  });

  it("flattens multiple days into one flat list of rows", () => {
    const days = [
      makeDay({ dayNumber: 1, strips: [makeStrip({ sceneNumber: 1 })] }),
      makeDay({
        id: "day-2",
        dayNumber: 2,
        strips: [makeStrip({ sceneNumber: 2 }), makeStrip({ sceneNumber: 3 })],
      }),
    ];
    expect(buildScheduleCsvRows(days)).toHaveLength(3);
  });
});

describe("scheduleToCsv", () => {
  it("starts with the correct header row", () => {
    const csv = scheduleToCsv([]);
    expect(
      csv.startsWith(
        "Giorno,Data,Scena,Intestazione,INT/EST,Giorno/Notte,Location,Cast,Pagine,Note",
      ),
    ).toBe(true);
  });

  it("produces one data row per strip", () => {
    const day = makeDay({ strips: [makeStrip(), makeStrip()] });
    const lines = scheduleToCsv([day]).split("\n");
    // header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it("escapes commas in heading by quoting the field", () => {
    const strip = makeStrip({ sceneHeading: "INT. BAKER, HOME - DAY" });
    const csv = scheduleToCsv([makeDay({ strips: [strip] })]);
    expect(csv).toContain('"INT. BAKER, HOME - DAY"');
  });

  it("escapes double-quotes in fields", () => {
    const strip = makeStrip({ location: 'The "Grand" Hotel' });
    const csv = scheduleToCsv([makeDay({ strips: [strip] })]);
    expect(csv).toContain('"The ""Grand"" Hotel"');
  });

  it("produces only a header for an empty schedule", () => {
    const csv = scheduleToCsv([]);
    expect(csv.split("\n")).toHaveLength(1);
  });
});
