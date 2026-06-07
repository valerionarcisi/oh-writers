import { describe, it, expect } from "vitest";
import { bestDecoding } from "./pdf-import.server";

/**
 * Regression for the PDF-import mojibake fix: pdf-parse usually returns
 * already-decoded Unicode; a blanket latin1→utf8 re-encode corrupts that. The
 * heuristic must pick the cleaner variant by replacement-char count.
 */
describe("bestDecoding", () => {
  it("keeps already-clean Unicode text untouched (no spurious U+FFFD)", () => {
    const clean = "FILIPPO\nÈ in piedi in un angolo. Certo signo', e da bere?";
    expect(bestDecoding(clean)).toBe(clean);
    expect(bestDecoding(clean)).not.toContain("�");
  });

  it("prefers the variant with fewer replacement chars", () => {
    // When a latin1→utf8 re-encode would INTRODUCE replacement chars (the common
    // case — pdf-parse already returned clean Unicode), keep the raw text.
    const clean = "Il forno è ancora là — un testimone.";
    const recoded = Buffer.from(clean, "latin1").toString("utf8");
    expect(recoded).toContain("�"); // the re-encode corrupts it
    expect(bestDecoding(clean)).toBe(clean); // so we keep raw
  });
});
