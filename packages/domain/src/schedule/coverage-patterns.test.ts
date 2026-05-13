import { describe, it, expect } from "vitest";
import { COVERAGE_PATTERNS, PATTERN_IDS } from "./coverage-patterns";

describe("COVERAGE_PATTERNS", () => {
  it("defines a pattern for every PATTERN_IDS entry", () => {
    for (const id of PATTERN_IDS) {
      expect(COVERAGE_PATTERNS[id]).toBeDefined();
      expect(COVERAGE_PATTERNS[id].id).toBe(id);
    }
  });

  it.each(PATTERN_IDS)("pattern %s has at least one shot", (id) => {
    expect(COVERAGE_PATTERNS[id].shots.length).toBeGreaterThan(0);
  });

  it.each(PATTERN_IDS)("pattern %s has a non-empty label and description", (id) => {
    expect(COVERAGE_PATTERNS[id].label.length).toBeGreaterThan(0);
    expect(COVERAGE_PATTERNS[id].description.length).toBeGreaterThan(0);
  });

  it.each(PATTERN_IDS)("pattern %s has positive estimatedMinutesHint", (id) => {
    expect(COVERAGE_PATTERNS[id].estimatedMinutesHint).toBeGreaterThan(0);
  });

  it("shot_reverse_shot uses OTS as primary shots", () => {
    const ots = COVERAGE_PATTERNS.shot_reverse_shot.shots.filter(
      (s) => s.shotSize === "OTS",
    );
    expect(ots.length).toBe(2);
  });

  it("action_handheld uses HANDHELD movement on most shots", () => {
    const handheld = COVERAGE_PATTERNS.action_handheld.shots.filter(
      (s) => s.cameraMovement === "HANDHELD",
    );
    expect(handheld.length).toBeGreaterThanOrEqual(4);
  });
});
