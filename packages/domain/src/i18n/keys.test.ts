import { describe, expect, it } from "vitest";
import { translations, translate } from "./keys.js";

describe("translations dictionary", () => {
  it("carries the exact same key set in every locale", () => {
    const en = Object.keys(translations.en).sort();
    const itKeys = Object.keys(translations.it).sort();
    expect(itKeys).toEqual(en);
  });

  it("has no empty or whitespace-only values", () => {
    for (const locale of ["en", "it"] as const) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves a key to its locale value", () => {
    expect(translate("it", "nav.screenplay")).toBe("Sceneggiatura");
    expect(translate("en", "nav.screenplay")).toBe("Screenplay");
  });
});
