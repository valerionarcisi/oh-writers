import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fountainFromPdfCoords,
  type CoordLine,
} from "./fountain-from-pdf-coords";
import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(
  HERE,
  "../../../../../../tests/fixtures/screenplays",
);

// The fixture is the reference coordinate extraction: each body line is
// `X=<minX>|<text>`, with `[PAGE]` markers between pages. This mirrors what
// pdf-coords.server.ts produces from the real PDF, so the classifier can be
// tested without a PDF parser.
const loadCoordFixture = (name: string): CoordLine[] => {
  const raw = readFileSync(path.join(FIXTURES, name), "utf8");
  const out: CoordLine[] = [];
  let pendingPage = false;
  for (const line of raw.split("\n")) {
    if (line.trim() === "[PAGE]") {
      pendingPage = true;
      continue;
    }
    const m = line.match(/^X=\s*(\d+)\|(.*)$/);
    if (!m) continue;
    out.push({
      x: Number.parseInt(m[1]!, 10),
      text: m[2]!,
      pageStart: pendingPage,
    });
    pendingPage = false;
  }
  return out;
};

describe("fountainFromPdfCoords — Non fa ridere (real coords)", () => {
  const lines = loadCoordFixture("10-non-fa-ridere-coords.txt");
  const fountain = fountainFromPdfCoords(lines, {
    dropTitlePagePrefix: true,
  })!;
  const out = fountain.split("\n");

  it("derives buckets and produces a non-empty body", () => {
    expect(fountain.length).toBeGreaterThan(0);
  });

  // Ground truth for the page-2 region, taken element-by-element from the
  // rendered PDF. Each entry is the EXACT Fountain line the coord classifier
  // must emit. The leading title-page block (NON FA RIDERE / Written by …) is
  // dropped because a title page was detected.
  const PAGE_2 = [
    "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE #1#",
    'JOHN (35) ha il microfono in mano. È in piedi in un angolo del ristorante adibito a palco. Dietro di lui c\'è un grande striscione con scritto "OPEN GREZZO - UN OPEN MIC PROVINCIALE"',
    `${CHARACTER_INDENT}JOHN`,
    `${DIALOGUE_INDENT}AHAHHAH! Ma tua moglie ancora ti ci vuole a letto? AHAH! Mamma se sci diventato bruttu! AHAH! Nice Nice! Buona serata a tutti siamo qui al Sottoscala pizzeria per una grande serata di Stand Up Comedy!`,
    `${CHARACTER_INDENT}PUBBLICO`,
    `${DIALOGUE_INDENT}Ma che sarria? Stand che?`,
    `${CHARACTER_INDENT}JOHN`,
    `${DIALOGUE_INDENT}Ma poesse che non capisci un cazzu! Allora vi devo spigare tutto! Ci saranno una serie di comici che uno dietro all'altro si esibiranno su questo fantastico palco per farvi ridere e anche pensare... ma che volete pensare voi? Ah lo stupeto!`,
    `${DIALOGUE_INDENT}(risate)`,
    "Vediamo il ristorante fuori, le macchine che passano sulla strada.",
    `${DIALOGUE_INDENT}Allora iniziamo subito con il primo... No le tagliatelle signo', il primo comico! Un grande applauso a Milco Messi.`,
    `${DIALOGUE_INDENT}(applauso)`,
    "FILIPPO (40) è fuori dal locale. Si accende una sigaretta. Sta guardando la locandina dell'\" Open Grezzo: un open-mic provinciale\" appesa fuori dal ristorante. Sulla locandina c'è l'immagine di John.",
    `${CHARACTER_INDENT}FILIPPO`,
    `${DIALOGUE_INDENT}(mimando la voce di una signore)`,
    `${DIALOGUE_INDENT}La pizza la voglio così, la pizza la voglio colà, questa ma senza quello...`,
    `${DIALOGUE_INDENT}(parla normalmente)`,
    `${DIALOGUE_INDENT}Ma vaffanculo è una pizza non una colazione di centrosinistra!`,
    "Sorride.",
    `${CHARACTER_INDENT}TEA (V.O.)`,
  ];

  // Blocks are separated by blank lines in the rendered Fountain (canonical
  // spacing — without it `fountainToDoc` absorbs a flush-left action that
  // follows dialogue into the speech). The ground-truth sequence compares the
  // ELEMENT order, so blanks are filtered here and asserted separately below.
  const nonBlank = out.filter((l) => l !== "");

  it("matches the page-2 element sequence exactly", () => {
    const start = nonBlank.indexOf(PAGE_2[0]!);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(nonBlank.slice(start, start + PAGE_2.length)).toEqual(PAGE_2);
  });

  it("separates blocks with blank lines but keeps dialogue groups glued", () => {
    // dialogue → action: blank line (the BUG the spacing exists to fix —
    // without it the editor renders "Sorride." as part of Filippo's speech).
    expect(fountain).toContain(
      `${DIALOGUE_INDENT}Ma vaffanculo è una pizza non una colazione di centrosinistra!\n\nSorride.`,
    );
    // action → character: blank line; character → dialogue: glued.
    expect(fountain).toContain(
      `Sorride.\n\n${CHARACTER_INDENT}TEA (V.O.)\n${DIALOGUE_INDENT}Filì venni! Corri!`,
    );
    // dialogue → interleaved action and back: blanks on both sides, the
    // resumed speech keeps its dialogue indent.
    expect(fountain).toContain(
      `\n\nVediamo il ristorante fuori, le macchine che passano sulla strada.\n\n${DIALOGUE_INDENT}Allora iniziamo subito`,
    );
  });

  it("emits the scene heading at column 0 with its forced scene number", () => {
    expect(out[0]).toBe(
      "INT/EXT. ANGOLO OPEN GREZZO/FUORI DALLA PORTA - NOTTE #1#",
    );
  });

  it("joins a wrapped parenthetical into a single element", () => {
    expect(fountain).toContain(
      `${DIALOGUE_INDENT}(mimando la voce di una signore)`,
    );
    expect(fountain).not.toContain(
      `${DIALOGUE_INDENT}(mimando la voce di una signore) La pizza`,
    );
  });

  it("drops the right-gutter page numbers", () => {
    expect(out).not.toContain("1.");
    expect(out).not.toContain("2.");
    expect(out).not.toContain("13.");
  });

  it("classifies a name+age line as action, not a character cue", () => {
    // "FILIPPO (40) è fuori dal locale." sits at the ACTION X bucket, so it is
    // action even though it opens with a capitalised name. A real cue ("FILIPPO")
    // sits further right at the CHARACTER bucket.
    expect(fountain).toMatch(/^FILIPPO \(40\) è fuori dal locale\./m);
    expect(fountain).toMatch(new RegExp(`^${CHARACTER_INDENT}FILIPPO$`, "m"));
  });

  it("preserves the (V.O.) extension on a character cue", () => {
    expect(fountain).toContain(`${CHARACTER_INDENT}TEA (V.O.)`);
  });
});

