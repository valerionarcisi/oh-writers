import { describe, it, expect } from "vitest";
import { extractCast } from "./extract-cast.js";

describe("extractCast", () => {
  it("detects a single CHARACTER cue", () => {
    const body = `FILIPPO\nCiao a tutti.\n`;
    const items = extractCast(body);
    expect(items).toEqual([
      {
        category: "cast",
        name: "Filippo",
        quantity: 1,
        defaultStatus: "accepted",
        source: "regex",
      },
    ]);
  });

  it("counts multiple cues for the same character", () => {
    const body = `FILIPPO\nCiao.\n\nVECCHIA 1\nChi sei?\n\nFILIPPO\nNiente.\n\nFILIPPO\nDavvero.\n`;
    const items = extractCast(body);
    const filippo = items.find((i) => i.name === "Filippo");
    expect(filippo?.quantity).toBe(3);
  });

  it("strips parenthetical extensions like (V.O.)", () => {
    const body = `TEA (V.O.)\nFilì venni!\n`;
    const items = extractCast(body);
    expect(items.find((i) => i.name === "Tea")).toBeDefined();
  });

  it("handles trailing colon in character cue", () => {
    const body = `JOHN:\nUn saluto.\n`;
    const items = extractCast(body);
    expect(items.find((i) => i.name === "John")).toBeDefined();
  });

  it("ignores slugline lines", () => {
    const body = `INT. CUCINA - NOTTE\n\nFILIPPO\nCiao.\n`;
    const items = extractCast(body);
    expect(items.map((i) => i.name)).toEqual(["Filippo"]);
  });

  it("ignores ALL-CAPS lines that have no following dialogue", () => {
    const body = `OPEN GREZZO - UN OPEN MIC PROVINCIALE\n\n\n`;
    const items = extractCast(body);
    expect(items).toEqual([]);
  });

  it("returns empty for empty body", () => {
    expect(extractCast("")).toEqual([]);
  });

  it("does not treat a numeric-only line as a character", () => {
    const body = `42.\n\nQualcosa.\n`;
    expect(extractCast(body)).toEqual([]);
  });

  it("supports characters with numeric suffixes (VECCHIA 1)", () => {
    const body = `VECCHIA 1\nMa tu non sei Filippo?\n`;
    const items = extractCast(body);
    expect(items.find((i) => i.name === "Vecchia 1")).toBeDefined();
  });

  it("does not treat ALL-CAPS lines mid-action paragraph as characters", () => {
    // "BANG! POI SILENZIO." is shouted action, not a cue:
    // it sits inside an action paragraph (no preceding blank line).
    const body = `Lui spara.\nBANG! POI SILENZIO.\nLei resta ferma.\n\nFILIPPO\nCosa hai fatto?\n`;
    const items = extractCast(body);
    expect(items.map((i) => i.name)).toEqual(["Filippo"]);
  });
});
