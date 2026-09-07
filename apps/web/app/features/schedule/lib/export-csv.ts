import type { ShootingDayView } from "../server/schedule.server";
import { toCsv } from "@oh-writers/utils";

export interface ScheduleCsvRow {
  day: number;
  date: string;
  sceneNumber: number;
  heading: string;
  intExt: string;
  dayNight: string;
  location: string;
  cast: string;
  pages: number;
  notes: string;
}

export const buildScheduleCsvRows = (
  days: ShootingDayView[],
): ScheduleCsvRow[] =>
  days.flatMap((day) =>
    day.strips.map((strip) => ({
      day: day.dayNumber,
      date: day.date ?? "",
      sceneNumber: strip.sceneNumber,
      heading: strip.sceneHeading,
      intExt: strip.intExt,
      dayNight: strip.timeOfDay ?? "",
      location: strip.location,
      // Cast is not stored on the strip — breakdown owns that data.
      // We leave the field empty so importers can fill it from a breakdown export.
      cast: "",
      pages: strip.pageCount,
      notes: "",
    })),
  );

export const scheduleToCsv = (
  days: ShootingDayView[],
  aiDisclosureNote?: string,
): string => {
  const header = [
    "Giorno",
    "Data",
    "Scena",
    "Intestazione",
    "INT/EST",
    "Giorno/Notte",
    "Location",
    "Cast",
    "Pagine",
    "Note",
  ];

  const rows = buildScheduleCsvRows(days).map((r) => [
    String(r.day),
    r.date,
    String(r.sceneNumber),
    r.heading,
    r.intExt,
    r.dayNight,
    r.location,
    r.cast,
    String(r.pages),
    r.notes,
  ]);

  const csv = toCsv(header, rows);
  // Spec 89 — AI disclosure stamp: a plain leading line, not a CSV row (it
  // has no columns to align with), so it's prepended outside toCsv.
  return aiDisclosureNote ? `${aiDisclosureNote}\n${csv}` : csv;
};
