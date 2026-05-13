import { describe, it, expect } from "vitest";
import { recommendPattern } from "./recommend-pattern";

const baseScene = { pageStart: 1, pageEnd: 2, hasSpecialEffect: false };

describe("recommendPattern", () => {
  it("returns action_handheld when hasSpecialEffect even without breakdown", () => {
    expect(recommendPattern(null, { ...baseScene, hasSpecialEffect: true })).toBe(
      "action_handheld",
    );
  });

  it("returns action_handheld when breakdown actionNoteCount > 0", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO"], actionNoteCount: 3 },
        baseScene,
      ),
    ).toBe("action_handheld");
  });

  it("returns master_plus_mids as safe fallback when no breakdown", () => {
    expect(recommendPattern(null, baseScene)).toBe("master_plus_mids");
  });

  it("returns master_only for very short scenes (< 1 page)", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 1 },
      ),
    ).toBe("master_only");
  });

  it("returns master_plus_mids for 1 speaking character monologue", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("master_plus_mids");
  });

  it("returns shot_reverse_shot for 2 speaking characters", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO", "GIULIA"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("shot_reverse_shot");
  });

  it("returns three_way_dialogue for 3 speaking characters", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO", "GIULIA", "LUCA"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("three_way_dialogue");
  });

  it("returns three_way_dialogue for 5+ speaking characters", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["A", "B", "C", "D", "E"], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("three_way_dialogue");
  });

  it("returns coverage_standard when no speaking characters at all", () => {
    expect(
      recommendPattern(
        { castWithDialogue: [], actionNoteCount: 0 },
        { ...baseScene, pageStart: 1, pageEnd: 3 },
      ),
    ).toBe("coverage_standard");
  });

  it("handles missing pageStart/pageEnd as default 1 page", () => {
    expect(
      recommendPattern(
        { castWithDialogue: ["MARCO", "GIULIA"], actionNoteCount: 0 },
        { ...baseScene, pageStart: null, pageEnd: null },
      ),
    ).toBe("shot_reverse_shot");
  });
});
