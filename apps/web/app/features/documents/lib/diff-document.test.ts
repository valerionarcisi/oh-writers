import { describe, it, expect } from "vitest";
import { diffDocumentLines } from "./diff-document";

describe("diffDocumentLines", () => {
  it("returns all-equal lines when the two texts match", () => {
    const lines = diffDocumentLines("alpha\nbeta", "alpha\nbeta");
    expect(lines).toEqual([
      { type: "equal", text: "alpha" },
      { type: "equal", text: "beta" },
    ]);
  });

  it("marks pure insertions as 'insert'", () => {
    const lines = diffDocumentLines("alpha", "alpha\nbeta");
    expect(lines).toEqual([
      { type: "equal", text: "alpha" },
      { type: "insert", text: "beta" },
    ]);
  });

  it("marks pure deletions as 'delete'", () => {
    const lines = diffDocumentLines("alpha\nbeta", "alpha");
    expect(lines).toEqual([
      { type: "equal", text: "alpha" },
      { type: "delete", text: "beta" },
    ]);
  });

  it("handles middle-line replacement", () => {
    const lines = diffDocumentLines("a\nb\nc", "a\nB\nc");
    const types = lines.map((l) => l.type);
    expect(types).toContain("delete");
    expect(types).toContain("insert");
    expect(lines.find((l) => l.type === "delete")?.text).toBe("b");
    expect(lines.find((l) => l.type === "insert")?.text).toBe("B");
  });

  it("returns nothing useful for two empty strings", () => {
    const lines = diffDocumentLines("", "");
    expect(lines).toEqual([{ type: "equal", text: "" }]);
  });
});
