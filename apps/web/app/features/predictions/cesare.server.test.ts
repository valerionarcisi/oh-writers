import { describe, it, expect } from "vitest";
import { CesareInputSchema } from "./cesare.server";

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
