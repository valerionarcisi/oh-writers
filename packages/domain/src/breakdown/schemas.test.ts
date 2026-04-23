import { describe, it, expect } from "vitest";
import {
  BreakdownElementSchema,
  CesareSuggestionSchema,
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
} from "./index.js";

describe("breakdown schemas", () => {
  it("has 15 categories (incl. atmosphere added in Spec 10e)", () => {
    expect(BREAKDOWN_CATEGORIES).toHaveLength(15);
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
      castTier: null,
      archivedAt: null,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("BreakdownElementSchema accepts a cast element with castTier", () => {
    const result = BreakdownElementSchema.safeParse({
      id: "00000000-0000-4000-a000-000000000001",
      projectId: "00000000-0000-4000-a000-000000000002",
      category: "cast",
      name: "Nonno",
      description: null,
      castTier: "principal",
      archivedAt: null,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("BreakdownElementSchema accepts null castTier", () => {
    const result = BreakdownElementSchema.safeParse({
      id: "00000000-0000-4000-a000-000000000001",
      projectId: "00000000-0000-4000-a000-000000000002",
      category: "props",
      name: "Knife",
      description: null,
      castTier: null,
      archivedAt: null,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("BreakdownElementSchema rejects invalid castTier", () => {
    const result = BreakdownElementSchema.safeParse({
      id: "00000000-0000-4000-a000-000000000001",
      projectId: "00000000-0000-4000-a000-000000000002",
      category: "cast",
      name: "Nonno",
      description: null,
      castTier: "lead",
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
