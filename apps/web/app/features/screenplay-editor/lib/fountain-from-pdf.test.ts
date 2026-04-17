import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fountainFromPdf } from "./fountain-from-pdf";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(
  HERE,
  "../../../../../../tests/fixtures/screenplays",
);
const loadFixture = (name: string): string =>
  readFileSync(path.join(FIXTURES, name), "utf8");

describe("fountainFromPdf — 01-minimal", () => {
  const out = fountainFromPdf(loadFixture("01-minimal.txt"));

  it("emits scene heading at column 0", () => {
    expect(out).toMatch(/^INT\. COFFEE SHOP - DAY$/m);
  });

  it("emits character cue with 6-space indent", () => {
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}ANNA$`, "m"));
  });

  it("emits dialogue with 10-space indent", () => {
    expect(out).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}I can't believe he said that\\.$`, "m"),
    );
  });

  it("treats 'ANNA sits alone, reading a book.' as action, not character", () => {
    expect(out).toMatch(/^ANNA sits alone, reading a book\.$/m);
  });
});

describe("fountainFromPdf — 02-first-draft-clean", () => {
  const out = fountainFromPdf(loadFixture("02-first-draft-clean.txt"));

  it("recognises FADE IN: as transition", () => {
    expect(out).toMatch(/^FADE IN:$/m);
  });

  it("recognises CUT TO: as transition", () => {
    expect(out).toMatch(/^CUT TO:$/m);
  });

  it("recognises FADE OUT. as transition", () => {
    expect(out).toMatch(/^FADE OUT\.$/m);
  });

  it("preserves MARA (V.O.) character extension verbatim", () => {
    expect(out).toContain(`${CHARACTER_INDENT}MARA (V.O.)`);
  });

  it("preserves plain MARA character without extension", () => {
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}MARA$`, "m"));
  });
});

describe("fountainFromPdf — 03-shooting-script (Wolf-style)", () => {
  const out = fountainFromPdf(loadFixture("03-shooting-script.txt"));

  it("strips 'Buff Revised Pages' header lines", () => {
    expect(out).not.toContain("Buff Revised Pages");
    expect(out).not.toContain("3/5/13");
  });

  it("strips bare page numbers like '22.' and '23.'", () => {
    expect(out).not.toMatch(/^\s*22\.\s*$/m);
    expect(out).not.toMatch(/^\s*23\.\s*$/m);
  });

  it("captures leading scene numbers on sluglines as #N# forced-number syntax", () => {
    expect(out).toMatch(
      /^INT\. STRATTON OAKMONT I – AUTO BODY SHOP – DAY #41#$/m,
    );
    expect(out).toMatch(
      /^INT\. STRATTON OAKMONT I – AUTO BODY SHOP – REAR – NIGHT #47#$/m,
    );
  });

  it("strips trailing revision asterisks from dialogue lines", () => {
    expect(out).not.toMatch(/Pinhead,\s*\*/);
    expect(out).toMatch(/Pinhead,\s*$/m);
  });

  it("strips standalone scene-number+asterisk fragments ('* 42')", () => {
    expect(out).not.toMatch(/^\s*\*\s*42\s*$/m);
    expect(out).not.toMatch(/^\s*\*46A\s*$/m);
  });

  it("preserves 'SCENES 42 – 46 OMITTED' as action (no scene number)", () => {
    expect(out).toMatch(/^SCENES 42 – 46 OMITTED$/m);
  });

  it("keeps 'INSERT ID PHOTO – TOBY WELCH' as a scene heading (with forced #46A#)", () => {
    expect(out).toMatch(/^INSERT ID PHOTO – TOBY WELCH #46A#$/m);
  });

  it("strips date annotation '(MAR `90)' dangling line", () => {
    expect(out).not.toMatch(/^\s*\(MAR\s*[`']\s*90\)\s*$/m);
  });

  it("preserves JORDAN (V.O.) character cue verbatim", () => {
    expect(out).toContain(`${CHARACTER_INDENT}JORDAN (V.O.)`);
  });
});

describe("fountainFromPdf — 04-italian-short", () => {
  const out = fountainFromPdf(loadFixture("04-italian-short.txt"));

  it("recognises EST. as scene heading prefix", () => {
    expect(out).toMatch(/^EST\. GIARDINO - ALBA$/m);
  });

  it("recognises INT. in Italian context", () => {
    expect(out).toMatch(/^INT\. CUCINA - NOTTE$/m);
  });

  it("handles accented uppercase character name JOSUÈ", () => {
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}JOSUÈ$`, "m"));
  });

  it("preserves Italian V.F.C. extension (voce fuori campo)", () => {
    expect(out).toContain(`${CHARACTER_INDENT}GIUSEPPE (V.F.C.)`);
  });

  it("recognises parenthetical '(sottovoce)' inside dialogue", () => {
    expect(out).toContain(`${DIALOGUE_INDENT}(sottovoce)`);
  });
});

