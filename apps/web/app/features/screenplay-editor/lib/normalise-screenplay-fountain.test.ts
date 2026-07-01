import { describe, it, expect } from "vitest";
import { normaliseScreenplayFountain } from "./normalise-screenplay-fountain";
import { fountainToDoc } from "./fountain-to-doc";

// #53 — the canonicaliser is the ONE gate for model-produced screenplay text.
// It must recover real DIALOGUE from the way the model mis-formats a scene:
// cue+speech on one line, cues stacked with no blank separators, two cues on
// one line — all in a single scene with NO blank lines between cue blocks
// (the real symptom that splitInlineCues alone could not survive, because a
// flat cue line gets folded back into the next paragraph by any reflow).
describe("[#53] normaliseScreenplayFountain", () => {
  const distribution = (fountain: string): Record<string, number> => {
    const doc = fountainToDoc(fountain);
    const counts: Record<string, number> = {};
    doc.descendants((n) => {
      counts[n.type.name] = (counts[n.type.name] ?? 0) + 1;
      return true;
    });
    return counts;
  };

  it("recovers cues + dialogue from a fully broken scene with no blank lines", () => {
    const broken = [
      "INT. OPEN GREZZO - NOTTE",
      "",
      "Un club di cabaret affollato.",
      "FILIPPO Comici. Open mic.",
      "GIULIO Dodici.",
      "FILIPPO Giulio — GIULIO Vai.",
    ].join("\n");

    const out = normaliseScreenplayFountain(broken);
    const counts = distribution(out);

    // FILIPPO ×2 (+ the split second-cue GIULIO) and GIULIO ×2 → ≥4 cues, each
    // with its dialogue. The point is a sane distribution, not a wall of action.
    expect(counts["character"] ?? 0).toBeGreaterThanOrEqual(4);
    expect(counts["dialogue"] ?? 0).toBeGreaterThanOrEqual(4);

    // No "CUE speech" one-liner survives.
    for (const line of out.split("\n")) {
      const t = line.trim();
      if (t.startsWith("INT.") || t.startsWith("EXT.")) continue;
      expect(t).not.toMatch(/^[A-ZÀ-Ý][A-ZÀ-Ý ]+\s+\p{Ll}/u);
    }
  });

  it("is idempotent — re-normalising canonical output is a no-op", () => {
    const broken = "INT. CUCINA - NOTTE\n\nFILIPPO Comici.\nGIULIO Dodici.";
    const once = normaliseScreenplayFountain(broken);
    expect(normaliseScreenplayFountain(once)).toBe(once);
  });

  it("never returns empty for non-empty input", () => {
    expect(
      normaliseScreenplayFountain("INT. X - N\n\nFoo.").length,
    ).toBeGreaterThan(0);
  });
});
