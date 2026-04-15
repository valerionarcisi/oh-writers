import { describe, it, expect } from "vitest";
import { detectElement } from "./fountain-element-detector";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

describe("detectElement — scene headings", () => {
  it("recognises INT. at column 0", () => {
    expect(detectElement("INT. KITCHEN - NIGHT")).toBe("scene");
  });

  it("recognises EXT. at column 0", () => {
    expect(detectElement("EXT. STREET - DAY")).toBe("scene");
  });

  it("recognises INT./EXT. compound prefix", () => {
    expect(detectElement("INT./EXT. CAR - CONTINUOUS")).toBe("scene");
  });

  it("recognises I/E short form", () => {
    expect(detectElement("I/E PARKING LOT - DUSK")).toBe("scene");
  });

  it("does not recognise INT without trailing dot", () => {
    expect(detectElement("INT KITCHEN")).not.toBe("scene");
  });
});

describe("detectElement — parenthetical", () => {
  it("recognises a parenthetical at any indent", () => {
    expect(detectElement("(sottovoce)")).toBe("parenthetical");
    expect(detectElement(`${DIALOGUE_INDENT}(to himself)`)).toBe(
      "parenthetical",
    );
  });

  it("requires both parens to be present", () => {
    expect(detectElement("(incomplete")).not.toBe("parenthetical");
    expect(detectElement("no open)")).not.toBe("parenthetical");
  });

  it("empty parens still count", () => {
    expect(detectElement("()")).toBe("parenthetical");
  });
});

describe("detectElement — dialogue", () => {
  it("recognises dialogue-indented text", () => {
    expect(detectElement(`${DIALOGUE_INDENT}Hello there.`)).toBe("dialogue");
  });

  it("recognises dialogue-indented empty line as dialogue (writer about to type)", () => {
    expect(detectElement(DIALOGUE_INDENT)).toBe("dialogue");
  });

  it("dialogue wins over character when both indents would match", () => {
    // DIALOGUE_INDENT starts with CHARACTER_INDENT — detector must return dialogue.
    expect(detectElement(`${DIALOGUE_INDENT}Hello.`)).toBe("dialogue");
  });
});

describe("detectElement — character", () => {
  it("recognises indented character cue", () => {
    expect(detectElement(`${CHARACTER_INDENT}NONNO`)).toBe("character");
  });

  it("recognises indented empty character line", () => {
    expect(detectElement(CHARACTER_INDENT)).toBe("character");
  });

  it("recognises plain-Fountain ALL-CAPS cue after blank line", () => {
    expect(detectElement("NONNO", "")).toBe("character");
  });

  it("recognises plain-Fountain cue at start of document", () => {
    expect(detectElement("NONNO", null)).toBe("character");
  });

  it("recognises ALL-CAPS name-shaped line even without a blank line above", () => {
    // Permissive heuristic: a short ALL-CAPS line with no sentence
    // punctuation is treated as a cue even when the previous line isn't blank.
    expect(detectElement("NONNO", "Some action.")).toBe("character");
  });

  it("rejects ALL-CAPS lines with sentence punctuation", () => {
    // The permissive heuristic requires a name-shaped body: no "." "!" "?"
    // ",", ";" or ":" in the non-parenthetical part.
    expect(detectElement("STOP!", "Some action.")).toBe("action");
  });

  it("rejects ALL-CAPS lines longer than 40 chars", () => {
    const longLine =
      "THIS IS A VERY LONG ALL CAPS LINE THAT SHOULD NOT BE A CUE";
    expect(detectElement(longLine, "Some action.")).toBe("action");
  });

  it("rejects plain cues that are actually transitions", () => {
    expect(detectElement("CUT TO:", "")).toBe("transition");
  });

  it("rejects plain cues that are actually scene headings", () => {
    expect(detectElement("INT. HOUSE", "")).toBe("scene");
  });

  it("rejects mixed-case lines as plain cues", () => {
    expect(detectElement("Nonno walks", "")).toBe("action");
  });

  it("rejects lines with no letters as plain cues", () => {
    expect(detectElement("123", "")).toBe("action");
  });
});

describe("detectElement — transition", () => {
  it("recognises CUT TO: at column 0", () => {
    expect(detectElement("CUT TO:")).toBe("transition");
  });

  it("recognises FADE OUT:", () => {
    expect(detectElement("FADE OUT:")).toBe("transition");
  });

  it("does not recognise unknown transitions (would need user intent)", () => {
    // Unknown all-caps lines containing sentence punctuation (":") fail the
    // name-shape heuristic and fall through to action in both contexts.
    expect(detectElement("WHOOSH TO:", "")).toBe("action");
    expect(detectElement("WHOOSH TO:", "action")).toBe("action");
  });
});

describe("detectElement — action", () => {
  it("is the default for plain text", () => {
    expect(detectElement("Filippo entra in cucina.")).toBe("action");
  });

  it("is the default for empty line with no indent", () => {
    expect(detectElement("")).toBe("action");
  });

  it("is the default for sentence-case at column 0", () => {
    expect(detectElement("He walks slowly.", "")).toBe("action");
  });
});
