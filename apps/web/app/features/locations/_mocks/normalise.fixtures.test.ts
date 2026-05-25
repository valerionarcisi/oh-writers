import { describe, it, expect } from "vitest";
import { findNormalisationFixture } from "./normalise.fixtures";

// OHW-375 — MOCK_AI normalisation fixtures mirror the "Non fa ridere" seed,
// where sibling set names of one restaurant collapse onto the same type.
describe("findNormalisationFixture", () => {
  it("collapses a restaurant set name onto ristorante", () => {
    expect(findNormalisationFixture("Angolo Open Grezzo").locationType).toBe(
      "ristorante",
    );
  });

  it("maps the bar counter onto bar", () => {
    expect(findNormalisationFixture("Bancone").locationType).toBe("bar");
  });

  it("maps a non-physical montage to altro with low confidence", () => {
    const v = findNormalisationFixture(
      "Montage di Filippo che lavora. Comici che si alterano. Pubblico ride.",
    );
    expect(v.locationType).toBe("altro");
    expect(v.confidence).toBeLessThan(0.5);
  });

  it("is case- and whitespace-insensitive on the key", () => {
    expect(findNormalisationFixture("  BANCONE  ").locationType).toBe("bar");
  });

  it("falls back to interno_generico for an unknown name", () => {
    const v = findNormalisationFixture("Set sconosciuto");
    expect(v.locationType).toBe("interno_generico");
    expect(v.confidence).toBeGreaterThan(0);
  });
});