describe("fountainFromPdfCoords — Wolf of Wall Street (real coords)", () => {
  const lines = loadCoordFixture("11-wolf-page-1-2-coords.txt");
  const fountain = fountainFromPdfCoords(lines, {
    dropTitlePagePrefix: true,
  })!;
  const out = fountain.split("\n");

  it("classifies the shooting script via the coordinate path", () => {
    expect(fountain).not.toBeNull();
    expect(fountain.length).toBeGreaterThan(0);
  });

  // Ground truth for page 1–2, element-by-element from the rendered PDF. The
  // left scene-number gutter is peeled to scene headings with the `#N#` forced
  // number, GENE HACKMAN / JORDAN are character cues (6-space), their lines are
  // dialogue (10-space), and the descriptive prose is flush-left action. The
  // title-page block (THE WOLF OF WALL STREET / revision banners) is dropped.
  const PAGE_1_2 = [
    "INSERT - TV COMMERCIAL - DAY #1#",
    "Over jungle sound effects, the CAMERA is low, moving through brush from the POV of a stalking animal.  As the brush parts, revealing Wall Street and the New York Stock Exchange, we HEAR the resonant voice of GENE HACKMAN.",
    `${CHARACTER_INDENT}GENE HACKMAN (V.O.)`,
    `${DIALOGUE_INDENT}The world of investing can be a jungle.`,
    "WE SEE A CHARGING, SNORTING BULL. #1A#",
    `${CHARACTER_INDENT}GENE HACKMAN (V.O.)`,
    `${DIALOGUE_INDENT}Bulls.`,
    "WE SEE A FEROCIOUS, GROWLING BEAR. #1B#",
    `${CHARACTER_INDENT}GENE HACKMAN (V.O.)`,
    `${DIALOGUE_INDENT}Bears.  Danger at every turn.`,
    "Pretentious CLASSICAL MUSIC kicks in.",
    `${CHARACTER_INDENT}GENE HACKMAN (V.O.)`,
    `${DIALOGUE_INDENT}That’s why we at Stratton Oakmont pride ourselves on being the best.`,
  ];

  it("matches the page 1–2 element sequence exactly", () => {
    const nonBlank = out.filter((l) => l !== "");
    expect(nonBlank.slice(0, PAGE_1_2.length)).toEqual(PAGE_1_2);
  });

  it("emits scene headings with their fused gutter number as #N#", () => {
    expect(out[0]).toBe("INSERT - TV COMMERCIAL - DAY #1#");
    expect(fountain).toContain("INT. STRATTON OAKMONT III - BULLPEN - DAY #2#");
    expect(fountain).toContain("WE SEE A CHARGING, SNORTING BULL. #1A#");
  });

  it("classifies GENE HACKMAN and JORDAN as character cues", () => {
    expect(fountain).toContain(`${CHARACTER_INDENT}GENE HACKMAN (V.O.)`);
    expect(fountain).toMatch(new RegExp(`^${CHARACTER_INDENT}JORDAN$`, "m"));
  });

  it("drops the running headers / revision banners and the educational footer", () => {
    expect(fountain).not.toContain("Buff Revised Pages");
    expect(fountain).not.toContain("Shooting Script");
    expect(fountain).not.toMatch(/Revised Pages/);
    expect(fountain).not.toMatch(/sellingyourscreenplay/);
  });
});

