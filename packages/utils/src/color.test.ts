import { describe, expect, it } from "vitest";
import { userColor } from "./color.js";

describe("userColor", () => {
  it("is deterministic across calls for the same id", () => {
    expect(userColor("user-abc")).toBe(userColor("user-abc"));
  });

  it("returns a valid CSS hsl() string", () => {
    expect(userColor("user-abc")).toMatch(/^hsl\(\d{1,3} 70% 60%\)$/);
  });

  it("keeps the hue within [0, 360)", () => {
    for (const id of ["", "a", "user-1", "user-2", "a-very-long-user-id-xyz"]) {
      const hue = Number(userColor(id).match(/^hsl\((\d+) /)?.[1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("handles the empty string without throwing", () => {
    expect(() => userColor("")).not.toThrow();
    expect(userColor("")).toMatch(/^hsl\(\d{1,3} 70% 60%\)$/);
  });

  it("produces different hues for different ids", () => {
    expect(userColor("alice")).not.toBe(userColor("bob"));
  });

  it("does not collapse a batch of ids onto a single hue", () => {
    const hues = new Set(
      Array.from({ length: 20 }, (_, i) => userColor(`user-${i}`)),
    );
    // Not a guarantee of zero collisions, but a regression guard against a
    // broken hash that maps everything to the same value.
    expect(hues.size).toBeGreaterThan(10);
  });
});
