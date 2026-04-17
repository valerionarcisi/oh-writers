import { describe, it, expect } from "vitest";
import { buildSideBySideDiff } from "./diff.js";

describe("buildSideBySideDiff", () => {
  it("returns empty for two empty strings", () => {
    expect(buildSideBySideDiff("", "")).toEqual([]);
  });

  it("marks identical content as equal", () => {
    const rows = buildSideBySideDiff("a\nb\nc", "a\nb\nc");
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === "equal")).toBe(true);
  });

  it("emits added rows when right has extra lines", () => {
    const rows = buildSideBySideDiff("a\n", "a\nb\n");
    expect(rows.map((r) => r.kind)).toEqual(["equal", "added"]);
    expect(rows[1]!.left).toBeNull();
    expect(rows[1]!.right?.[0]!.text).toBe("b");
  });

  it("emits removed rows when left has extra lines", () => {
    const rows = buildSideBySideDiff("a\nb\n", "a\n");
    expect(rows.map((r) => r.kind)).toEqual(["equal", "removed"]);
    expect(rows[1]!.right).toBeNull();
    expect(rows[1]!.left?.[0]!.text).toBe("b");
  });

  it("pairs a remove+add as a changed row with intra-line segments", () => {
    const rows = buildSideBySideDiff("The cat sat", "The dog sat");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("changed");
    const leftChanged = rows[0]!.left!.filter((s) => s.changed);
    const rightChanged = rows[0]!.right!.filter((s) => s.changed);
    expect(leftChanged.map((s) => s.text.trim())).toEqual(["cat"]);
    expect(rightChanged.map((s) => s.text.trim())).toEqual(["dog"]);
  });

  it("handles mixed equal + changed + added", () => {
    const rows = buildSideBySideDiff("line1\nold\n", "line1\nnew\nextra\n");
    expect(rows.map((r) => r.kind)).toEqual(["equal", "changed", "added"]);
  });

  it("empty left yields all added rows", () => {
    const rows = buildSideBySideDiff("", "a\nb");
    expect(rows.map((r) => r.kind)).toEqual(["added", "added"]);
    expect(rows.every((r) => r.left === null)).toBe(true);
  });

  it("empty right yields all removed rows", () => {
    const rows = buildSideBySideDiff("a\nb", "");
    expect(rows.map((r) => r.kind)).toEqual(["removed", "removed"]);
    expect(rows.every((r) => r.right === null)).toBe(true);
  });
});