describe("fountainFromPdf — 05-character-extensions", () => {
  const out = fountainFromPdf(loadFixture("05-character-extensions.txt"));

  it("preserves plain DJ", () => {
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}DJ$`, "m"));
  });

  it("preserves DJ (V.O.) single extension", () => {
    expect(out).toContain(`${CHARACTER_INDENT}DJ (V.O.)`);
  });

  it("preserves DJ (V.O.) (CONT'D) compound extension as a single character cue", () => {
    expect(out).toContain(`${CHARACTER_INDENT}DJ (V.O.) (CONT'D)`);
  });

  it("preserves DJ (CONT'D) single extension", () => {
    expect(out).toContain(`${CHARACTER_INDENT}DJ (CONT'D)`);
  });

  it("preserves FATHER (O.S.) off-screen extension", () => {
    expect(out).toContain(`${CHARACTER_INDENT}FATHER (O.S.)`);
  });

  it("preserves CALLER #1 (O.S.) — character cue with '#' and number", () => {
    expect(out).toContain(`${CHARACTER_INDENT}CALLER #1 (O.S.)`);
  });

  it("preserves CALLER #2 (V.O.)", () => {
    expect(out).toContain(`${CHARACTER_INDENT}CALLER #2 (V.O.)`);
  });
});

describe("fountainFromPdf — 06-wolf-page-1 (real extract)", () => {
  const out = fountainFromPdf(loadFixture("06-wolf-page-1.txt"));

  it("strips 'Buff Revised Pages' header and date", () => {
    expect(out).not.toContain("Buff Revised Pages");
    expect(out).not.toContain("3/5/13");
  });

  it("strips bare page number '2.'", () => {
    expect(out).not.toMatch(/^\s*2\.\s*$/m);
  });

  it("captures scene number '2' as forced #2# and strips date '(FEB `95)'", () => {
    expect(out).toMatch(/^INT\. STRATTON OAKMONT III – BULLPEN – DAY #2#$/m);
  });

  it("strips scene number '1F' from slugline-like line", () => {
    expect(out).not.toMatch(/^1F\s/m);
    expect(out).not.toMatch(/\s1F$/m);
  });

  it("preserves GENE HACKMAN (V.O.) character cue", () => {
    expect(out).toContain(`${CHARACTER_INDENT}GENE HACKMAN (V.O.)`);
  });

  it("preserves JORDAN (CONT'D) character cue", () => {
    expect(out).toContain(`${CHARACTER_INDENT}JORDAN (CONT'D)`);
  });

  it("preserves JORDAN (V.O.) (CONT'D) compound character cue", () => {
    expect(out).toContain(`${CHARACTER_INDENT}JORDAN (V.O.) (CONT'D)`);
  });

  it("strips revision asterisks from dialogue (e.g. 'No, not         *')", () => {
    expect(out).not.toMatch(/No, not\s+\*/);
  });
});

describe("fountainFromPdf — 07-transitions", () => {
  const out = fountainFromPdf(loadFixture("07-transitions.txt"));

  it.each([
    "FADE IN:",
    "SMASH CUT TO:",
    "CUT TO:",
    "DISSOLVE TO:",
    "MATCH CUT TO:",
    "CUT TO BLACK.",
    "FADE OUT.",
  ])("recognises '%s' as transition (unindented)", (phrase) => {
    expect(out).toMatch(new RegExp(`^${phrase.replace(/\./g, "\\.")}$`, "m"));
  });
});

describe("fountainFromPdf — real-world shooting-script artefacts", () => {
  it("strips fused duplicate gutter numbers with trailing revision asterisk (139139*)", () => {
    const out = fountainFromPdf(
      ["INT. CONFERENCE ROOM - DAY   139139*", "", "Action line."].join("\n"),
    );
    expect(out).toMatch(/^INT\. CONFERENCE ROOM - DAY #139#$/m);
    expect(out).not.toMatch(/139139/);
    expect(out).not.toMatch(/\*/);
  });

  it("strips fused gutter number stuck to date annotation (JUN '88)3232*", () => {
    const out = fountainFromPdf(
      ["INT. BAR - DAY  (JUN \u201888)3232*", "", "Action."].join("\n"),
    );
    expect(out).toMatch(/^INT\. BAR - DAY #32#$/m);
    expect(out).not.toMatch(/JUN/);
    expect(out).not.toMatch(/3232/);
  });

  it("strips date annotation written with U+2018 left curly quote", () => {
    const out = fountainFromPdf(
      ["INT. OFFICE - DAY (FEB \u201895)", "", "Action."].join("\n"),
    );
    expect(out).toMatch(/^INT\. OFFICE - DAY$/m);
  });

  it("preserves multi-letter scene-number suffixes (202HA)", () => {
    const out = fountainFromPdf(
      ["INT. BULLPEN - DAY  202HA202HA", "", "Action."].join("\n"),
    );
    expect(out).toMatch(/^INT\. BULLPEN - DAY #202HA#$/m);
  });
});

describe("fountainFromPdf — title page handling", () => {
  it("strips a leading title-page block when it contains marker phrases", () => {
    const out = fountainFromPdf(
      [
        "THE WOLF OF WALL STREET",
        "Written by",
        "Terence Winter",
        "Based on the book by Jordan Belfort",
        "White Shooting Script - September 7th, 2012",
        "",
        "INT. ROOM - DAY",
        "Action line.",
      ].join("\n"),
    );
    expect(out).not.toContain("THE WOLF OF WALL STREET");
    expect(out).not.toMatch(/^\s*Written by\s*$/m);
    expect(out).not.toContain("Shooting Script");
    expect(out).toMatch(/^INT\. ROOM - DAY$/m);
  });

  it("keeps the opening V.O. when there is no title-page marker", () => {
    const out = fountainFromPdf(
      [
        "                                GENE HACKMAN (V.O.)",
        "                  Stratton Oakmont. Stability.",
        "",
        "INT. ROOM - DAY",
      ].join("\n"),
    );
    expect(out).toContain(`${CHARACTER_INDENT}GENE HACKMAN (V.O.)`);
  });
});

describe("fountainFromPdf — alternative heading prefixes", () => {
  it("recognises 'A SERIES OF POLAROIDS' as a scene heading", () => {
    const out = fountainFromPdf(
      [
        "INT. ROOM - DAY",
        "",
        "Action line.",
        "",
        "A SERIES OF POLAROIDS",
        "",
        "First shot description.",
      ].join("\n"),
    );
    expect(out).toMatch(/^A SERIES OF POLAROIDS$/m);
  });

  it("recognises 'MONTAGE - TRAINING' as a scene heading", () => {
    const out = fountainFromPdf(
      ["", "MONTAGE - TRAINING", "", "He runs up stairs."].join("\n"),
    );
    expect(out).toMatch(/^MONTAGE - TRAINING$/m);
  });

  it("recognises bare 'INTERCUT' as a scene heading", () => {
    const out = fountainFromPdf(
      ["", "INTERCUT", "", "Back and forth."].join("\n"),
    );
    expect(out).toMatch(/^INTERCUT$/m);
  });

  it("does not treat mid-sentence 'MONTAGE' as a heading", () => {
    const out = fountainFromPdf("A chaotic MONTAGE of faces rushes by.");
    expect(out).toMatch(/^A chaotic MONTAGE of faces rushes by\.$/m);
  });
});

describe("fountainFromPdf — orphan parentheticals", () => {
  it("re-attaches a parenthetical to the preceding CHARACTER cue after a spurious blank", () => {
    const out = fountainFromPdf(
      ["INT. ROOM - DAY", "", "ANNA", "", "(sotto)", "Hello."].join("\n"),
    );
    // The parenthetical and dialogue must be indented like a dialogue block
    expect(out).toContain(`${CHARACTER_INDENT}ANNA`);
    expect(out).toContain(`${DIALOGUE_INDENT}(sotto)`);
    expect(out).toMatch(new RegExp(`^${DIALOGUE_INDENT}Hello\\.$`, "m"));
  });
});

describe("fountainFromPdf — 08-continueds", () => {
  const out = fountainFromPdf(loadFixture("08-continueds.txt"));

  it("strips '(MORE)' page-break artefact", () => {
    expect(out).not.toMatch(/^\s*\(MORE\)\s*$/m);
  });

  it("strips bare page numbers '12.' and '13.'", () => {
    expect(out).not.toMatch(/^\s*12\.\s*$/m);
    expect(out).not.toMatch(/^\s*13\.\s*$/m);
  });

  it("preserves CEO (CONT'D) character re-introduction after page break", () => {
    expect(out).toContain(`${CHARACTER_INDENT}CEO (CONT'D)`);
  });

  it("preserves EXECUTIVE as character cue", () => {
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}EXECUTIVE$`, "m"));
  });

  it("preserves '(leaning forward)' parenthetical", () => {
    expect(out).toContain(`${DIALOGUE_INDENT}(leaning forward)`);
  });
});
