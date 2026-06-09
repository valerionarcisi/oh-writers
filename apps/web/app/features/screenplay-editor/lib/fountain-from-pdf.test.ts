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

// BUG: a page break can fall between a CHARACTER cue and its dialogue. pdf-parse
// emits the cue as the last line of one page and the dialogue as the first line
// of the next, with page junk (a bare page number, blank lines, the running
// header) in between. Cleanup strips the page number down to a stray blank,
// which used to reset the dialogue block and drop the spoken line to action —
// the dialogue was lost / mis-classified. The cue→dialogue association must now
// survive the intervening blank.
describe("fountainFromPdf — dialogue across a page break", () => {
  it("attaches dialogue to the cue when a bare page number sits between them", () => {
    const out = fountainFromPdf(
      ["TEA (V.O.)", "", "2.", "Filì venni! Corri!"].join("\n"),
    );
    expect(out).toMatch(
      new RegExp(`^${CHARACTER_INDENT}TEA \\(V\\.O\\.\\)$`, "m"),
    );
    expect(out).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Filì venni! Corri!$`, "m"),
    );
    expect(out).not.toMatch(/^Filì venni! Corri!$/m);
  });

  it("attaches dialogue to the cue across a single stray blank line", () => {
    const out = fountainFromPdf(["TEA", "", "Filì venni! Corri!"].join("\n"));
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}TEA$`, "m"));
    expect(out).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Filì venni! Corri!$`, "m"),
    );
  });
});

// A page break in a blank-less import is a BLANK line immediately followed by a
// bare page number. Cleanup strips the number but used to leave the blank — a
// page-break artefact that classify reads as a paragraph separator, splitting a
// paragraph (action or dialogue) that spans the boundary. The page-break blank
// is now collapsed, so the wrap-join keeps the paragraph whole across the break.
describe("fountainFromPdf — paragraph wrap-join across a page break", () => {
  it("rejoins a wrapped action paragraph split by a page break into one line", () => {
    const out = fountainFromPdf(
      [
        "A wrapped action line that continues ",
        "",
        "5.",
        "across the page boundary.",
      ].join("\n"),
    );
    expect(out).toBe(
      "A wrapped action line that continues across the page boundary.",
    );
    expect(out).not.toMatch(/^\s*$/m);
    expect(out).not.toMatch(/^\s*5\.\s*$/m);
  });

  it("keeps a cue's dialogue continuation attached across a page break", () => {
    const out = fountainFromPdf(
      [
        "JOHN",
        "Comincio a parlare e poi ",
        "",
        "6.",
        "continuo dopo la pagina.",
      ].join("\n"),
    );
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}JOHN$`, "m"));
    expect(out).toMatch(
      new RegExp(
        `^${DIALOGUE_INDENT}Comincio a parlare e poi continuo dopo la pagina\\.$`,
        "m",
      ),
    );
    expect(out).not.toMatch(/^continuo dopo la pagina\.$/m);
  });
});

describe("fountainFromPdf — 09-no-blank-separators (TEA page break)", () => {
  const out = fountainFromPdf(loadFixture("09-no-blank-separators.txt"));

  it("keeps TEA (V.O.) as a character cue", () => {
    expect(out).toContain(`${CHARACTER_INDENT}TEA (V.O.)`);
  });

  it("attaches 'Filì venni! Corri!' as TEA's dialogue, not action", () => {
    expect(out).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Filì venni! Corri!$`, "m"),
    );
    expect(out).not.toMatch(/^Filì venni! Corri!$/m);
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

// BUG-N51: a tidy PDF (Non fa ridere) where pdf-parse stripped ALL blank-line
// separators between elements. The classic cue rule (needs a preceding blank)
// tagged every short ALL-CAPS cue as action, so the whole scene became one
// undifferentiated action run. The relaxed cue rule must recover cues without a
// preceding blank when the line is short + cue-shaped and doesn't follow a cue.
describe("fountainFromPdf — blank-less import (no separators between elements)", () => {
  const pdf = [
    "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE11",
    "JOHN (35) ha il microfono in mano. È in piedi in un angolo",
    "del ristorante adibito a palco.",
    "JOHN",
    "AHAHHAH! Ma tua moglie ancora ti ci",
    "vuole a letto?",
    "PUBBLICO",
    "Ma che sarria? Stand che?",
  ].join("\n");
  const out = fountainFromPdf(pdf);

  it("recovers a character cue with no preceding blank", () => {
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}JOHN$`, "m"));
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}PUBBLICO$`, "m"));
  });

  it("classifies the lines under a recovered cue as dialogue, not action", () => {
    expect(out).toMatch(
      new RegExp(
        `^${DIALOGUE_INDENT}AHAHHAH! Ma tua moglie ancora ti ci$`,
        "m",
      ),
    );
    expect(out).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Ma che sarria\\? Stand che\\?$`, "m"),
    );
  });

  it("keeps the scene-opening description (before the first cue) as action", () => {
    // "JOHN (35) ha il microfono..." is a long mixed-case line — action, not a cue.
    expect(out).toMatch(/^JOHN \(35\) ha il microfono/m);
  });

  it("does NOT mis-tag a long ALL-CAPS line as a cue without a blank", () => {
    const longCaps = [
      "Some action here.",
      "THIS IS A VERY LONG ALL CAPS LINE THAT IS NOT A CHARACTER NAME AT ALL",
    ].join("\n");
    const o = fountainFromPdf(longCaps);
    expect(o).not.toMatch(
      new RegExp(`^${CHARACTER_INDENT}THIS IS A VERY`, "m"),
    );
  });
});

