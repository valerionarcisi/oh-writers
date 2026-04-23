import { describe, it, expect } from "vitest";
import { listScenesInFountain } from "./list-scenes.js";

describe("listScenesInFountain", () => {
  it("returns empty array for empty input", () => {
    expect(listScenesInFountain("")).toEqual([]);
  });

  it("detects standard slugline prefixes", () => {
    const fountain = `INT. APPARTAMENTO - NOTTE\n\nUna scena.\n\nEXT. STRADA - GIORNO\n\nAltra.\n`;
    const scenes = listScenesInFountain(fountain);
    expect(scenes.map((s) => s.heading)).toEqual([
      "INT. APPARTAMENTO - NOTTE",
      "EXT. STRADA - GIORNO",
    ]);
    expect(scenes.map((s) => s.number)).toEqual(["1", "2"]);
  });

  it("recognizes EST., I/E. and INT/EXT", () => {
    const fountain = `EST. PRATO - ALBA\n\nNuvole.\n\nI/E. AUTO - GIORNO\n\nAlpha.\n\nINT/EXT. CASA - SERA\n\nBeta.\n`;
    const scenes = listScenesInFountain(fountain);
    expect(scenes).toHaveLength(3);
  });

  it("recognizes forced headings starting with '.'", () => {
    const fountain = `.LA STANZA SEGRETA\n\nQualcuno entra.\n`;
    const scenes = listScenesInFountain(fountain);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]?.heading).toBe("LA STANZA SEGRETA");
  });

  it("does not treat '..' (transition forced) as a heading", () => {
    const fountain = `..PROBABLY NOT A SCENE\n\nNope.\n`;
    expect(listScenesInFountain(fountain)).toEqual([]);
  });

  it("extracts explicit scene number from #N# suffix", () => {
    const fountain = `INT. UFFICIO - GIORNO #1A#\n\nDialogo.\n\nEXT. PARCO - SERA #2#\n\nAltro.\n`;
    const scenes = listScenesInFountain(fountain);
    expect(scenes.map((s) => s.number)).toEqual(["1A", "2"]);
    expect(scenes.map((s) => s.heading)).toEqual([
      "INT. UFFICIO - GIORNO",
      "EXT. PARCO - SERA",
    ]);
  });

  it("falls back to ordinal when no explicit number present", () => {
    const fountain = `INT. UNO\n\nx\n\nEXT. DUE\n\ny\n`;
    expect(listScenesInFountain(fountain).map((s) => s.number)).toEqual([
      "1",
      "2",
    ]);
  });

  it("preserves document order via index and lineIndex", () => {
    const fountain = `Title: x\n\nINT. UNO\n\na\n\nEXT. DUE\n\nb\n`;
    const scenes = listScenesInFountain(fountain);
    expect(scenes[0]?.index).toBe(1);
    expect(scenes[1]?.index).toBe(2);
    expect(scenes[1]?.lineIndex).toBeGreaterThan(scenes[0]!.lineIndex);
  });

  it("ignores 'INT.' inside a line (not at start)", () => {
    const fountain = `Una conferenza INT. di routine.\n`;
    expect(listScenesInFountain(fountain)).toEqual([]);
  });
});
