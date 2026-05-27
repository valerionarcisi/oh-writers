import { describe, it, expect } from "vitest";
import { FilmBibleSchema } from "./schema.js";

const VALID_BIBLE = {
  settingSummary: "Piccolo ristorante nelle Marche, anni contemporanei.",
  genreAndTone: "Commedia nera, ritmo serrato.",
  centralConflict: "Dante deve ospitare una serata comica che non fa ridere.",
  productionConstraints: ["Quasi tutto in interni", "Fuoco vivo in cucina"],
  recurringLocations: [
    {
      canonicalName: "Ristorante da Dante",
      aliases: ["Bancone", "Sala", "Cucina"],
      locationType: "ristorante",
      sceneCount: 12,
      settingPrior: "small provincial restaurant, Marche region",
    },
  ],
  keyCharacters: [
    { name: "DANTE", role: "Protagonist", arc: "Impara a ridere" },
    { name: "TEA", role: "Support", arc: null },
  ],
  sourceDocumentSnapshot: "abc123",
};

describe("[OHW-038b] FilmBibleSchema", () => {
  it("parses a valid bible and applies schemaVersion default", () => {
    const result = FilmBibleSchema.safeParse(VALID_BIBLE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe("1");
    }
  });

  it("accepts an explicit schemaVersion of '1'", () => {
    const result = FilmBibleSchema.safeParse({
      ...VALID_BIBLE,
      schemaVersion: "1",
    });
    expect(result.success).toBe(true);
  });

  it("parses recurringLocations aliases array", () => {
    const result = FilmBibleSchema.safeParse(VALID_BIBLE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurringLocations[0]?.aliases).toEqual([
        "Bancone",
        "Sala",
        "Cucina",
      ]);
    }
  });

  it("allows empty arrays for optional collections", () => {
    const result = FilmBibleSchema.safeParse({
      ...VALID_BIBLE,
      productionConstraints: [],
      recurringLocations: [],
      keyCharacters: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects keyCharacters exceeding 30 entries", () => {
    const result = FilmBibleSchema.safeParse({
      ...VALID_BIBLE,
      keyCharacters: Array.from({ length: 31 }, (_, i) => ({
        name: `CHAR_${i}`,
        role: "extra",
        arc: null,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("round-trips through JSON serialisation", () => {
    const parsed = FilmBibleSchema.parse(VALID_BIBLE);
    const serialised = JSON.parse(JSON.stringify(parsed));
    const reparsed = FilmBibleSchema.safeParse(serialised);
    expect(reparsed.success).toBe(true);
  });
});
