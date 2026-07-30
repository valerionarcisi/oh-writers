import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CesareInputSchema, resolveTurnPlan } from "./cesare.server";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

const makeInput = (message: string) => ({
  projectId: VALID_UUID,
  message,
  pageContext: {
    page: "soggetto" as const,
    sceneId: null,
    sceneNumber: null,
  },
  conversationHistory: [],
});

describe("CesareInputSchema — message cap", () => {
  it("accepts a detailed multi-point instruction well past the old 2000-char cap", () => {
    const message = "Riscrivi la scena. ".repeat(300); // ~5,700 chars
    expect(CesareInputSchema.safeParse(makeInput(message)).success).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(CesareInputSchema.safeParse(makeInput("")).success).toBe(false);
  });

  it("rejects a message over 8000 chars", () => {
    const message = "a".repeat(8001);
    expect(CesareInputSchema.safeParse(makeInput(message)).success).toBe(false);
  });

  it("accepts a message at exactly 8000 chars", () => {
    const message = "a".repeat(8000);
    expect(CesareInputSchema.safeParse(makeInput(message)).success).toBe(true);
  });
});

// Cesare Task 3b + #118 — resolveTurnPlan is kicked off in parallel with
// context loading and now yields the WHOLE turn plan: the classifier's forced
// first tool AND the model tier derived from the classified intent's scale.
// One decision point, so the tier can never again be patched per-phrasing in
// a router regex. MOCK_AI=true short-circuits classifyIntent to a no-op, so
// these exercise the wiring/fallback paths without a real model call.
describe("resolveTurnPlan", () => {
  const prevMockAi = process.env["MOCK_AI"];
  beforeAll(() => {
    process.env["MOCK_AI"] = "true";
  });
  afterAll(() => {
    if (prevMockAi === undefined) delete process.env["MOCK_AI"];
    else process.env["MOCK_AI"] = prevMockAi;
  });

  it("a page with no classifier still yields a full plan from the structural rules", async () => {
    const result = await resolveTurnPlan("qualsiasi messaggio", "budget", 0);
    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.forcedFirstTool).toBeUndefined();
    expect(plan.tier).toBe("fast");
    expect(plan.model.length).toBeGreaterThan(0);
  });

  it("a classifier page resolves without throwing (MOCK_AI no-op → no forced tool)", async () => {
    const result = await resolveTurnPlan("scrivi la scena", "screenplay", 0);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().forcedFirstTool).toBeUndefined();
  });

  it("never rejects — an unknown page falls back to a structural plan", async () => {
    const result = await resolveTurnPlan("ciao", "not-a-real-page", 0);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().tier).toBe("fast");
  });

  it("still escalates structurally without a classifier: deep threads go quality", async () => {
    const result = await resolveTurnPlan("ok", "budget", 20);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().tier).toBe("quality");
  });
});