describe("fountainFromPdfCoords — Thirteen Days (flush-left, real coords)", () => {
  // Thirteen Days reports EVERY line at the same X transform (72) and encodes
  // element indentation as LEADING SPACES inside the text run. The coord
  // extractor folds those leading spaces into the effective X (SPACE_UNIT), so
  // this flush-left script arrives with distinct levels: action 84, dialogue 96,
  // character 120, transition 156. The fixture is the real first-two-pages
  // extraction. It exercises: (a) a slugline is a scene heading by SHAPE even at
  // the action margin (no separate scene gutter), (b) a blank line is a
  // paragraph break so action beats don't run together and dialogue doesn't
  // bleed into the following action, (c) positional level mapping still places
  // cues/dialogue/transitions correctly.
  const lines = loadCoordFixture("12-thirteen-days-coords.txt");
  const fountain = fountainFromPdfCoords(lines, { dropTitlePagePrefix: true });

  it("accepts the flush-left layout (coord path, not text fallback)", () => {
    expect(fountain).not.toBeNull();
  });

  it("detects sluglines as scene headings even at the action margin", () => {
    expect(fountain).toContain("EXT. STRATOSPHERE - DAY");
    expect(fountain).toContain("INT. O'DONNELL BEDROOM - DAY");
  });

  it("keeps blank-separated action beats as distinct paragraphs", () => {
    const out = fountain!.split("\n");
    expect(out).toContain(
      "          SUPER: FLIGHT G-3101. OCTOBER 14TH, 1962. OVER CUBA.",
    );
    // The dawn description and the SUPER beat must NOT be glued into one line.
    expect(fountain).not.toContain("edge of land. SUPER: FLIGHT");
  });

  it("does not bleed dialogue into the following action", () => {
    expect(fountain).toMatch(
      new RegExp(`^${DIALOGUE_INDENT}Mark, get off your father!$`, "m"),
    );
    expect(fountain).not.toContain("father! Kenny sits up");
  });

  it("classifies character cues and transitions", () => {
    expect(fountain).toMatch(
      new RegExp(`^${CHARACTER_INDENT}HELEN \\(O\\.S\\.\\)$`, "m"),
    );
    expect(fountain).toContain("MATCH CUT TO:");
  });
});

