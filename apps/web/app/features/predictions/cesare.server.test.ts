import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CesareInputSchema, resolveForcedFirstTool } from "./cesare.server";

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

// Cesare Task 3b — resolveForcedFirstTool is kicked off in parallel with
// context loading (extracted from callCesareV2's old inline classifier call).
// These lock its two branches: pages with no classifier configured resolve
// immediately to undefined; pages that do configure one still resolve
// (MOCK_AI=true short-circuits classifyIntent to a no-op, so this exercises
// the wiring/fallback path without a real Haiku call).
describe("resolveForcedFirstTool", () => {
  // classifyIntent short-circuits to a no-op under MOCK_AI=true (it would
  // otherwise consume a real Haiku call) — force it for this describe block
  // so the test never depends on the ambient environment.
  const prevMockAi = process.env["MOCK_AI"];
  beforeAll(() => {
    process.env["MOCK_AI"] = "true";
  });
  afterAll(() => {
    if (prevMockAi === undefined) delete process.env["MOCK_AI"];
    else process.env["MOCK_AI"] = prevMockAi;
  });

  it("resolves to undefined immediately for a page with no classifier configured", async () => {
    const result = await resolveForcedFirstTool(
      "qualsiasi messaggio",
      "budget",
    );
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it("resolves without throwing for a page that DOES configure a classifier (MOCK_AI short-circuits to no-op)", async () => {
    const result = await resolveForcedFirstTool(
      "scrivi la scena",
      "screenplay",
    );
    expect(result.isOk()).toBe(true);
    // MOCK_AI=true makes classifyIntent return NO_OP_INTENT — no forced tool.
    expect(result._unsafeUnwrap()).toBeUndefined();
  });

  it("never rejects — an unknown page also falls back to undefined", async () => {
    const result = await resolveForcedFirstTool("ciao", "not-a-real-page");
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeUndefined();
  });
});
