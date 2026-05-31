// apps/web/app/features/predictions/sessions/derive-session-title.test.ts
// Spec 53 — unit coverage for the pure session-title derivation.
import { describe, it, expect } from "vitest";
import { deriveSessionTitle, DERIVED_TITLE_MAX } from "./derive-session-title";

describe("deriveSessionTitle", () => {
  it("keeps a short message verbatim", () => {
    expect(deriveSessionTitle("Aggiungi tre film")).toBe("Aggiungi tre film");
  });

  it("normalises whitespace (newlines, tabs, repeated spaces)", () => {
    expect(deriveSessionTitle("  Fammi\n un\t\tv2   del soggetto ")).toBe(
      "Fammi un v2 del soggetto",
    );
  });

  it("strips a trailing question mark", () => {
    expect(deriveSessionTitle("Che ne pensi del finale?")).toBe(
      "Che ne pensi del finale",
    );
  });

  it("strips other trailing terminal punctuation (! . …)", () => {
    expect(deriveSessionTitle("Riscrivi la scena!")).toBe("Riscrivi la scena");
    expect(deriveSessionTitle("Espandi il dialogo...")).toBe(
      "Espandi il dialogo",
    );
  });

  it("caps to the limit on a word boundary (never mid-word)", () => {
    const long =
      "Riscrivi completamente il soggetto rendendolo molto piu cupo e teso";
    const title = deriveSessionTitle(long);
    expect(title.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX);
    // Boundary cut: the last token is a whole word, not a fragment.
    expect(long.startsWith(title)).toBe(true);
    expect(title.endsWith(" ")).toBe(false);
  });

  it("hard-cuts a single over-long word that has no boundary", () => {
    const oneWord = "a".repeat(60);
    const title = deriveSessionTitle(oneWord);
    expect(title).toBe("a".repeat(DERIVED_TITLE_MAX));
  });

  it("returns empty string for blank / whitespace-only input", () => {
    expect(deriveSessionTitle("")).toBe("");
    expect(deriveSessionTitle("   \n\t ")).toBe("");
  });

  it("does not leave dangling terminal punctuation after a boundary cut", () => {
    // The 40-char boundary lands right after a clause ending in "?" — the
    // post-cap strip removes it.
    const input =
      "Va bene cosi? Allora procediamo con il prossimo passaggio adesso";
    const title = deriveSessionTitle(input);
    expect(title.endsWith("?")).toBe(false);
    expect(title.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX);
  });
});
