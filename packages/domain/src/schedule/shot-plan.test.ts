import { describe, it, expect } from "vitest";
import { resolveShotMinutes } from "./shot-plan.js";
import { DEFAULT_SHOT_EFFORT_WEIGHTS } from "./effort-weights.js";

describe("resolveShotMinutes", () => {
  const w = DEFAULT_SHOT_EFFORT_WEIGHTS;

  it("returns manual override when estimatedMinutes is set", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "STATIC", estimatedMinutes: 99 },
        w,
      ),
    ).toBe(99);
  });

  it("resolves WS_STATIC to 45 when auto", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "STATIC", estimatedMinutes: null },
        w,
      ),
    ).toBe(45);
  });

  it("resolves WS_DOLLY to 90 when auto", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "DOLLY", estimatedMinutes: null },
        w,
      ),
    ).toBe(90);
  });

  it("resolves HANDHELD to HANDHELD_ANY=15 regardless of shot size", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "ECU", cameraMovement: "HANDHELD", estimatedMinutes: null },
        w,
      ),
    ).toBe(15);
    expect(
      resolveShotMinutes(
        { shotSize: "WS", cameraMovement: "HANDHELD", estimatedMinutes: null },
        w,
      ),
    ).toBe(15);
  });

  it("resolves DRONE to DRONE_ANY=90 regardless of shot size", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "MS", cameraMovement: "DRONE", estimatedMinutes: null },
        w,
      ),
    ).toBe(90);
  });

  it("falls back to MS_STATIC=25 for unknown key (e.g. EWS_STATIC)", () => {
    expect(
      resolveShotMinutes(
        { shotSize: "EWS", cameraMovement: "STATIC", estimatedMinutes: null },
        w,
      ),
    ).toBe(25);
  });

  it("resolves INSERT_STATIC to 15", () => {
    expect(
      resolveShotMinutes(
        {
          shotSize: "INSERT",
          cameraMovement: "STATIC",
          estimatedMinutes: null,
        },
        w,
      ),
    ).toBe(15);
  });
});
