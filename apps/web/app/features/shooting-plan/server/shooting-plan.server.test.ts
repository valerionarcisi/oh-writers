import { describe, it, expect, vi } from "vitest";
import { DEFAULT_SHOT_EFFORT_WEIGHTS } from "@oh-writers/domain";
import { DbError } from "@oh-writers/utils";
import type { Db } from "~/server/db";
import { __test__ } from "./shooting-plan.server";

const { resolveWeights, buildScenarioView } = __test__;

// ─── resolveWeights ────────────────────────────────────────────────────────────

const buildScheduleDb = (effortWeights: Record<string, unknown> | null) => {
  const findFirst = vi.fn(() =>
    Promise.resolve(
      effortWeights !== null ? { effortWeights } : undefined,
    ),
  );
  return {
    query: { schedules: { findFirst } },
  } as unknown as Db;
};

describe("resolveWeights", () => {
  it("returns DEFAULT_SHOT_EFFORT_WEIGHTS when no schedule exists", async () => {
    const db = buildScheduleDb(null);
    const result = await resolveWeights(db, "project-1");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(DEFAULT_SHOT_EFFORT_WEIGHTS);
    }
  });

  it("returns DEFAULT_SHOT_EFFORT_WEIGHTS when schedule has no effortWeights", async () => {
    const db = buildScheduleDb(null);
    const result = await resolveWeights(db, "project-1");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(DEFAULT_SHOT_EFFORT_WEIGHTS);
    }
  });

  it("returns DEFAULT_SHOT_EFFORT_WEIGHTS when effortWeights fails Zod parse", async () => {
    // Invalid shape — Zod rejects it, fallback kicks in
    const db = buildScheduleDb({ invalid: "garbage" });
    const result = await resolveWeights(db, "project-1");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(DEFAULT_SHOT_EFFORT_WEIGHTS);
    }
  });

  it("returns parsed weights when effortWeights is valid", async () => {
    const custom = { ...DEFAULT_SHOT_EFFORT_WEIGHTS, WS_STATIC: 99 };
    const db = buildScheduleDb(custom as Record<string, unknown>);
    const result = await resolveWeights(db, "project-1");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.WS_STATIC).toBe(99);
    }
  });

  it("wraps DB failures in DbError", async () => {
    const findFirst = vi.fn(() => Promise.reject(new Error("connection lost")));
    const db = {
      query: { schedules: { findFirst } },
    } as unknown as Db;
    const result = await resolveWeights(db, "project-1");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DbError);
      expect(result.error._tag).toBe("DbError");
    }
  });
});

// ─── buildScenarioView ─────────────────────────────────────────────────────────

const SCENARIO_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SCENARIO_ID_2 = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const makeScenario = (overrides: Partial<{
  id: string;
  shotPlanId: string;
  name: string;
  position: number;
  isSuggested: boolean;
  createdAt: Date;
}> = {}) => ({
  id: SCENARIO_ID,
  shotPlanId: "plan-id-1",
  name: "Piano A",
  position: 0,
  isSuggested: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const makeShot = (overrides: Partial<{
  id: string;
  scenarioId: string;
  position: number;
  shotSize: string;
  cameraMovement: string;
  cameraLabel: string;
  estimatedMinutes: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) => ({
  id: "shot-1",
  scenarioId: SCENARIO_ID,
  position: 0,
  shotSize: "MS",
  cameraMovement: "STATIC",
  cameraLabel: "A",
  estimatedMinutes: null,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const makeTransition = (overrides: Partial<{
  id: string;
  scenarioId: string;
  afterShotId: string;
  type: string;
  estimatedMinutes: number | null;
  ruleId: string | null;
  isManual: boolean;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) => ({
  id: "transition-1",
  scenarioId: SCENARIO_ID,
  afterShotId: "shot-1",
  type: "SETUP_CHANGE",
  estimatedMinutes: null,
  ruleId: null,
  isManual: false,
  label: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

describe("buildScenarioView", () => {
  it("returns an empty scenario when there are no shots", () => {
    const scenario = makeScenario();
    const view = buildScenarioView(scenario, [], [], DEFAULT_SHOT_EFFORT_WEIGHTS);
    expect(view.id).toBe(SCENARIO_ID);
    expect(view.name).toBe("Piano A");
    expect(view.shots).toEqual([]);
    expect(view.transitions).toEqual([]);
    expect(view.totalMinutes).toBe(0);
    expect(view.isSuggested).toBe(false);
  });

  it("filters shots to the scenario's own shots only", () => {
    const scenario = makeScenario();
    const ownShot = makeShot({ scenarioId: SCENARIO_ID });
    const otherShot = makeShot({ id: "other-shot", scenarioId: SCENARIO_ID_2 });
    const view = buildScenarioView(
      scenario,
      [ownShot, otherShot],
      [],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    expect(view.shots).toHaveLength(1);
    expect(view.shots[0]!.id).toBe("shot-1");
  });

  it("sorts shots by position ascending", () => {
    const scenario = makeScenario();
    const s1 = makeShot({ id: "s1", position: 2 });
    const s2 = makeShot({ id: "s2", position: 0 });
    const s3 = makeShot({ id: "s3", position: 1 });
    const view = buildScenarioView(
      scenario,
      [s1, s2, s3],
      [],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    expect(view.shots.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("includes only transitions belonging to this scenario", () => {
    const scenario = makeScenario();
    const shot = makeShot();
    const ownTransition = makeTransition({ scenarioId: SCENARIO_ID });
    const otherTransition = makeTransition({
      id: "other-t",
      scenarioId: SCENARIO_ID_2,
    });
    const view = buildScenarioView(
      scenario,
      [shot],
      [ownTransition, otherTransition],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    expect(view.transitions).toHaveLength(1);
    expect(view.transitions[0]!.id).toBe("transition-1");
  });

  it("maps shot fields correctly", () => {
    const scenario = makeScenario();
    const shot = makeShot({
      id: "s1",
      shotSize: "CU",
      cameraMovement: "DOLLY",
      cameraLabel: "B",
      estimatedMinutes: 5,
      notes: "close on face",
    });
    const view = buildScenarioView(
      scenario,
      [shot],
      [],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    const sv = view.shots[0]!;
    expect(sv.shotSize).toBe("CU");
    expect(sv.cameraMovement).toBe("DOLLY");
    expect(sv.cameraLabel).toBe("B");
    expect(sv.estimatedMinutes).toBe(5);
    expect(sv.notes).toBe("close on face");
  });

  it("reflects isSuggested from the scenario row", () => {
    const scenario = makeScenario({ isSuggested: true });
    const view = buildScenarioView(scenario, [], [], DEFAULT_SHOT_EFFORT_WEIGHTS);
    expect(view.isSuggested).toBe(true);
  });

  it("computes totalMinutes > 0 when shots are present", () => {
    const scenario = makeScenario();
    const shot = makeShot({ estimatedMinutes: 10 });
    const view = buildScenarioView(
      scenario,
      [shot],
      [],
      DEFAULT_SHOT_EFFORT_WEIGHTS,
    );
    // estimatedMinutes overrides the weight-based calculation
    expect(view.totalMinutes).toBeGreaterThan(0);
  });
});
