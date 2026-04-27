import { describe, it, expect } from "vitest";
import { fountainToDoc } from "~/features/screenplay-editor";
import { findOccurrencesInDoc, type ElementForMatch } from "./find-occurrences";

const SAMPLE = `INT. KITCHEN - DAY

Bob picks up the bloody knife. Bob smiles.

INT. GARAGE - NIGHT

Bobby is not Bob.
`;

const elements: ElementForMatch[] = [
  { id: "e1", name: "Bob", category: "cast", isStale: false },
  { id: "e2", name: "bloody knife", category: "props", isStale: false },
  { id: "e3", name: "Alice", category: "cast", isStale: true },
];

describe("findOccurrencesInDoc", () => {
  it("matches case-insensitive with word boundary", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    const bobs = ranges.filter((r) => r.elementId === "e1");
    // "Bob" appears 3 times as a whole word; "Bobby" must NOT match.
    expect(bobs.length).toBe(3);
  });

  it("matches multi-word names", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    const knife = ranges.filter((r) => r.elementId === "e2");
    expect(knife.length).toBe(1);
  });

  it("does not return ranges for non-matching elements", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    expect(ranges.find((r) => r.elementId === "e3")).toBeUndefined();
  });

  it("attaches category and isStale to each range", () => {
    const doc = fountainToDoc(SAMPLE);
    const ranges = findOccurrencesInDoc(doc, elements);
    expect(
      ranges.every((r) => r.category === "cast" || r.category === "props"),
    ).toBe(true);
    expect(ranges.every((r) => r.isStale === false)).toBe(true);
  });

  it("returns empty when no elements", () => {
    const doc = fountainToDoc(SAMPLE);
    expect(findOccurrencesInDoc(doc, [])).toEqual([]);
  });
});
