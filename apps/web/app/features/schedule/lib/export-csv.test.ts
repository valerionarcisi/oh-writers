import { describe, it, expect } from "vitest";
import { scheduleToCsv } from "./export-csv";
import type { ShootingDayView } from "../server/schedule.server";

const dayWith = (strips: ShootingDayView["strips"]): ShootingDayView => ({
  id: "day-1",
  dayNumber: 1,
  date: "2026-03-02",
  dayType: "shoot",
  notes: null,
  crewCallTime: null,
  shootStartTime: null,
  wrapTime: null,
  strips,
  totalPageCount: strips.length,
  totalHours: strips.length,
});

const strip = {
  id: "strip-1",
  shootingDayId: "day-1",
  sceneId: "scene-1",
  position: 1,
  bannerColor: "white" as const,
  isLocked: false,
  estimatedHours: null,
  resolvedHours: 1,
  sceneNumber: 1,
  sceneHeading: "INT. LUOGO - GIORNO",
  location: "LUOGO",
  intExt: "INT",
  timeOfDay: "GIORNO",
  pageCount: 1,
  sceneEffort: 1,
};

describe("scheduleToCsv (Spec 89 — AI disclosure stamp)", () => {
  it("has no leading note row when aiDisclosureNote is omitted", () => {
    const csv = scheduleToCsv([dayWith([strip])]);
    expect(csv.split("\n")[0]).toBe(
      "Giorno,Data,Scena,Intestazione,INT/EST,Giorno/Notte,Location,Cast,Pagine,Note",
    );
  });

  it("prepends the note as its own row when provided", () => {
    const csv = scheduleToCsv(
      [dayWith([strip])],
      "Contiene giornate riorganizzate da Cesare (AI).",
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Contiene giornate riorganizzate da Cesare (AI).");
    expect(lines[1]).toBe(
      "Giorno,Data,Scena,Intestazione,INT/EST,Giorno/Notte,Location,Cast,Pagine,Note",
    );
  });
});
