import { describe, it, expect } from "vitest";
import {
  filterIntExt,
  parseSceneNumber,
  nextLetterSuffix,
  sceneNumberForInsertion,
  renumberAll,
  compareSceneNumbers,
  resequenceAll,
  ResequenceConflictError,
} from "@oh-writers/domain";

const unlocked = (number: string) => ({ number, locked: false });
const locked = (number: string) => ({ number, locked: true });

describe("filterIntExt", () => {
  it("returns all options for empty input", () => {
    expect(filterIntExt("")).toEqual(["INT.", "EXT.", "INT/EXT.", "EXT/INT."]);
  });

  it("filters by prefix, case-insensitive", () => {
    expect(filterIntExt("i")).toEqual(["INT.", "INT/EXT."]);
    expect(filterIntExt("E")).toEqual(["EXT.", "EXT/INT."]);
    expect(filterIntExt("int/")).toEqual(["INT/EXT."]);
  });

  it("returns empty array when no prefix matches", () => {
    expect(filterIntExt("xyz")).toEqual([]);
  });
});

describe("parseSceneNumber", () => {
  it("parses pure number", () => {
    expect(parseSceneNumber("4")).toEqual({ number: 4, letters: "" });
  });

  it("parses number + single letter", () => {
    expect(parseSceneNumber("4A")).toEqual({ number: 4, letters: "A" });
  });

  it("parses number + multi letter", () => {
    expect(parseSceneNumber("12BC")).toEqual({ number: 12, letters: "BC" });
  });

  it("lowercases letters", () => {
    expect(parseSceneNumber("3a")).toEqual({ number: 3, letters: "A" });
  });

  it("returns null for non-matching input", () => {
    expect(parseSceneNumber("")).toBeNull();
    expect(parseSceneNumber("A1")).toBeNull();
    expect(parseSceneNumber("1.2")).toBeNull();
  });
});

describe("nextLetterSuffix", () => {
  it("empty → A", () => {
    expect(nextLetterSuffix("")).toBe("A");
  });

  it("A → B, B → C", () => {
    expect(nextLetterSuffix("A")).toBe("B");
    expect(nextLetterSuffix("B")).toBe("C");
  });

  it("Z → AA", () => {
    expect(nextLetterSuffix("Z")).toBe("AA");
  });

  it("AA → AB", () => {
    expect(nextLetterSuffix("AA")).toBe("AB");
  });

  it("AZ → BA", () => {
    expect(nextLetterSuffix("AZ")).toBe("BA");
  });

  it("ZZ → AAA", () => {
    expect(nextLetterSuffix("ZZ")).toBe("AAA");
  });
});

describe("sceneNumberForInsertion", () => {
  it("empty doc → '1'", () => {
    expect(sceneNumberForInsertion([], 0)).toBe("1");
  });

  it("at end → next integer", () => {
    expect(sceneNumberForInsertion(["1", "2", "3"], 3)).toBe("4");
  });

  it("between integers → suffix 'A' belongs to previous", () => {
    expect(sceneNumberForInsertion(["1", "2", "3"], 1)).toBe("1A");
  });

  it("after an existing suffix → next free letter", () => {
    expect(sceneNumberForInsertion(["1", "1A", "2"], 2)).toBe("1B");
  });

  it("three insertions in a row produce A, B, C", () => {
    let existing: readonly string[] = ["1", "2"];
    const inserted1 = sceneNumberForInsertion(existing, 1);
    existing = ["1", inserted1, "2"];
    const inserted2 = sceneNumberForInsertion(existing, 2);
    existing = ["1", inserted1, inserted2, "2"];
    const inserted3 = sceneNumberForInsertion(existing, 3);
    expect([inserted1, inserted2, inserted3]).toEqual(["1A", "1B", "1C"]);
  });

  it("insert at the top → previous integer if possible", () => {
    expect(sceneNumberForInsertion(["2", "3"], 0)).toBe("1");
  });
});

describe("renumberAll", () => {
  it("fresh sequential numbers", () => {
    expect(renumberAll(0)).toEqual([]);
    expect(renumberAll(3)).toEqual(["1", "2", "3"]);
  });
});

describe("compareSceneNumbers", () => {
  it("orders by number first, then letters", () => {
    const nums = ["2", "1A", "1", "2A", "10"];
    const sorted = [...nums].sort(compareSceneNumbers);
    expect(sorted).toEqual(["1", "1A", "2", "2A", "10"]);
  });
});

describe("resequenceAll", () => {
  it("numbers all-unlocked scenes 1..N", () => {
    const r = resequenceAll([unlocked("7"), unlocked("3"), unlocked("x")]);
    expect(r).toEqual({ ok: true, numbers: ["1", "2", "3"] });
  });

  it("empty input returns empty numbers", () => {
    expect(resequenceAll([])).toEqual({ ok: true, numbers: [] });
  });

  it("preserves all-locked scenes in strictly increasing order", () => {
    const r = resequenceAll([locked("2"), locked("5"), locked("5A")]);
    expect(r).toEqual({ ok: true, numbers: ["2", "5", "5A"] });
  });

  it("fills unlocked scenes around a locked midpoint with plain integers", () => {
    const r = resequenceAll([
      unlocked("a"),
      unlocked("b"),
      locked("10"),
      unlocked("c"),
      unlocked("d"),
    ]);
    expect(r).toEqual({ ok: true, numbers: ["1", "2", "10", "11", "12"] });
  });

  it("falls back to letter suffixes when numeric room is tight", () => {
    const r = resequenceAll([
      locked("5"),
      unlocked("x"),
      unlocked("y"),
      unlocked("z"),
      locked("6"),
    ]);
    expect(r).toEqual({
      ok: true,
      numbers: ["5", "5A", "5B", "5C", "6"],
    });
  });

  it("continues letter sequence from an anchored locked scene", () => {
    const r = resequenceAll([
      locked("5A"),
      unlocked("x"),
      unlocked("y"),
      locked("6"),
    ]);
    expect(r).toEqual({ ok: true, numbers: ["5A", "5B", "5C", "6"] });
  });

  it("uses letter fallback from start when first lock is at 1", () => {
    const r = resequenceAll([unlocked("x"), unlocked("y"), locked("1")]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.numbers).toEqual(["0A", "0B", "1"]);
  });

  it("fails when two locked scenes are out of order", () => {
    const r = resequenceAll([locked("5"), unlocked("x"), locked("3")]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ResequenceConflictError);
      expect(r.error.reason).toMatch(/out of order/);
    }
  });

  it("fails when locked scenes are equal (not strictly increasing)", () => {
    const r = resequenceAll([locked("4"), unlocked("x"), locked("4")]);
    expect(r.ok).toBe(false);
  });

  it("fails on invalid locked number", () => {
    const r = resequenceAll([locked("not-a-number")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toMatch(/invalid locked number/);
  });

  it("fails when unlocked run cannot fit between tight locked bounds exhausting letters", () => {
    // Between "5" and "5A" there is no room for any unlocked scene:
    // the only candidate "5A" collides with the next locked number.
    const input = [locked("5"), unlocked("x"), locked("5A")];
    const r = resequenceAll(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toMatch(/cannot fit/);
  });

  it("output length equals input length", () => {
    const input = [unlocked("a"), locked("5"), unlocked("b"), unlocked("c")];
    const r = resequenceAll(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.numbers).toHaveLength(input.length);
  });
});
