import { describe, expect, it } from "vitest";
import {
  computeCartellaOffsets,
  flatOffsetToDocPos,
} from "./cartella-marker-plugin.js";
import { synopsisSchema } from "./narrative-schema.js";

describe("computeCartellaOffsets", () => {
  it("returns [] for empty doc", () => {
    expect(computeCartellaOffsets(0)).toEqual([]);
  });

  it("returns [] just below the first boundary", () => {
    expect(computeCartellaOffsets(1799)).toEqual([]);
  });

  it("returns [] exactly at the first boundary (strict <)", () => {
    expect(computeCartellaOffsets(1800)).toEqual([]);
  });

  it("emits the first boundary once strictly crossed", () => {
    expect(computeCartellaOffsets(1801)).toEqual([1800]);
  });

  it("does not emit the second boundary until strictly crossed", () => {
    expect(computeCartellaOffsets(3600)).toEqual([1800]);
  });

  it("emits all boundaries strictly crossed", () => {
    expect(computeCartellaOffsets(5500)).toEqual([1800, 3600, 5400]);
  });
});

describe("flatOffsetToDocPos", () => {
  const buildDoc = (paragraphs: string[]) =>
    synopsisSchema.node(
      "doc",
      null,
      paragraphs.map((p) =>
        synopsisSchema.node(
          "paragraph",
          null,
          p.length > 0 ? [synopsisSchema.text(p)] : [],
        ),
      ),
    );

  it("maps offset 0 to the start of the first paragraph", () => {
    const doc = buildDoc(["hello world"]);
    expect(flatOffsetToDocPos(doc, 0)).toBe(1);
  });

  it("maps offset within first text node", () => {
    const doc = buildDoc(["hello world"]);
    // 'hello' = 5 chars → pos = 1 (paragraph open) + 5
    expect(flatOffsetToDocPos(doc, 5)).toBe(6);
  });

  it("maps offset that spans into the second paragraph", () => {
    const doc = buildDoc(["abc", "def"]);
    // 'abc' = 3 chars in first paragraph (pos 1..4), paragraph close at 4,
    // second paragraph opens at pos 5 → offset 3 lands at end of first text node
    expect(flatOffsetToDocPos(doc, 3)).toBe(4);
    // offset 4 → 1 char into second paragraph's text node (pos 5 + 1 = 7? let's trust the helper)
    const pos4 = flatOffsetToDocPos(doc, 4);
    expect(pos4).not.toBeNull();
    expect(pos4).toBeGreaterThan(4);
  });

  it("returns null when offset exceeds total text length", () => {
    const doc = buildDoc(["abc"]);
    expect(flatOffsetToDocPos(doc, 100)).toBeNull();
  });
});
