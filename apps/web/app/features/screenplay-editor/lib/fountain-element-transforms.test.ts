import { describe, it, expect } from "vitest";
import {
  applyElement,
  nextElementOnEnter,
  nextElementOnTab,
  TRANSITION_COLUMN_WIDTH,
} from "./fountain-element-transforms";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

describe("applyElement — scene", () => {
  it("uppercases content with no indent", () => {
    expect(applyElement("int. kitchen - night", "scene")).toBe(
      "INT. KITCHEN - NIGHT",
    );
  });

  it("strips prior character indent before reformatting", () => {
    expect(applyElement(`${CHARACTER_INDENT}int. kitchen`, "scene")).toBe(
      "INT. KITCHEN",
    );
  });

  it("works on empty input", () => {
    expect(applyElement("", "scene")).toBe("");
  });
});

describe("applyElement — action", () => {
  it("leaves content unchanged at column 0", () => {
    expect(applyElement("Filippo entra.", "action")).toBe("Filippo entra.");
  });

  it("strips character indent when leaving a cue", () => {
    expect(applyElement(`${CHARACTER_INDENT}NONNO`, "action")).toBe("NONNO");
  });

  it("strips dialogue indent when leaving dialogue", () => {
    expect(applyElement(`${DIALOGUE_INDENT}Hello.`, "action")).toBe("Hello.");
  });
});

describe("applyElement — character", () => {
  it("indents and uppercases", () => {
    expect(applyElement("nonno", "character")).toBe(`${CHARACTER_INDENT}NONNO`);
  });

  it("empty input yields just the indent", () => {
    expect(applyElement("", "character")).toBe(CHARACTER_INDENT);
  });

  it("re-indents when switching from dialogue", () => {
    expect(applyElement(`${DIALOGUE_INDENT}nonno`, "character")).toBe(
      `${CHARACTER_INDENT}NONNO`,
    );
  });
});

describe("applyElement — parenthetical", () => {
  it("wraps unwrapped content in parens at dialogue indent", () => {
    expect(applyElement("sottovoce", "parenthetical")).toBe(
      `${DIALOGUE_INDENT}(sottovoce)`,
    );
  });

  it("preserves content already wrapped in parens", () => {
    expect(applyElement("(sottovoce)", "parenthetical")).toBe(
      `${DIALOGUE_INDENT}(sottovoce)`,
    );
  });

  it("empty input yields () ready for cursor placement", () => {
    expect(applyElement("", "parenthetical")).toBe(`${DIALOGUE_INDENT}()`);
  });
});

describe("applyElement — dialogue", () => {
  it("indents at dialogue column", () => {
    expect(applyElement("Hello there.", "dialogue")).toBe(
      `${DIALOGUE_INDENT}Hello there.`,
    );
  });

  it("re-indents when switching from character", () => {
    expect(applyElement(`${CHARACTER_INDENT}some text`, "dialogue")).toBe(
      `${DIALOGUE_INDENT}some text`,
    );
  });

  it("empty input yields just the indent", () => {
    expect(applyElement("", "dialogue")).toBe(DIALOGUE_INDENT);
  });
});

describe("applyElement — transition", () => {
  it("uppercases and right-pads to TRANSITION_COLUMN_WIDTH", () => {
    const result = applyElement("cut to:", "transition");
    expect(result).toBe(
      " ".repeat(TRANSITION_COLUMN_WIDTH - "CUT TO:".length) + "CUT TO:",
    );
    expect(result.length).toBe(TRANSITION_COLUMN_WIDTH);
  });

  it("pads longer transitions to still end at the right column", () => {
    const content = "SMASH CUT TO:";
    const result = applyElement(content, "transition");
    expect(result.endsWith(content)).toBe(true);
    expect(result.length).toBe(TRANSITION_COLUMN_WIDTH);
  });

  it("does not truncate content longer than the column width", () => {
    const longContent = "A".repeat(TRANSITION_COLUMN_WIDTH + 10);
    const result = applyElement(longContent, "transition");
    expect(result).toBe(longContent);
  });
});

describe("nextElementOnEnter — matches Spec 05e matrix", () => {
  it.each([
    ["scene", "action"],
    ["action", "action"],
    ["character", "dialogue"],
    ["parenthetical", "dialogue"],
    ["dialogue", "character"],
    ["transition", "scene"],
  ] as const)("%s → %s", (from, to) => {
    expect(nextElementOnEnter(from)).toBe(to);
  });
});

describe("nextElementOnTab — matches Spec 05e matrix", () => {
  it.each([
    ["action", "character"],
    ["character", "parenthetical"],
    ["parenthetical", "dialogue"],
    ["dialogue", "action"],
    // Escape hatches — not in the official matrix but needed for consistent UX
    ["scene", "action"],
    ["transition", "action"],
  ] as const)("%s → %s", (from, to) => {
    expect(nextElementOnTab(from)).toBe(to);
  });
});
