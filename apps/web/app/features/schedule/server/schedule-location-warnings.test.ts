import { describe, it, expect } from "vitest";
import {
  buildDayLocationWarnings,
  type DayLocationRow,
} from "./schedule.server";

const baseRow = (overrides: Partial<DayLocationRow> = {}): DayLocationRow => ({
  sceneId: "scene-1",
  sceneNumber: 3,
  sceneLocation: "Ristorante - Forno",
  requirementName: "Forno",
  requirementStatus: "pending",
  ...overrides,
});

describe("buildDayLocationWarnings", () => {
  it("returns only requirements whose status is not confirmed/locked", () => {
    const out = buildDayLocationWarnings([
      baseRow({ requirementStatus: "pending" }),
      baseRow({
        sceneId: "scene-2",
        sceneNumber: 4,
        requirementName: "Bancone",
        requirementStatus: "scouting",
      }),
      baseRow({
        sceneId: "scene-3",
        sceneNumber: 5,
        requirementName: "Sala",
        requirementStatus: "confirmed",
      }),
      baseRow({
        sceneId: "scene-4",
        sceneNumber: 6,
        requirementName: "Esterno",
        requirementStatus: "locked",
      }),
    ]);

    expect(out).toHaveLength(2);
    expect(out.map((w) => w.status)).toEqual(["pending", "scouting"]);
  });

  it("deduplicates by sceneId + requirementName", () => {
    const out = buildDayLocationWarnings([
      baseRow(),
      baseRow(), // duplicate
      baseRow({
        sceneId: "scene-2",
        sceneNumber: 4,
        requirementName: "Forno",
      }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("returns an empty array when all locations are confirmed", () => {
    const out = buildDayLocationWarnings([
      baseRow({ requirementStatus: "confirmed" }),
      baseRow({
        sceneId: "scene-2",
        sceneNumber: 4,
        requirementStatus: "locked",
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("preserves scene number and location label on each warning", () => {
    const out = buildDayLocationWarnings([
      baseRow({
        sceneNumber: 7,
        sceneLocation: "INT. STUDIO - NOTTE",
        requirementName: "Studio",
      }),
    ]);
    expect(out[0]).toEqual({
      sceneId: "scene-1",
      sceneNumber: 7,
      location: "INT. STUDIO - NOTTE",
      requirementName: "Studio",
      status: "pending",
    });
  });
});
