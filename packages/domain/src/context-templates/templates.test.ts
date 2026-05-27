import { describe, it, expect } from "vitest";
import { formatSceneSummary } from "./scene-summary.js";
import { formatGlobalContext, formatBibleForLocations } from "./film-bible.js";
import type { SceneSummary } from "../scene-summary/schema.js";
import type { FilmBible } from "../bible/schema.js";

const SCENE: SceneSummary = {
  sceneNumber: 3,
  heading: "INT. CUCINA - NOTTE",
  settingDescription: "Kitchen of a small provincial restaurant",
  timeOfDay: "NOTTE",
  presentCharacters: ["DANTE", "FILIPPO"],
  keyActions: ["Dante plates dishes", "Filippo defends his choice"],
  productionNotes: ["Open flame gas range"],
};

const BIBLE: FilmBible = {
  schemaVersion: "1",
  settingSummary: "Piccolo ristorante nelle Marche, anni contemporanei.",
  genreAndTone: "Commedia nera.",
  centralConflict: "Dante affronta una serata comica disastrosa.",
  productionConstraints: ["Quasi tutto in interni"],
  recurringLocations: [
    {
      canonicalName: "Ristorante da Dante",
      aliases: ["Bancone", "Sala", "Cucina"],
      locationType: "ristorante",
      sceneCount: 12,
      settingPrior: "small provincial restaurant, Marche region, Italy",
    },
  ],
  keyCharacters: [{ name: "DANTE", role: "Protagonist", arc: null }],
  sourceDocumentSnapshot: "testfp",
};

describe("[OHW-038d] context-templates", () => {
  describe("formatSceneSummary", () => {
    it("produces deterministic Markdown for the same input", () => {
      const a = formatSceneSummary(SCENE);
      const b = formatSceneSummary(SCENE);
      expect(a).toBe(b);
    });

    it("includes scene number and heading", () => {
      const md = formatSceneSummary(SCENE);
      expect(md).toContain("Scena 3");
      expect(md).toContain("INT. CUCINA - NOTTE");
    });

    it("includes characters and key actions", () => {
      const md = formatSceneSummary(SCENE);
      expect(md).toContain("DANTE");
      expect(md).toContain("FILIPPO");
      expect(md).toContain("Dante plates dishes");
    });

    it("omits the timeOfDay line when null", () => {
      const scene: SceneSummary = { ...SCENE, timeOfDay: null };
      const md = formatSceneSummary(scene);
      expect(md).not.toContain("Orario:");
    });
  });

  describe("formatGlobalContext", () => {
    it("produces deterministic output for the same bible", () => {
      const a = formatGlobalContext(BIBLE);
      const b = formatGlobalContext(BIBLE);
      expect(a).toBe(b);
    });

    it("starts with [FILM BIBLE] header", () => {
      const ctx = formatGlobalContext(BIBLE);
      expect(ctx.startsWith("[FILM BIBLE]")).toBe(true);
    });

    it("includes the setting summary", () => {
      const ctx = formatGlobalContext(BIBLE);
      expect(ctx).toContain("Piccolo ristorante nelle Marche");
    });

    it("includes recurring location with aliases", () => {
      const ctx = formatGlobalContext(BIBLE);
      expect(ctx).toContain("Ristorante da Dante");
      expect(ctx).toContain("Bancone");
      expect(ctx).toContain("Sala");
      expect(ctx).toContain("Cucina");
    });
  });

  describe("formatBibleForLocations", () => {
    it("contains the setting summary", () => {
      const prior = formatBibleForLocations(BIBLE);
      expect(prior).toContain("Piccolo ristorante nelle Marche");
    });

    it("includes location_bias instruction", () => {
      const prior = formatBibleForLocations(BIBLE);
      expect(prior).toContain("location_bias");
    });

    it("warns against Rome when film is not set there", () => {
      const prior = formatBibleForLocations(BIBLE);
      expect(prior).toContain("Roma");
    });

    it("includes settingPrior for each recurring location", () => {
      const prior = formatBibleForLocations(BIBLE);
      expect(prior).toContain("small provincial restaurant, Marche region");
    });
  });
});
