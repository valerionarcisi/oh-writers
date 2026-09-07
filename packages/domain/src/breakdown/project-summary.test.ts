import { describe, it, expect } from "vitest";
import {
  computeSceneRange,
  findDuplicateElements,
  groupByCategory,
  summarizeProjectBreakdown,
  toBreakdownCsv,
  type ProjectBreakdownInputRow,
} from "./project-summary.js";

const row = (
  overrides: Partial<ProjectBreakdownInputRow>,
): ProjectBreakdownInputRow => ({
  elementId: overrides.elementId ?? "id-1",
  name: overrides.name ?? "John",
  category: overrides.category ?? "cast",
  description: overrides.description ?? null,
  castTier: overrides.castTier ?? null,
  totalQuantity: overrides.totalQuantity ?? 1,
  sceneNumbers: overrides.sceneNumbers ?? [1],
  status: overrides.status ?? "accepted",
  source: overrides.source ?? "cesare",
  everAiTouched: overrides.everAiTouched ?? false,
});

describe("computeSceneRange", () => {
  it("returns null for empty input", () => {
    expect(computeSceneRange([])).toBeNull();
  });
  it("returns first→last across unsorted scene numbers", () => {
    expect(computeSceneRange([5, 1, 3, 28, 12])).toEqual({
      first: 1,
      last: 28,
    });
  });
});

describe("summarizeProjectBreakdown", () => {
  it("aggregates totals by status and unique categories", () => {
    const summary = summarizeProjectBreakdown([
      row({ elementId: "a", status: "accepted", sceneNumbers: [1, 2] }),
      row({
        elementId: "b",
        category: "props",
        status: "pending",
        sceneNumbers: [3],
      }),
      row({
        elementId: "c",
        category: "props",
        status: "stale",
        sceneNumbers: [4, 9],
      }),
    ]);
    expect(summary.totalElements).toBe(3);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.staleCount).toBe(1);
    expect(summary.categoriesUsed).toBe(2);
    expect(summary.sceneRange).toEqual({ first: 1, last: 9 });
  });
  it("returns null scene range when no occurrences", () => {
    const summary = summarizeProjectBreakdown([
      row({ elementId: "a", sceneNumbers: [] }),
    ]);
    expect(summary.sceneRange).toBeNull();
  });
});

describe("groupByCategory", () => {
  it("sorts groups' rows alphabetically (it locale) and flags issues", () => {
    const groups = groupByCategory([
      row({ elementId: "a", name: "Zara", category: "cast" }),
      row({
        elementId: "b",
        name: "Anna",
        category: "cast",
        status: "pending",
      }),
      row({ elementId: "c", name: "Tavolo", category: "props" }),
    ]);
    const cast = groups.find((g) => g.category === "cast");
    expect(cast?.rows.map((r) => r.name)).toEqual(["Anna", "Zara"]);
    expect(cast?.pendingCount).toBe(1);
    expect(cast?.hasIssues).toBe(true);
    const props = groups.find((g) => g.category === "props");
    expect(props?.hasIssues).toBe(false);
  });
});

describe("findDuplicateElements", () => {
  it("detects case-only variants of the same name", () => {
    const dups = findDuplicateElements([
      row({ elementId: "a", name: "Tavolo", category: "props" }),
      row({ elementId: "b", name: "tavolo", category: "props" }),
      row({ elementId: "c", name: "TAVOLO", category: "props" }),
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0]?.elementIds).toEqual(["a", "b", "c"]);
    expect(dups[0]?.reason).toBe("case");
  });

  it("does not collapse across categories", () => {
    const dups = findDuplicateElements([
      row({ elementId: "a", name: "Tavolo", category: "props" }),
      row({ elementId: "b", name: "Tavolo", category: "set_dress" }),
    ]);
    expect(dups).toHaveLength(0);
  });

  it("flags Levenshtein-near names of similar length", () => {
    const dups = findDuplicateElements([
      row({ elementId: "a", name: "Microfono", category: "props" }),
      row({ elementId: "b", name: "Microfoni", category: "props" }),
    ]);
    expect(dups).toHaveLength(1);
    expect(["plural", "levenshtein", "case"]).toContain(dups[0]!.reason);
  });

  it("returns empty when nothing matches", () => {
    const dups = findDuplicateElements([
      row({ elementId: "a", name: "Tavolo", category: "props" }),
      row({ elementId: "b", name: "Sedia", category: "props" }),
    ]);
    expect(dups).toHaveLength(0);
  });
});

describe("toBreakdownCsv", () => {
  it("emits a header and one line per row, escaping commas", () => {
    const csv = toBreakdownCsv([
      row({ elementId: "a", name: "John, the comic", sceneNumbers: [1, 2] }),
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("id,categoria,nome");
    expect(lines[1]).toContain('"John, the comic"');
    expect(lines[1]).toContain("1 2");
  });

  it("has no leading note row when no row was ever AI-touched (Spec 89)", () => {
    const csv = toBreakdownCsv([row({ everAiTouched: false })]);
    expect(csv.split("\n")[0]).toContain("id,categoria,nome");
  });

  it("prepends the AI disclosure note when at least one row was ever AI-touched, even if the rest weren't", () => {
    const csv = toBreakdownCsv(
      [row({ everAiTouched: false }), row({ everAiTouched: true })],
      "Contiene elementi suggeriti da Cesare (AI)",
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Contiene elementi suggeriti da Cesare (AI)");
    expect(lines[1]).toContain("id,categoria,nome");
  });
});
