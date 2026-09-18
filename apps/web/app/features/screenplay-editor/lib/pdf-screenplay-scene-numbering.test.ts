import { describe, it, expect } from "vitest";
import { pdfText } from "../../../../../../tests/helpers/pdf";
import { buildScreenplayPdf } from "./pdf-screenplay.js";
import { buildExportPipeline } from "./export-pipeline.js";
import { normalizeFountainForExport } from "./normalize-fountain.js";

/**
 * Regression for the 3 stacked scene-1-numbering export bugs — full writeup
 * in normalize-fountain.ts's doc comment. This is the only test that runs
 * the exact pipeline screenplay-export.server.ts drives — normalize → build
 * invocation → real afterwriting render — against the actual rendered PDF
 * text, the same level BUG-N63/#184's tests already use for this renderer,
 * so it's the one place all 3 bugs (and the awc-runner.cjs liner.js patch
 * specifically) get an end-to-end check together.
 */
const RAW_FOUNTAIN = [
  "EXT/Int. QUARTIERE RESIDENZIALE, CASA - POMERIGGIO",
  "",
  "Case basse, cancelli chiusi, siepi immobili nel caldo.",
  "",
  "      ANNA",
  "      Flora, io e Teddy siamo sani e salvi. Passo.",
  "",
  "INT. SALOTTO/CAMERA CASA - POMERIGGIO",
  "",
  "Mia e' seduta sul pavimento del salotto.",
  "",
  "      MIA",
  "      Papa'!",
  "",
].join("\n");

describe("screenplay PDF export — scene 1 numbering", () => {
  it("numbers scene 1 the same as every other scene", async () => {
    const normalized = normalizeFountainForExport(RAW_FOUNTAIN);
    const pipeline = buildExportPipeline("standard", {
      fountain: normalized,
      includeCoverPage: false,
    });
    const buffer = await buildScreenplayPdf(pipeline.fountain, {
      invocation: pipeline.invocation,
    });
    const text = await pdfText(buffer);
    const lines = text.split("\n").map((l) => l.trim());
    const headingIndex = (needle: string) =>
      lines.findIndex((l) => l.includes(needle));

    // scenes_numbers=both prints the number on its own line immediately
    // before AND after the heading line (pdf.js text-extraction order, one
    // item per line) — demoted-to-action text carries no number at all, so
    // finding "1" right after each heading is the signal that BOTH scenes
    // were recognised and numbered, scene 1 included.
    const scene1 = headingIndex("QUARTIERE RESIDENZIALE");
    const scene2 = headingIndex("SALOTTO/CAMERA");
    expect(scene1).toBeGreaterThanOrEqual(0);
    expect(scene2).toBeGreaterThan(scene1);
    expect(lines[scene1 + 1]).toBe("1");
    expect(lines[scene2 + 1]).toBe("2");
  }, 30_000);

  // Isolates bug #3 from the doc comment above: even a perfectly clean,
  // already-canonical "INT."/"EXT." heading loses its number when it's the
  // document's first line — this has nothing to do with case or prefix
  // order, so it must be covered independent of the mixed-case repro.
  it("numbers a clean, canonical scene 1 heading too (afterwriting liner.js bug)", async () => {
    const cleanFountain = [
      "INT. KITCHEN - DAY",
      "",
      "Anna stares at the kettle.",
      "",
      "EXT. STREET - NIGHT",
      "",
      "Rain falls hard.",
    ].join("\n");
    const pipeline = buildExportPipeline("standard", {
      fountain: cleanFountain,
      includeCoverPage: false,
    });
    const buffer = await buildScreenplayPdf(pipeline.fountain, {
      invocation: pipeline.invocation,
    });
    const lines = (await pdfText(buffer)).split("\n").map((l) => l.trim());
    const scene1 = lines.findIndex((l) => l.includes("KITCHEN"));
    const scene2 = lines.findIndex((l) => l.includes("STREET"));
    expect(scene1).toBeGreaterThanOrEqual(0);
    expect(lines[scene1 + 1]).toBe("1");
    expect(lines[scene2 + 1]).toBe("2");
  }, 30_000);
});
