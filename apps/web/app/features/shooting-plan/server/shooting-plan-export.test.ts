import { describe, it, expect } from "vitest";
import { shotListToCsv } from "../lib/shot-list-csv";
import type { ShotListCsvScene } from "../lib/shot-list-csv";

// ─── shotListToCsv ─────────────────────────────────────────────────────────────

describe("shotListToCsv", () => {
  const makeScene = (
    sceneNumber: number,
    heading: string,
    shots: ShotListCsvScene["shots"] = [],
  ): ShotListCsvScene => ({ sceneNumber, heading, shots });

  const makeShot = (
    position: number,
    overrides: Partial<ShotListCsvScene["shots"][0]> = {},
  ): ShotListCsvScene["shots"][0] => ({
    position,
    size: "WS",
    movement: "STATIC",
    camera: "A",
    notes: null,
    estimatedMinutes: null,
    ...overrides,
  });

  it("emits the standard CSV header", () => {
    const csv = shotListToCsv([]);
    expect(csv).toBe(
      "Scene,Heading,Shot #,Camera,Size,Movement,Est. Min,Notes",
    );
  });

  it("emits one row per shot", () => {
    const scenes = [
      makeScene(1, "INT. OFFICE - DAY", [makeShot(0), makeShot(1)]),
    ];
    const lines = shotListToCsv(scenes).split("\n");
    expect(lines).toHaveLength(3); // header + 2 shots
  });

  it("emits a placeholder row for scenes with no shots", () => {
    const scenes = [makeScene(2, "EXT. STREET - NIGHT")];
    const lines = shotListToCsv(scenes).split("\n");
    expect(lines).toHaveLength(2); // header + 1 empty row
    const row = lines[1]!;
    expect(row.startsWith("2,")).toBe(true);
    // shot#, camera, size, movement, min, notes all empty
    expect(row).toMatch(/^2,[^,]+,,,,,,$/);
  });

  it("includes shot metadata in the correct columns", () => {
    const scenes = [
      makeScene(3, "INT. CAFE - MORNING", [
        makeShot(0, {
          size: "CU",
          movement: "DOLLY",
          camera: "B",
          estimatedMinutes: 5,
          notes: "Close on espresso",
        }),
      ]),
    ];
    const lines = shotListToCsv(scenes).split("\n");
    const row = lines[1]!;
    // Scene,Heading,Shot#,Camera,Size,Movement,Min,Notes
    expect(row).toContain("3,");
    expect(row).toContain(",1,"); // shot# = position + 1
    expect(row).toContain(",B,");
    expect(row).toContain(",CU,");
    expect(row).toContain(",DOLLY,");
    expect(row).toContain(",5,");
    expect(row).toContain("Close on espresso");
  });

  it("escapes commas and quotes in text fields", () => {
    const scenes = [
      makeScene(4, 'INT. "MAIN" HALL, FLOOR 2 - DAY', [
        makeShot(0, { notes: 'Actor says "hello, world"' }),
      ]),
    ];
    const csv = shotListToCsv(scenes);
    // Heading with comma and quotes should be double-quoted
    expect(csv).toContain('"INT. ""MAIN"" HALL, FLOOR 2 - DAY"');
    // Notes with comma and quotes
    expect(csv).toContain('"Actor says ""hello, world"""');
  });

  it("emits empty string for null estimatedMinutes", () => {
    const scenes = [makeScene(5, "EXT. BEACH - DAY", [makeShot(0)])];
    const lines = shotListToCsv(scenes).split("\n");
    const row = lines[1]!;
    const cols = row.split(",");
    // column index 6 = Est. Min
    expect(cols[6]).toBe("");
  });

  it("handles multiple scenes in scene-number order", () => {
    const scenes = [
      makeScene(1, "INT. ROOM A - DAY", [makeShot(0)]),
      makeScene(2, "EXT. GARDEN - NIGHT", [makeShot(0), makeShot(1)]),
    ];
    const lines = shotListToCsv(scenes).split("\n");
    expect(lines).toHaveLength(4); // header + 1 + 2
    expect(lines[1]!.startsWith("1,")).toBe(true);
    expect(lines[2]!.startsWith("2,")).toBe(true);
    expect(lines[3]!.startsWith("2,")).toBe(true);
  });
});
