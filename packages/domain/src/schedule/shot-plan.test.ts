import { describe, it, expect } from "vitest";
import {
  resolveShotMinutes,
  inferTransitions,
  computeScenarioTotal,
} from "./shot-plan.js";
import { DEFAULT_SHOT_EFFORT_WEIGHTS } from "./effort-weights.js";
import type { ShotSize, CameraMovement } from "./effort-weights.js";
import type {
  ShotForTransition,
  ShotInput,
  TransitionInput,
} from "./shot-plan.js";

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

describe("inferTransitions", () => {
  const w = DEFAULT_SHOT_EFFORT_WEIGHTS;

  const shot = (
    id: string,
    shotSize: ShotSize,
    cameraMovement: CameraMovement,
  ): ShotForTransition => ({ id, shotSize, cameraMovement });

  it("returns empty array when shots are the same setup", () => {
    const result = inferTransitions(
      shot("a", "MS", "STATIC"),
      shot("b", "MS", "STATIC"),
      [],
      w,
    );
    expect(result).toHaveLength(0);
  });

  it("fires rig_change when going DOLLY → HANDHELD", () => {
    const result = inferTransitions(
      shot("a", "WS", "DOLLY"),
      shot("b", "MS", "HANDHELD"),
      [],
      w,
    );
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe("rig_change");
    expect(result[0].estimatedMinutes).toBe(20);
    expect(result[0].type).toBe("SETUP_CHANGE");
  });

  it("fires rig_change when going HANDHELD → CRANE", () => {
    const result = inferTransitions(
      shot("a", "MS", "HANDHELD"),
      shot("b", "WS", "CRANE"),
      [],
      w,
    );
    expect(result[0].ruleId).toBe("rig_change");
  });

  it("does NOT fire rig_change for STATIC → DOLLY (not heavy↔light switch)", () => {
    const result = inferTransitions(
      shot("a", "WS", "STATIC"),
      shot("b", "WS", "DOLLY"),
      [],
      w,
    );
    expect(result.every((t) => t.ruleId !== "rig_change")).toBe(true);
  });

  it("fires shot_size_jump for WS → CU (distance 3)", () => {
    const result = inferTransitions(
      shot("a", "WS", "STATIC"),
      shot("b", "CU", "STATIC"),
      [],
      w,
    );
    const jump = result.find((t) => t.ruleId === "shot_size_jump");
    expect(jump).toBeDefined();
    expect(jump!.estimatedMinutes).toBe(15);
  });

  it("does NOT fire shot_size_jump for WS → MS (distance 1)", () => {
    const result = inferTransitions(
      shot("a", "WS", "STATIC"),
      shot("b", "MS", "STATIC"),
      [],
      w,
    );
    expect(result.every((t) => t.ruleId !== "shot_size_jump")).toBe(true);
  });

  it("does NOT fire shot_size_jump for MS → MCU (distance 1)", () => {
    const result = inferTransitions(
      shot("a", "MS", "STATIC"),
      shot("b", "MCU", "STATIC"),
      [],
      w,
    );
    expect(result.every((t) => t.ruleId !== "shot_size_jump")).toBe(true);
  });

  it("fires makeup when breakdown includes 'makeup'", () => {
    const result = inferTransitions(
      shot("a", "MS", "STATIC"),
      shot("b", "MS", "STATIC"),
      ["makeup"],
      w,
    );
    const mk = result.find((t) => t.ruleId === "makeup");
    expect(mk).toBeDefined();
    expect(mk!.estimatedMinutes).toBe(30);
  });

  it("fires costume when breakdown includes 'costume'", () => {
    const result = inferTransitions(
      shot("a", "MS", "STATIC"),
      shot("b", "MS", "STATIC"),
      ["costume"],
      w,
    );
    const co = result.find((t) => t.ruleId === "costume");
    expect(co).toBeDefined();
    expect(co!.estimatedMinutes).toBe(20);
  });

  it("can fire multiple rules for the same shot pair", () => {
    const result = inferTransitions(
      shot("a", "WS", "DOLLY"),
      shot("b", "ECU", "HANDHELD"),
      ["makeup", "costume"],
      w,
    );
    const ruleIds = result.map((t) => t.ruleId);
    expect(ruleIds).toContain("rig_change");
    expect(ruleIds).toContain("shot_size_jump");
    expect(ruleIds).toContain("makeup");
    expect(ruleIds).toContain("costume");
  });

  it("does not fire shot_size_jump for INSERT or OTS (not in SHOT_SIZE_ORDER)", () => {
    const result = inferTransitions(
      shot("a", "INSERT", "STATIC"),
      shot("b", "ECU", "STATIC"),
      [],
      w,
    );
    expect(result.every((t) => t.ruleId !== "shot_size_jump")).toBe(true);
  });
});

describe("computeScenarioTotal", () => {
  const w = DEFAULT_SHOT_EFFORT_WEIGHTS;

  it("returns 0 for empty shots and transitions", () => {
    expect(computeScenarioTotal([], [], w)).toBe(0);
  });

  it("sums auto-resolved shot minutes", () => {
    const shots: ShotInput[] = [
      { shotSize: "WS", cameraMovement: "STATIC", estimatedMinutes: null }, // 45
      { shotSize: "MS", cameraMovement: "STATIC", estimatedMinutes: null }, // 25
    ];
    expect(computeScenarioTotal(shots, [], w)).toBe(70);
  });

  it("uses manual override when set", () => {
    const shots: ShotInput[] = [
      { shotSize: "WS", cameraMovement: "STATIC", estimatedMinutes: 99 },
    ];
    expect(computeScenarioTotal(shots, [], w)).toBe(99);
  });

  it("adds transition minutes", () => {
    const shots: ShotInput[] = [
      { shotSize: "MS", cameraMovement: "STATIC", estimatedMinutes: null }, // 25
    ];
    const transitions: TransitionInput[] = [
      { estimatedMinutes: 20, ruleId: "rig_change" },
    ];
    expect(computeScenarioTotal(shots, transitions, w)).toBe(45);
  });

  it("treats null transition estimatedMinutes as 0", () => {
    const shots: ShotInput[] = [
      { shotSize: "MS", cameraMovement: "STATIC", estimatedMinutes: null }, // 25
    ];
    const transitions: TransitionInput[] = [
      { estimatedMinutes: null, ruleId: "rig_change" },
    ];
    expect(computeScenarioTotal(shots, transitions, w)).toBe(25);
  });

  it("sums multiple shots and multiple transitions", () => {
    const shots: ShotInput[] = [
      { shotSize: "WS", cameraMovement: "DOLLY", estimatedMinutes: null }, // 90
      { shotSize: "CU", cameraMovement: "STATIC", estimatedMinutes: null }, // 20
      { shotSize: "MS", cameraMovement: "HANDHELD", estimatedMinutes: null }, // 15 (HANDHELD_ANY)
    ];
    const transitions: TransitionInput[] = [
      { estimatedMinutes: 20, ruleId: "rig_change" },
      { estimatedMinutes: 15, ruleId: "shot_size_jump" },
    ];
    expect(computeScenarioTotal(shots, transitions, w)).toBe(160);
  });
});
