import { describe, it, expect } from "vitest";
import { extractCharacterNames } from "./fountain-autocomplete";
import { CHARACTER_INDENT } from "./fountain-constants";

// Regression: "FADE TO BLACK." (a standard, common Fountain transition) was
// missing from FOUNTAIN_TRANSITIONS, so extractCharacterNames' transition
// exclusion filter (TRANSITION_SET.has(...)) never matched it — an all-caps,
// column-0, blank-line-preceded transition line passes every other "looks
// like a character cue" heuristic, so it leaked into the character-cue
// autocomplete dropdown as a fake character name alongside real ones (ANNA,
// GABRIELE, ...).
describe("extractCharacterNames — transition exclusion", () => {
  it("does not treat FADE TO BLACK. as a character name", () => {
    const fountain = [
      "INT. ROOM - DAY",
      "",
      "ANNA",
      "Hello.",
      "",
      "FADE TO BLACK.",
    ].join("\n");
    const names = extractCharacterNames(fountain);
    expect(names).toContain("ANNA");
    expect(names).not.toContain("FADE TO BLACK.");
    expect(names).not.toContain("FADE TO BLACK");
  });

  it("still excludes every other canonical transition", () => {
    const fountain = [
      "INT. ROOM - DAY",
      "",
      "ANNA",
      "Hello.",
      "",
      "CUT TO:",
      "",
      "FADE OUT.",
      "",
      `${CHARACTER_INDENT}GABRIELE`,
    ].join("\n");
    const names = extractCharacterNames(fountain);
    expect(names).toEqual(["ANNA", "GABRIELE"]);
  });
});
