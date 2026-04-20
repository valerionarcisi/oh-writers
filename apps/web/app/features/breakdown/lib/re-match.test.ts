import { describe, it, expect } from "vitest";
import { findElementInText } from "./re-match";

describe("findElementInText", () => {
  it("finds case-insensitive word match", () => {
    expect(
      findElementInText("Bloody knife", "Rick draws his BLOODY KNIFE."),
    ).toBe(true);
  });

  it("requires word boundary (no partial match)", () => {
    expect(findElementInText("knife", "his pocketknife is small")).toBe(false);
  });

  it("returns false when not found", () => {
    expect(findElementInText("gun", "no weapon here")).toBe(false);
  });

  it("escapes regex special chars in element name", () => {
    expect(findElementInText(".44 Magnum", "He pulled a .44 Magnum.")).toBe(
      true,
    );
  });
});
