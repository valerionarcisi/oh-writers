import { describe, it, expect } from "vitest";
import { analyzeSubjectLength } from "./length.js";

describe("analyzeSubjectLength", () => {
  it("returns zeros for empty string", () => {
    expect(analyzeSubjectLength("")).toEqual({
      chars: 0,
      words: 0,
      cartelle: 0,
      pages: 0,
      isOverSoftLimit: false,
    });
  });

  it("returns cartelle === 1 for exactly 1800 chars", () => {
    const text = "a".repeat(1800);
    expect(analyzeSubjectLength(text).cartelle).toBe(1);
    expect(analyzeSubjectLength(text).chars).toBe(1800);
  });

  it("computes cartelle 2.5 and pages 3 for 4500 chars / 750 words", () => {
    const text = "word ".repeat(750).trimEnd().padEnd(4500, "x");
    const result = analyzeSubjectLength(text);
    expect(result.chars).toBe(4500);
    expect(result.cartelle).toBe(2.5);
    expect(result.words).toBe(750);
    expect(result.pages).toBe(3);
  });

  it("flags isOverSoftLimit when words > 3600", () => {
    const text = "w ".repeat(3601).trim();
    expect(analyzeSubjectLength(text).isOverSoftLimit).toBe(true);
  });

  it("does not flag isOverSoftLimit at exactly 3600 words (strict >)", () => {
    const text = "w ".repeat(3600).trim();
    const result = analyzeSubjectLength(text);
    expect(result.words).toBe(3600);
    expect(result.isOverSoftLimit).toBe(false);
  });

  it("counts a single word as words === 1", () => {
    expect(analyzeSubjectLength("hello").words).toBe(1);
  });
});
