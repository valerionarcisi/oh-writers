import { describe, it, expect } from "vitest";
import {
  DEFAULT_SHOT_EFFORT_WEIGHTS,
  shotWeightKey,
} from "./effort-weights.js";

describe("DEFAULT_SHOT_EFFORT_WEIGHTS", () => {
  it("has WS_STATIC = 45", () => {
    expect(DEFAULT_SHOT_EFFORT_WEIGHTS.WS_STATIC).toBe(45);
  });

  it("has HANDHELD_ANY = 15", () => {
    expect(DEFAULT_SHOT_EFFORT_WEIGHTS.HANDHELD_ANY).toBe(15);
  });

  it("has transition_makeup = 30", () => {
    expect(DEFAULT_SHOT_EFFORT_WEIGHTS.transition_makeup).toBe(30);
  });
});

describe("shotWeightKey", () => {
  it('returns "WS_DOLLY" for WS + DOLLY', () => {
    expect(shotWeightKey("WS", "DOLLY")).toBe("WS_DOLLY");
  });

  it('returns "HANDHELD_ANY" for MS + HANDHELD (movement override)', () => {
    expect(shotWeightKey("MS", "HANDHELD")).toBe("HANDHELD_ANY");
  });

  it('returns "STEADICAM_ANY" for CU + STEADICAM', () => {
    expect(shotWeightKey("CU", "STEADICAM")).toBe("STEADICAM_ANY");
  });

  it('returns "ECU_STATIC" for ECU + STATIC', () => {
    expect(shotWeightKey("ECU", "STATIC")).toBe("ECU_STATIC");
  });
});
