import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { buildSchedulePdf } from "./export-pdf";
import type { ShootingDayView } from "../server/schedule.server";

/**
 * #67 — the export only checked whether a WHOLE day fit on the page, and a day
 * taller than one page can never satisfy that check. The inner loop then kept
 * writing rows past the page bottom.
 *
 * What actually happens is worse than losing rows: pdfkit auto-paginates when
 * text runs off the page, so a 120-scene day produced **523 pages** — one row
 * each, banner and column header gone, the strip board unreadable. Measured on
 * the pre-fix code; with per-row pagination the same day is 4 pages.
 *
 * The page count is therefore the assertion that bites. Scene presence is
 * checked too, since it is the property that actually matters to a production.
 */
const stripAt = (n: number) => ({
  id: `strip-${n}`,
  shootingDayId: "day-1",
  sceneId: `scene-${n}`,
  position: n,
  bannerColor: "white" as const,
  isLocked: false,
  estimatedHours: null,
  resolvedHours: 1,
  sceneNumber: n,
  sceneHeading: `INT. LUOGO ${n} - GIORNO`,
  location: `LUOGO ${n}`,
  intExt: "INT",
  timeOfDay: "GIORNO",
  pageCount: 1,
  sceneEffort: 1,
});

const dayWith = (sceneCount: number): ShootingDayView => ({
  id: "day-1",
  dayNumber: 1,
  date: "2026-03-02",
  dayType: "shoot",
  notes: null,
  crewCallTime: null,
  shootStartTime: null,
  wrapTime: null,
  strips: Array.from({ length: sceneCount }, (_, i) => stripAt(i + 1)),
  totalPageCount: sceneCount,
  totalHours: sceneCount,
});

/** pdfkit deflates its content streams and writes the drawn glyphs as hex
 *  strings, so reading the text back takes an inflate plus a hex decode.
 *  Returns everything actually PAINTED — a row written past the page bottom
 *  never appears here, which is exactly what this test is checking. */
const pdfText = (buf: Buffer): string => {
  const raw = buf.toString("latin1");
  let painted = "";
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    let inflated: string;
    try {
      inflated = inflateSync(
        Buffer.from(raw.slice(start, end), "latin1"),
      ).toString("latin1");
    } catch {
      continue; // fonts / metadata — not a content stream
    }
    for (const hex of inflated.matchAll(/<([0-9a-fA-F]+)>/g)) {
      painted += Buffer.from(hex[1]!, "hex").toString("latin1") + "\n";
    }
  }
  return painted;
};

const pageCount = (buf: Buffer): number =>
  (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("buildSchedulePdf pagination", () => {
  it("keeps every scene when a day overflows one page", async () => {
    // A landscape LETTER page holds roughly 40 rows; 120 forces two breaks.
    const sceneCount = 120;
    const buf = await buildSchedulePdf("Test", [dayWith(sceneCount)]);
    const text = pdfText(buf);

    const missing: number[] = [];
    for (let n = 1; n <= sceneCount; n++) {
      if (!text.includes(`LUOGO ${n}\n`)) missing.push(n);
    }
    expect(missing).toEqual([]);
  });

  it("paginates by row instead of letting pdfkit spill one row per page", async () => {
    const buf = await buildSchedulePdf("Test", [dayWith(120)]);
    // Pre-fix this was 523 pages — pdfkit auto-paginating every overflowing
    // row. A generous ceiling still fails loudly on that behaviour.
    expect(pageCount(buf)).toBeLessThan(12);
    // Each continuation page re-states which day it belongs to.
    expect(pdfText(buf)).toContain("SEGUE");
  });

  it("does not mark a day that fits on one page as continued", async () => {
    const buf = await buildSchedulePdf("Test", [dayWith(3)]);
    expect(pdfText(buf)).not.toContain("SEGUE");
  });
});