// BUG-N50/N-51 follow-up: on a blank-less import the PDF column hard-wraps a
// logical paragraph across several visual lines. A wrapped line ends with a
// trailing space; a paragraph the writer ended with a return does not. The
// wrap-join rejoins continuation lines using that signal WITHOUT fusing
// distinct paragraphs and never crosses a cue/heading/parenthetical boundary.
// The join only activates for blank-less imports (few blanks); blank-separated
// scripts keep their per-line output (covered by 03/06 above).
describe("fountainFromPdf — wrap-join on blank-less imports", () => {
  // Trailing space = soft wrap; bare end = paragraph return. No blanks.
  const wrap = (...lines: string[]): string => lines.join("\n");

  it("rejoins a wrapped ACTION paragraph into one logical line", () => {
    const out = fountainFromPdf(
      wrap(
        "INT. ROOM - NOTTE",
        "JOHN ha il microfono in mano. È in piedi in un angolo ",
        "del ristorante adibito a palco. Dietro di lui c'è un ",
        "grande striscione con scritto OPEN GREZZO.",
      ),
    );
    expect(out).toMatch(
      /^JOHN ha il microfono in mano\. È in piedi in un angolo del ristorante adibito a palco\. Dietro di lui c'è un grande striscione con scritto OPEN GREZZO\.$/m,
    );
  });

  it("rejoins a wrapped DIALOGUE paragraph into one logical line", () => {
    const out = fountainFromPdf(
      wrap(
        "INT. ROOM - NOTTE",
        "JOHN",
        "AHAHHAH! Ma tua moglie ancora ti ci ",
        "vuole a letto? AHAH! Mamma se sci ",
        "diventato bruttu! AHAH! Nice Nice!",
      ),
    );
    expect(out).toMatch(
      new RegExp(
        `^${DIALOGUE_INDENT}AHAHHAH! Ma tua moglie ancora ti ci vuole a letto\\? AHAH! Mamma se sci diventato bruttu! AHAH! Nice Nice!$`,
        "m",
      ),
    );
  });

  it("does NOT over-merge two distinct paragraphs separated by a return", () => {
    // Each first line ends WITHOUT a trailing space → it is a paragraph break,
    // so the two short action lines must stay separate logical lines.
    const out = fountainFromPdf(
      wrap("INT. ROOM - NOTTE", "Sorride.", "Si alza e se ne va."),
    );
    expect(out).toMatch(/^Sorride\.$/m);
    expect(out).toMatch(/^Si alza e se ne va\.$/m);
    expect(out).not.toMatch(/^Sorride\. Si alza/m);
  });

  it("keeps a character cue separate from its wrapped dialogue", () => {
    const out = fountainFromPdf(
      wrap(
        "INT. ROOM - NOTTE",
        "Action che riempie la riga e va a capo da sola qui ",
        "perché è lunga.",
        "FILIPPO",
        "Una battuta che riempie la riga e prosegue ",
        "sulla riga successiva.",
      ),
    );
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}FILIPPO$`, "m"));
    // The cue must not be swallowed into the preceding action paragraph.
    expect(out).not.toMatch(/perché è lunga\. FILIPPO/);
  });

  it("rejoins a word hyphenated across a wrap without a stray space", () => {
    const out = fountainFromPdf(
      wrap(
        "INT. ROOM - NOTTE",
        "Guarda la locandina dell'open- ",
        "mic provinciale appeso fuori.",
      ),
    );
    expect(out).toMatch(/open-mic provinciale/);
    expect(out).not.toMatch(/open- mic/);
  });
});

// BUG-N51 follow-up: on a blank-less import nothing closes a dialogue block
// until the next cue, so (a) standalone parentheticals between dialogue lines
// were mis-tagged and (b) Italian stage directions after a cue's speech were
// swallowed as dialogue. A parenthetical adjacent to dialogue must stay a
// parenthetical; third-person narration must return to action.
describe("fountainFromPdf — blank-less parentheticals stay parenthetical", () => {
  it("tags '(risate)' between dialogue lines as parenthetical, never a character cue", () => {
    const out = fountainFromPdf(
      [
        "INT. ROOM - NOTTE",
        "JOHN",
        "Una battuta.",
        "(risate)",
        "Un'altra battuta.",
      ].join("\n"),
    );
    expect(out).toMatch(new RegExp(`^${DIALOGUE_INDENT}\\(risate\\)$`, "m"));
    // Never indented as a 6-space character cue.
    expect(out).not.toMatch(
      new RegExp(`^${CHARACTER_INDENT}\\(risate\\)$`, "m"),
    );
    // Never left flush-left as action.
    expect(out).not.toMatch(/^\(risate\)$/m);
  });

  it("keeps a parenthetical adjacent to dialogue without dropping to action", () => {
    const out = fountainFromPdf(
      ["INT. ROOM - NOTTE", " JOHN", "Battuta.", "(applauso)"].join("\n"),
    );
    expect(out).toMatch(new RegExp(`^${DIALOGUE_INDENT}\\(applauso\\)$`, "m"));
  });
});

describe("fountainFromPdf — blank-less narration returns to action", () => {
  it("returns to action on a 'Vediamo …' narration line after dialogue", () => {
    const out = fountainFromPdf(
      [
        "INT. ROOM - NOTTE",
        "JOHN",
        "Una battuta.",
        "Vediamo Milco esibirsi.",
      ].join("\n"),
    );
    expect(out).toMatch(/^Vediamo Milco esibirsi\.$/m);
    expect(out).not.toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Vediamo Milco esibirsi\\.$`, "m"),
    );
  });

  it("returns to action on a 'NAME (age) + lowercase' line after dialogue", () => {
    const out = fountainFromPdf(
      [
        "INT. ROOM - NOTTE",
        "JOHN",
        "Una battuta.",
        "FILIPPO (40) è fuori dal locale. Si accende una sigaretta.",
      ].join("\n"),
    );
    expect(out).toMatch(
      /^FILIPPO \(40\) è fuori dal locale\. Si accende una sigaretta\.$/m,
    );
    expect(out).not.toMatch(
      new RegExp(`^${DIALOGUE_INDENT}FILIPPO \\(40\\)`, "m"),
    );
  });

  it("returns to action when a known character is named in the third person", () => {
    const out = fountainFromPdf(
      [
        "INT. ROOM - NOTTE",
        "FILIPPO",
        "Una battuta.",
        "Filippo viene intercettato da un tavolo di vecchie.",
      ].join("\n"),
    );
    expect(out).toMatch(
      /^Filippo viene intercettato da un tavolo di vecchie\.$/m,
    );
    expect(out).not.toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Filippo viene intercettato`, "m"),
    );
  });

  it("does NOT pull a real spoken line into action (under-correct, never shred)", () => {
    const out = fountainFromPdf(
      [
        "INT. ROOM - NOTTE",
        "JOHN",
        "Allora iniziamo subito con il primo.",
      ].join("\n"),
    );
    expect(out).toMatch(
      new RegExp(
        `^${DIALOGUE_INDENT}Allora iniziamo subito con il primo\\.$`,
        "m",
      ),
    );
  });

  it("still classifies a normal cue + dialogue correctly", () => {
    const out = fountainFromPdf(
      ["INT. ROOM - NOTTE", "ANNA", "Ciao, come stai?"].join("\n"),
    );
    expect(out).toMatch(new RegExp(`^${CHARACTER_INDENT}ANNA$`, "m"));
    expect(out).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Ciao, come stai\\?$`, "m"),
    );
  });
});

describe("fountainFromPdf — 09 fixture regression (parenthetical + action)", () => {
  const out = fountainFromPdf(loadFixture("09-no-blank-separators.txt"));

  it("tags JOHN's '(risate)' parenthetical, not as a character cue", () => {
    expect(out).toMatch(new RegExp(`^${DIALOGUE_INDENT}\\(risate\\)$`, "m"));
    expect(out).not.toMatch(
      new RegExp(`^${CHARACTER_INDENT}\\(risate\\)$`, "m"),
    );
    expect(out).not.toMatch(
      new RegExp(`^${CHARACTER_INDENT}\\(applauso\\)$`, "m"),
    );
  });

  it("returns the four narration lines to action after dialogue", () => {
    expect(out).toMatch(
      /^Filippo entra nel locale, la camera lo segue\. Scorgiamo la sagoma del NONNO \(80\) sfilargli dietro\.$/m,
    );
    expect(out).toMatch(/^Vediamo Milco esibirsi\.$/m);
    expect(out).toMatch(
      /^Filippo viene intercettato da un tavolo di vecchie\.$/m,
    );
    expect(out).toMatch(/^FILIPPO \(40\) è fuori dal locale\./m);
  });
});
