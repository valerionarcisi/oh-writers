import { describe, it, expect } from "vitest";
import {
  buildSideBySideDiff,
  buildWordDiffSegments,
  htmlToPlainText,
} from "./diff.js";

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

// [OHW-047-A6] word-level inline diff for the Cesare live-doc overlay.
describe("buildWordDiffSegments", () => {
  it("returns a single eq segment for identical text", () => {
    expect(buildWordDiffSegments("ciao mondo", "ciao mondo")).toEqual([
      { op: "eq", text: "ciao mondo" },
    ]);
  });

  it("marks a replaced word as del then add, keeping the unchanged parts eq", () => {
    const segments = buildWordDiffSegments("Il gatto dorme", "Il cane dorme");
    // Equal "Il ", removed "gatto", added "cane", equal " dorme".
    expect(
      segments.some((s) => s.op === "del" && s.text.includes("gatto")),
    ).toBe(true);
    expect(
      segments.some((s) => s.op === "add" && s.text.includes("cane")),
    ).toBe(true);
    expect(
      segments.some((s) => s.op === "eq" && s.text.includes("dorme")),
    ).toBe(true);
  });

  it("treats a pure insertion as a single add segment", () => {
    const segments = buildWordDiffSegments("ciao", "ciao mondo");
    expect(segments[0]).toEqual({ op: "eq", text: "ciao" });
    expect(
      segments.some((s) => s.op === "add" && s.text.includes("mondo")),
    ).toBe(true);
    expect(segments.some((s) => s.op === "del")).toBe(false);
  });

  it("treats a pure deletion as a single del segment", () => {
    const segments = buildWordDiffSegments("ciao mondo", "ciao");
    expect(
      segments.some((s) => s.op === "del" && s.text.includes("mondo")),
    ).toBe(true);
    expect(segments.some((s) => s.op === "add")).toBe(false);
  });

  it("coalesces adjacent segments of the same op", () => {
    const segments = buildWordDiffSegments("", "uno due tre");
    expect(segments).toHaveLength(1);
    expect(segments[0]!.op).toBe("add");
    expect(segments[0]!.text).toBe("uno due tre");
  });

  // [OHW-047d] block markup must never reach the user: it is stripped before
  // diffing so the word diff only ever contains prose words, never `<p>` tags.
  it("strips block markup so no segment contains HTML tags", () => {
    const segments = buildWordDiffSegments(
      "<p>Il gatto dorme.</p>",
      "<p>Il cane dorme.</p>",
    );
    for (const s of segments) {
      expect(s.text).not.toMatch(/<\/?[a-z][^>]*>/i);
    }
    expect(
      segments.some((s) => s.op === "del" && s.text.includes("gatto")),
    ).toBe(true);
    expect(
      segments.some((s) => s.op === "add" && s.text.includes("cane")),
    ).toBe(true);
  });

  it("does not surface paragraph block tags as a change", () => {
    // Same prose in the same paragraph structure → after stripping the markup
    // the text is identical, so the diff is a single eq segment with no tags.
    const segments = buildWordDiffSegments(
      "<p>Uno.</p><p>Due.</p>",
      "<p>Uno.</p><p>Due.</p>",
    );
    expect(segments.every((s) => s.op === "eq")).toBe(true);
    expect(segments.map((s) => s.text).join("")).not.toContain("</p>");
    // A real content change inside the paragraphs IS surfaced — as words only.
    const changed = buildWordDiffSegments(
      "<p>Uno.</p><p>Due.</p>",
      "<p>Uno.</p><p>Tre.</p>",
    );
    expect(changed.some((s) => s.op === "del" && s.text.includes("Due"))).toBe(
      true,
    );
    expect(changed.some((s) => s.op === "add" && s.text.includes("Tre"))).toBe(
      true,
    );
    for (const s of changed) expect(s.text).not.toContain("</p>");
  });
});

describe("htmlToPlainText", () => {
  it("collapses block closers to newlines and removes inline tags", () => {
    expect(htmlToPlainText("<p>Uno</p><p>Due</p>")).toBe("Uno\nDue");
    expect(htmlToPlainText("<h2>Titolo</h2><p>Testo</p>")).toBe(
      "Titolo\nTesto",
    );
    expect(htmlToPlainText("<p>a<strong>b</strong>c</p>")).toBe("abc");
  });

  it("decodes the common HTML entities and trims", () => {
    expect(htmlToPlainText("<p>uno &amp; due&nbsp;tre</p>")).toBe(
      "uno & due tre",
    );
    expect(htmlToPlainText("  <p>x</p>  ")).toBe("x");
  });

  it("collapses runs of three or more newlines to two", () => {
    expect(htmlToPlainText("<p>a</p><br><br><p>b</p>")).toBe("a\n\nb");
  });
});
