import { describe, it, expect } from "vitest";
import { toCartelle, CARTELLA_CHARS } from "./cartelle-counter.js";

describe("toCartelle", () => {
  it("returns 0 for empty input", () => {
    expect(toCartelle(0)).toBe(0);
  });

  it("returns 0 for negative input", () => {
    expect(toCartelle(-1)).toBe(0);
  });

  it("returns 1 for 1 character", () => {
    expect(toCartelle(1)).toBe(1);
  });

  it("returns 1 for 1799 characters", () => {
    expect(toCartelle(1799)).toBe(1);
  });

  it("returns 1 for exactly 1800 characters", () => {
    expect(toCartelle(CARTELLA_CHARS)).toBe(1);
  });

  it("returns 2 for 1801 characters", () => {
    expect(toCartelle(1801)).toBe(2);
  });

  it("returns 10 for 18000 characters", () => {
    expect(toCartelle(18000)).toBe(10);
  });
});
