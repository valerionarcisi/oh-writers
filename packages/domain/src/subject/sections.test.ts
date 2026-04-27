import { describe, it, expect } from "vitest";
import { SUBJECT_SECTIONS, isSubjectSection } from "./sections.js";

describe("SUBJECT_SECTIONS", () => {
  it("has exactly 5 entries in the documented order", () => {
    expect(SUBJECT_SECTIONS).toEqual([
      "premise",
      "protagonist",
      "arc",
      "world",
      "ending",
    ]);
  });
});

describe("isSubjectSection", () => {
  it("returns true for a canonical key", () => {
    expect(isSubjectSection("premise")).toBe(true);
  });

  it("returns false for an unknown key", () => {
    expect(isSubjectSection("foo")).toBe(false);
  });
});
