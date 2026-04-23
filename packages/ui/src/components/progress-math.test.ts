import { describe, it, expect } from "vitest";
import { toPercent } from "./progress-math.js";

describe("toPercent", () => {
  it("returns 0 when value is 0", () => {
    expect(toPercent(0, 100)).toBe(0);
  });

  it("returns 100 when value equals max", () => {
    expect(toPercent(47, 47)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(toPercent(1, 3)).toBe(33);
    expect(toPercent(2, 3)).toBe(67);
  });

  it("clamps to 0 when value is negative", () => {
    expect(toPercent(-5, 100)).toBe(0);
  });

  it("clamps to 100 when value exceeds max", () => {
    expect(toPercent(150, 100)).toBe(100);
  });

  it("returns 0 when max is 0", () => {
    expect(toPercent(5, 0)).toBe(0);
  });

  it("returns 0 when max is negative", () => {
    expect(toPercent(5, -10)).toBe(0);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(toPercent(NaN, 100)).toBe(0);
    expect(toPercent(5, NaN)).toBe(0);
    expect(toPercent(Infinity, 100)).toBe(0);
  });
});
