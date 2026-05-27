import { describe, it, expect } from "vitest";
import { computeSummaryWindow } from "./local-context.server";
import type { LocalPageContext } from "./local-context.server";
import type { SceneMetaRow } from "@oh-writers/domain";

// [OHW-040a] — computeSummaryWindow pure function tests

const makeScenes = (count: number): SceneMetaRow[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `scene-${i + 1}`,
    number: i + 1,
    heading: `INT. LOCATION ${i + 1} - GIORNO`,
  }));

const ctx = (overrides: Partial<LocalPageContext> = {}): LocalPageContext => ({
  sceneId: null,
  sceneNumber: null,
  requirementId: null,
  documentId: null,
  shootingDayId: null,
  shootingDayNumber: null,
  ...overrides,
});

describe("computeSummaryWindow", () => {
  describe("budget page", () => {
    it("returns empty array — budget reasons at category level, not scenes", () => {
      const result = computeSummaryWindow("budget", ctx(), makeScenes(20), []);
      expect(result).toEqual([]);
    });
  });

  describe("current-only (shooting-plan)", () => {
    it("returns only the open scene id", () => {
      const result = computeSummaryWindow(
        "shooting-plan",
        ctx({ sceneId: "scene-5" }),
        makeScenes(20),
        [],
      );
      expect(result).toEqual(["scene-5"]);
    });

    it("returns empty array when no scene is open", () => {
      const result = computeSummaryWindow(
        "shooting-plan",
        ctx(),
        makeScenes(20),
        [],
      );
      expect(result).toEqual([]);
    });
  });

  describe("requirement-linked (locations)", () => {
    it("returns the linked scene ids", () => {
      const linked = ["scene-3", "scene-7", "scene-12"];
      const result = computeSummaryWindow(
        "locations",
        ctx(),
        makeScenes(20),
        linked,
      );
      expect(result).toEqual(linked);
    });

    it("returns empty array when no scenes are linked to requirement", () => {
      const result = computeSummaryWindow(
        "locations",
        ctx(),
        makeScenes(20),
        [],
      );
      expect(result).toEqual([]);
    });
  });

  describe("numeric-window-3 (breakdown)", () => {
    it("returns 7 scenes centered on scene number 10", () => {
      const result = computeSummaryWindow(
        "breakdown",
        ctx({ sceneNumber: 10 }),
        makeScenes(20),
        [],
      );
      expect(result).toEqual([
        "scene-7",
        "scene-8",
        "scene-9",
        "scene-10",
        "scene-11",
        "scene-12",
        "scene-13",
      ]);
    });

    it("clips correctly at the beginning of the screenplay", () => {
      const result = computeSummaryWindow(
        "breakdown",
        ctx({ sceneNumber: 2 }),
        makeScenes(20),
        [],
      );
      // min = 2-3 = -1, so all scenes with number >= -1 (all of them up to 5)
      const numbers = result.map((id) => parseInt(id.replace("scene-", "")));
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(5);
    });

    it("falls back to first scenes when no scene number provided", () => {
      const result = computeSummaryWindow(
        "breakdown",
        ctx(),
        makeScenes(20),
        [],
      );
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("numeric-window-5 (screenplay)", () => {
    it("returns 11 scenes centered on scene 10 for a 20-scene film", () => {
      const result = computeSummaryWindow(
        "screenplay",
        ctx({ sceneNumber: 10 }),
        makeScenes(20),
        [],
      );
      expect(result).toEqual([
        "scene-5",
        "scene-6",
        "scene-7",
        "scene-8",
        "scene-9",
        "scene-10",
        "scene-11",
        "scene-12",
        "scene-13",
        "scene-14",
        "scene-15",
      ]);
    });

    it("returns all scenes for short screenplay", () => {
      const result = computeSummaryWindow(
        "screenplay",
        ctx({ sceneNumber: 3 }),
        makeScenes(5),
        [],
      );
      expect(result.length).toBe(5);
    });
  });

  describe("act-aggregate (document pages)", () => {
    it("returns all scene ids for soggetto", () => {
      const scenes = makeScenes(30);
      const result = computeSummaryWindow("soggetto", ctx(), scenes, []);
      expect(result).toHaveLength(30);
      expect(result[0]).toBe("scene-1");
      expect(result[29]).toBe("scene-30");
    });

    it("returns all scene ids for synopsis", () => {
      const scenes = makeScenes(10);
      const result = computeSummaryWindow("synopsis", ctx(), scenes, []);
      expect(result).toHaveLength(10);
    });
  });

  describe("schedule page", () => {
    it("falls back to numeric window ±3 when no shootingDayId provided", () => {
      const result = computeSummaryWindow(
        "schedule",
        ctx({ sceneNumber: 5 }),
        makeScenes(20),
        [],
      );
      // Falls back to numeric window ±3
      const numbers = result.map((id) => parseInt(id.replace("scene-", "")));
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...numbers)).toBeLessThanOrEqual(8);
    });

    it("returns empty array when no shootingDayId and no scene number", () => {
      const result = computeSummaryWindow(
        "schedule",
        ctx(),
        makeScenes(20),
        [],
      );
      expect(result).toEqual([]);
    });

    it("returns empty array sentinel when shootingDayId present — caller uses loadStripSceneIds", () => {
      // When shootingDayId is present, computeSummaryWindow returns []
      // and the caller (buildLocalContext) handles the schedule case inline
      // using strip scene IDs + fallback for empty days.
      const result = computeSummaryWindow(
        "schedule",
        ctx({ shootingDayId: "day-uuid-123" }),
        makeScenes(20),
        [],
      );
      expect(result).toEqual([]);
    });
  });
});