describe("fountainFromPdfCoords — fallback", () => {
  it("returns null when no usable X buckets exist", () => {
    const lines: CoordLine[] = [
      { x: 100, text: "just one line", pageStart: true },
    ];
    expect(fountainFromPdfCoords(lines)).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(fountainFromPdfCoords([])).toBeNull();
  });

  // Build `count` body lines clustered at the given X, with plausible all-caps
  // / prose text so text-shape checks don't accidentally rescue a bad layout.
  const linesAt = (x: number, count: number, upper = false): CoordLine[] =>
    Array.from({ length: count }, (_, i) => ({
      x,
      text: upper ? `NAME ${i}` : `body text line ${i}`,
      pageStart: false,
    }));

  it("accepts a shooting-script scene-number gutter (Wolf-shaped X distribution)", () => {
    // Reproduces The-Wolf-of-Wall-Street.pdf's measured dominant levels: a
    // left scene-number gutter (47) whose lines begin with a fused scene number,
    // an action margin (126), a dialogue column (191), a sparse parenthetical
    // (233), and a character cue column (297). The gutter is peeled as the scene
    // level and the remaining columns map positionally, so the coordinate path
    // now classifies this layout instead of deferring to the text path.
    const gutter = (x: number, count: number): CoordLine[] =>
      Array.from({ length: count }, (_, i) => ({
        x,
        text: `${i + 1}INT. ROOM ${i} - DAY${i + 1}`,
        pageStart: false,
      }));
    const lines: CoordLine[] = [
      ...gutter(47, 290),
      ...linesAt(126, 1278),
      ...linesAt(191, 2910),
      ...linesAt(233, 140),
      ...linesAt(297, 1038, true),
    ];
    expect(fountainFromPdfCoords(lines)).not.toBeNull();
  });

  it("rejects a layout whose X is scattered across many weak levels", () => {
    // Evenly-spaced columns with no dominant action→dialogue jump are scatter,
    // not a screenplay: there are far more than the four canonical body columns
    // and no wide dialogue indent. The gate rejects so the text path takes over.
    const lines: CoordLine[] = [];
    for (let x = 40; x <= 360; x += 16) lines.push(...linesAt(x, 6));
    expect(fountainFromPdfCoords(lines)).toBeNull();
  });

  it("rejects a flat single-column extraction (No Country-shaped)", () => {
    // Everything at one X (no separable dialogue/character) — the deterministic
    // text path must handle it instead.
    const lines = linesAt(18, 4126);
    expect(fountainFromPdfCoords(lines)).toBeNull();
  });

  it("accepts a clean five-column screenplay layout", () => {
    // scene / action / dialogue / parenthetical / character, with the canonical
    // wide action→dialogue jump and strong counts at each column.
    const lines: CoordLine[] = [
      { x: 78, text: "INT. ROOM - DAY", pageStart: true },
      { x: 78, text: "INT. HALL - NIGHT", pageStart: false },
      ...linesAt(108, 120),
      ...linesAt(180, 300),
      ...linesAt(216, 40),
      ...linesAt(252, 90, true),
    ];
    expect(fountainFromPdfCoords(lines)).not.toBeNull();
  });
});
