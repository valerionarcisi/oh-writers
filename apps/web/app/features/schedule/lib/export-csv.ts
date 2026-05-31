import type { ShootingDayView } from "../server/schedule.server";

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

const escapeCsv = (s: string): string =>
  /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

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

export const scheduleToCsv = (days: ShootingDayView[]): string => {
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
  ].join(",");

  const rows = buildScheduleCsvRows(days).map((r) =>
    [
      String(r.day),
      escapeCsv(r.date),
      String(r.sceneNumber),
      escapeCsv(r.heading),
      escapeCsv(r.intExt),
      escapeCsv(r.dayNight),
      escapeCsv(r.location),
      escapeCsv(r.cast),
      String(r.pages),
      escapeCsv(r.notes),
    ].join(","),
  );

  return [header, ...rows].join("\n");
};
