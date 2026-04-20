import { describe, it, expect } from "vitest";
import {
  BreakdownElementSchema,
  CesareSuggestionSchema,
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
} from "./index.js";

describe("breakdown schemas", () => {
  it("has 14 categories", () => {
    expect(BREAKDOWN_CATEGORIES).toHaveLength(14);
  });

  it("CATEGORY_META has entry for each category", () => {
    for (const c of BREAKDOWN_CATEGORIES) {
      expect(CATEGORY_META[c]).toBeDefined();
      expect(CATEGORY_META[c].colorToken).toMatch(/^--cat-/);
    }
  });

  it("rejects element with empty name", () => {
    const result = BreakdownElementSchema.safeParse({
      id: "00000000-0000-4000-a000-000000000001",
      projectId: "00000000-0000-4000-a000-000000000002",
      category: "props",
      name: "",
      description: null,
      archivedAt: null,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("CesareSuggestionSchema accepts minimal valid", () => {
    const r = CesareSuggestionSchema.safeParse({
      category: "props",
      name: "Knife",
      quantity: 1,
      description: null,
      rationale: null,
    });
    expect(r.success).toBe(true);
  });
});
