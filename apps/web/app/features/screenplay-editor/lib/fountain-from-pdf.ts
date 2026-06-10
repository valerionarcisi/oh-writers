import { CHARACTER_INDENT, DIALOGUE_INDENT } from "./fountain-constants";

type ElementType =
  | "scene_heading"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "action"
  | "blank";

interface Classified {
  type: ElementType;
  text: string;
  // True when the source line was soft-wrapped by the PDF's column width —
  // i.e. it ended with a trailing space because the text filled the line and
  // continued on the next one. A line the writer ended with a return (a real
  // paragraph break) carries no trailing space. Used by the wrap-join pass to
  // rejoin continuation lines without fusing distinct paragraphs.
  wrapped: boolean;
}

// ─── Pass 1 — Cleanup ────────────────────────────────────────────────────────
//
// Strip production annotations (scene numbers, page numbers, revision marks,
// date stamps, "Buff Revised Pages" headers) that leak in from shooting-script
// PDFs. Each rule is anchored to start- or end-of-line — never rewrites text
// inside a line.

const BUFF_HEADER_RE = /Buff\s+Revised\s+Pages/i;
const BARE_PAGE_NUMBER_RE = /^\s*\d+\.\s*$/;
const MORE_CONTINUATION_RE = /^\s*\(MORE\)\s*$/i;

// A title-page draft-history banner: "<Colour> Revised Pages - <date>",
// "White Shooting Script - <date>". These sit on the cover page of a shooting
// script and pollute the X histogram (the coordinate path sees the whole doc,
// title page included). Anchored to the start and requiring a trailing date so
// it never matches body action that merely mentions a draft.
const REVISION_BANNER_RE =
  /^[A-Za-z ]*(?:Revised\s+Pages|Shooting\s+Script)\s*[-–—]\s*\w+\s+\d/i;

// A running header / revision-page banner that pollutes the X histogram on a
// shooting script: the title-plus-revision line ("The Wolf of Wall Street
// Buff Revised Pages 3/5/13 10."), the cover-page draft history, and the
// distribution footer. Exported so the coordinate path can drop the same noise
// by content before bucketing.
export const isPageFurniture = (raw: string): boolean =>
  BUFF_HEADER_RE.test(raw) ||
  REVISION_BANNER_RE.test(raw) ||
  BARE_PAGE_NUMBER_RE.test(raw) ||
  MORE_CONTINUATION_RE.test(raw) ||
  FOOTER_URL_RE.test(raw) ||
  FOOTER_BOILERPLATE_RE.test(raw);
// Accepted quote-like characters in shooting-script date stamps: backtick,
// straight apostrophe, and both curly single quotes (U+2018, U+2019).
const QUOTE_CLASS = "[`'\u2018\u2019]?";
// Date annotations like "(FEB `95)", "(MAR '90)", "(1969)" — accept both
// straight/curly quotes, backticks, or bare 4-digit years.
const DATE_ANNOTATION_STANDALONE_RE = new RegExp(
  `^\\s*\\((?:[A-Z]+\\s*${QUOTE_CLASS}\\s*\\d{2,4}|\\d{4})\\)\\s*$`,
);
// Standalone scene-number + asterisk fragments like "* 42", "*46A".
const STANDALONE_ASTERISK_FRAGMENT_RE = /^\s*\*+\s*\d*[A-Z]?\s*$/;
// Distribution footers baked into pirate / educational script scans
// (e.g. sellingyourscreenplay.com). Pdf-parse keeps it on a single line
// so any line containing a URL is treated as footer boilerplate.
const FOOTER_URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const FOOTER_BOILERPLATE_RE =
  /Script\s+provided\s+for\s+educational|More\s+scripts\s+can\s+be\s+found/i;

// Scene-number token: "1", "42A", "202HA", "3-3B". Allow 0+ letters because
// shooting scripts use multi-letter suffixes ("202HA", "235B").
const NUM = /\d+[A-Z]*(?:-\d+[A-Z]*)?/;

interface CleanedLine {
  text: string;
  number: string | null;
}

// Strip a leading scene number ("1F   ...") and capture it. The number
// must be followed by 2+ spaces to distinguish it from a digit that happens
// to start an action line.
const extractLeadingSceneNumber = (
  line: string,
): { line: string; number: string | null } => {
  const m = line.match(new RegExp(`^\\s*(${NUM.source})\\s{2,}`));
  if (!m) return { line, number: null };
  return { line: line.slice(m[0].length), number: m[1]! };
};

const DATE_ANNOTATION_INLINE_RE = new RegExp(
  `\\s*\\([A-Z]+\\s*${QUOTE_CLASS}\\s*\\d{2,4}\\)\\s*$`,
);
export const stripDateAnnotationFromSlugline = (line: string): string =>
  line.replace(DATE_ANNOTATION_INLINE_RE, "");

// Trailing shooting-script noise: revision asterisks, scene numbers, and
// pdf-parse concatenation artefacts where the left/right gutter numbers
// stick directly to the action text ("BULL.1A1A"). Applied iteratively
// until stable; captures a scene number when it finds one.
const extractTrailingNoise = (
  line: string,
): { line: string; number: string | null } => {
  let current = line;
  let number: string | null = null;
  let prev: string;
  const take = (n: string) => {
    if (number === null) number = n;
  };
  do {
    prev = current;
    // Strip trailing revision asterisks whether or not whitespace precedes.
    // Covers both "No, not   *" and "(JUN '88)3232*" where a gutter number
    // is fused to a date annotation with the asterisk at the very end.
    current = current.replace(/\*+\s*$/, "");
    // Fused duplicated scene number ("BULL.1A1A" → "BULL." + "1A",
    // "   139139" → "   139" + "139"). Runs FIRST so the greedy NUM in
    // m1 below doesn't swallow both copies as a single token.
    const m3 = current.match(new RegExp(`(${NUM.source})\\1\\s*$`));
    if (m3) {
      take(m3[1]!);
      current = current.slice(0, m3.index);
    }
    const m1 = current.match(new RegExp(`\\s{2,}(${NUM.source})\\s*$`));
    if (m1) {
      take(m1[1]!);
      current = current.slice(0, m1.index);
    }
    const m2 = current.match(new RegExp(`\\s+\\*+\\s*(${NUM.source})\\s*$`));
    if (m2) {
      take(m2[1]!);
      current = current.slice(0, m2.index);
    }
  } while (current !== prev);
  return { line: current, number };
};

// Title-page markers — when the document opens with a block containing any
// of these hallmarks, we strip the entire leading block up to the first
// blank line. This handles pirated / educational distributions whose opening
// page is a colophon (title + credits + draft history + URL), while leaving
// openings that start with a real character cue (like the Wolf fixture's
// "GENE HACKMAN (V.O.)") untouched.
const TITLE_PAGE_MARKER_RE =
  /^(Written\s+by|Based\s+on|Screenplay\s+by|Story\s+by|Adapted\s+by|Shooting\s+Script|Revised\s+Pages|First\s+Draft|Final\s+Draft|Script\s+provided\s+for)\b/i;

// Pattern for "first real content" lines that indicate the story is starting:
// a scene heading ("INT. …") or the canonical "FADE IN:" opening transition.
const STORY_START_RE = /^(INT\.|EXT\.|EST\.|I\/E|INSERT|FADE IN:)/i;

const findTitlePageEnd = (rawLines: readonly string[]): number => {
  const SCAN_LIMIT = 60;
  let firstStoryLine = -1;
  let markerSeen = false;
  for (let i = 0; i < rawLines.length && i < SCAN_LIMIT; i++) {
    const trimmed = rawLines[i]!.trim();
    if (trimmed === "") continue;
    if (TITLE_PAGE_MARKER_RE.test(trimmed)) markerSeen = true;
    if (STORY_START_RE.test(trimmed)) {
      firstStoryLine = i;
      break;
    }
  }
  if (!markerSeen || firstStoryLine === -1) return 0;
  return firstStoryLine;
};

const cleanup = (rawLines: readonly string[]): CleanedLine[] => {
  const out: CleanedLine[] = [];
  const titleEnd = findTitlePageEnd(rawLines);
  for (let i = titleEnd; i < rawLines.length; i++) {
    const raw = rawLines[i]!;
    if (BUFF_HEADER_RE.test(raw)) continue;
    if (BARE_PAGE_NUMBER_RE.test(raw)) {
      // A blank-less PDF emits each page break as a BLANK line immediately
      // followed by a bare page number. Dropping only the number leaves the
      // blank, which downstream reads as a paragraph separator: it closes a
      // dialogue block and interrupts the wrap-join run, so a paragraph that
      // spans the page boundary gets split. Collapse that page-break blank so
      // the break is invisible to classify/join. Only the blank directly
      // preceding the number is removed — other blanks are untouched.
      const last = out[out.length - 1];
      if (last !== undefined && last.text.trim() === "") out.pop();
      continue;
    }
    if (MORE_CONTINUATION_RE.test(raw)) continue;
    if (DATE_ANNOTATION_STANDALONE_RE.test(raw)) continue;
    if (STANDALONE_ASTERISK_FRAGMENT_RE.test(raw)) continue;
    if (FOOTER_URL_RE.test(raw)) continue;
    if (FOOTER_BOILERPLATE_RE.test(raw)) continue;

    const trailing = extractTrailingNoise(raw);
    const leading = extractLeadingSceneNumber(trailing.line);
    const text = stripDateAnnotationFromSlugline(leading.line);
    const number = leading.number ?? trailing.number;
    out.push({ text, number });
  }
  return out;
};

// ─── Pass 2 — Classify ───────────────────────────────────────────────────────

// Accept English (INT./EXT.), Italian (INT./EST.), and slug-like INSERT.
// Lookahead for whitespace-or-EOL instead of \b — a trailing "." is not a
// word char so \b would never trigger for "INT." / "EXT." / "EST.".
export const SCENE_HEADING_RE =
  /^(INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E|INSERT)(?=\s|$)/i;

// Alternative structural sluglines — scene-level groupings that screenwriters
// use in place of a full INT./EXT. heading. Accepted only on ALL-CAPS, full-line
// matches at a blank-line boundary, so mid-sentence uses stay action.
const ALT_HEADING_RE =
  /^(A\s+SERIES\s+OF\s+[A-ZÀ-Ý0-9 '\-–—]+|SERIES\s+OF\s+SHOTS(?:\s*[-–—:]\s*.+)?|MONTAGE(?:\s*[-–—:]\s*.+)?|INTERCUT(?:\s*[-–—:]\s*.+)?|FLASHBACK(?:\s*[-–—:]\s*.+)?)$/;

// Transitions: ALL-CAPS phrase ending with TO:, IN:, OUT., or specific
// recognised phrases (CUT TO BLACK., FADE TO BLACK., DISSOLVENZA A NERO.).
export const TRANSITION_RE =
  /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 ]*(?:TO:|IN:|OUT\.|TO BLACK\.|A NERO\.)\s*$/;

const PARENTHETICAL_RE = /^\s*\(.+\)\s*$/;

const isAllUppercase = (text: string): boolean => {
  if (!/[A-ZÀ-Ý]/.test(text)) return false;
  return text === text.toUpperCase();
};

// Longest a bare character cue can be before we stop trusting it as a cue
// without a preceding blank (a longer ALL-CAPS line is more likely an action
// fragment or a shout in dialogue than a name).
const MAX_BLANKLESS_CUE_LEN = 38;

// Is this line shaped like a character cue (ALL CAPS, name-like, optional
// extensions) — independent of whether a blank precedes it?
const looksLikeCue = (trimmed: string): boolean => {
  if (trimmed.length === 0) return false;
  if (SCENE_HEADING_RE.test(trimmed)) return false;
  if (TRANSITION_RE.test(trimmed)) return false;
  if (!isAllUppercase(trimmed)) return false;
  // strip trailing parenthetical extensions iteratively — handles compound
  // cases like "JORDAN (V.O.) (CONT'D)" where two parens need peeling off.
  let core = trimmed;
  while (/\s*\([^)]*\)\s*$/.test(core)) {
    core = core.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  if (core.length === 0) return false;
  if (/[.!?,:;]$/.test(core)) return false;
  // core must be "name-like": letters, digits, spaces, #, -, '
  if (!/^[A-ZÀ-Ý0-9 #\-']+$/.test(core)) return false;
  return true;
};

// Character cue. The classic rule needs a preceding blank line. Many real
// exports (pdf-parse on a tidy PDF) strip ALL blank separators, so we also
// accept a cue WITHOUT a preceding blank when it is a SHORT, cue-shaped line
// and the previous emitted line was itself NOT a cue (a cue never directly
// follows another cue — that second line is the first one's dialogue). This
// recovers character cues in blank-less imports without mis-tagging a wrapped
// ALL-CAPS action fragment (which is long, so the length cap rejects it).
const isCharacterCue = (
  trimmed: string,
  prevBlank: boolean,
  prevType: ElementType | null,
): boolean => {
  if (!looksLikeCue(trimmed)) return false;
  if (prevBlank) return true;
  if (prevType === "character" || prevType === "parenthetical") return false;
  return trimmed.length <= MAX_BLANKLESS_CUE_LEN;
};

// Shot-slug openers — when they appear mid-dialogue block, they're a hint
// that we've returned to action (common in shooting-script imports where
// the blank line between dialogue and the next shot got eaten).
const SHOT_SLUG_RE =
  /^(WE\s+SEE|CAMERA\b|ANGLE\s+ON|BACK\s+TO|INTERCUT\b|MONTAGE\b|SERIES\s+OF|VARIOUS\s+SHOTS|CLOSE\s+ON|CUT\s+TO|PUSH\s+IN|PULL\s+OUT|FROM\b)/i;

// Italian narration verbs that open a stage direction in the first-person-
// plural observer voice ("Vediamo …", "Scorgiamo …"). Used ONLY to recover
// action from inside a dialogue block on a blank-less import, where nothing
// else closes the block. Kept to camera/observer verbs so a real spoken line
// is never pulled into action. Anchored to the start, case-sensitive on the
// capital so a mid-sentence "vediamo" inside dialogue is not matched.
const NARRATION_OPENER_RE =
  /^(Vediamo|Vedo|Scorgiamo|Sentiamo|Si\s+vede|Si\s+vedono|Si\s+sente|Si\s+sentono)\b/;

// A character name announced in the third person with an age tag immediately
// followed by lowercase narration ("FILIPPO (40) è fuori dal locale.",
// "GUILIO (60) indossa …"). A bare cue is just "NAME" or "NAME (V.O.)" — the
// lowercase word right after the parenthetical age is what marks this as a
// stage direction, not a cue.
const NAME_AGE_NARRATION_RE = /^[A-ZÀ-Ý][A-ZÀ-Ý'#\- ]*\(\d{1,3}\)\s+\p{Ll}/u;

// Build the lowercase set of character names seen so far so a line that opens
// by naming one of them in the third person ("Filippo entra …", "FILIPPO (40)
// è fuori …") can be recovered as narration. We register the cue's leading
// name token (before any extension/age parenthetical), lowercased.
const cueNameToken = (cue: string): string | null => {
  const m = cue.match(/^([A-ZÀ-Ý0-9'#\-]+)/);
  if (!m) return null;
  return m[1]!.toLowerCase();
};

// A line that opens by naming a known character (in any case) and continues
// with a lowercase word is third-person narration about that character, not
// their speech — "Filippo entra nel locale …", "Filippo viene intercettato …".
// Conservative on purpose: it fires only for names already introduced as cues,
// so a spoken line that merely happens to start with a capitalised word is
// left as dialogue.
const namesThirdPersonNarration = (
  trimmed: string,
  knownNames: ReadonlySet<string>,
): boolean => {
  const m = trimmed.match(/^([A-Za-zÀ-ÿ'#\-]+)(?:\s+\(\d{1,3}\))?\s+(\p{Ll})/u);
  if (!m) return false;
  return knownNames.has(m[1]!.toLowerCase());
};

// Does this line read as a stage direction that should close an open dialogue
// block on a blank-less import? Combines the conservative signals above.
const looksLikeNarration = (
  trimmed: string,
  knownNames: ReadonlySet<string>,
): boolean =>
  NARRATION_OPENER_RE.test(trimmed) ||
  NAME_AGE_NARRATION_RE.test(trimmed) ||
  namesThirdPersonNarration(trimmed, knownNames);

const classify = (lines: readonly CleanedLine[]): Classified[] => {
  const out: Classified[] = [];
  let prevBlank = true;
  let inDialogueBlock = false;
  // Tracks the last non-blank emitted type so we can recover dialogue blocks
  // when pdf-parse inserts an extra blank between CHARACTER and its parenthetical.
  let lastNonBlankType: ElementType | null = null;
  // Leading-name tokens of every character cue seen so far (lowercased), used
  // to recognise third-person narration that names a known character.
  const knownNames = new Set<string>();

  for (const { text: line, number } of lines) {
    const trimmed = line.trim();
    // A soft-wrap continuation line ends with a trailing space (the column
    // filled and the text flowed onto the next line). A return-terminated line
    // has none. Captured before trimming so the join pass can tell them apart.
    const wrapped = /\s$/.test(line) && trimmed !== "";

    if (trimmed === "") {
      out.push({ type: "blank", text: "", wrapped: false });
      prevBlank = true;
      inDialogueBlock = false;
      continue;
    }

    if (prevBlank && isAllUppercase(trimmed) && ALT_HEADING_RE.test(trimmed)) {
      const headingText = number !== null ? `${trimmed} #${number}#` : trimmed;
      out.push({ type: "scene_heading", text: headingText, wrapped });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "scene_heading";
      continue;
    }

    if (SCENE_HEADING_RE.test(trimmed)) {
      // Emit Fountain forced-scene-number syntax (#N#) when the PDF had an
      // explicit gutter number, so fountainToDoc can promote it to a locked
      // heading attr. Non-heading lines drop the number — shot slugs like
      // "1F   WE SEE ..." stay action per spec 20 non-goals.
      const upper = trimmed.toUpperCase();
      const headingText = number !== null ? `${upper} #${number}#` : upper;
      out.push({ type: "scene_heading", text: headingText, wrapped });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "scene_heading";
      continue;
    }

    if (TRANSITION_RE.test(trimmed)) {
      out.push({ type: "transition", text: trimmed, wrapped });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "transition";
      continue;
    }

    // A line fully wrapped in parentheses is a parenthetical whenever it sits
    // in or directly adjacent to a dialogue context — inside an open block, or
    // right after a cue/dialogue/parenthetical that a stray page-break blank
    // closed. It must be resolved BEFORE the cue and narration branches so an
    // all-caps shout like "(RISATE)" can never be mistaken for a character cue
    // and so a parenthetical keeps the dialogue block open instead of dropping
    // to action. Bare action parentheticals outside any dialogue context still
    // fall through to action below.
    if (
      PARENTHETICAL_RE.test(trimmed) &&
      (inDialogueBlock ||
        lastNonBlankType === "character" ||
        lastNonBlankType === "dialogue" ||
        lastNonBlankType === "parenthetical")
    ) {
      out.push({ type: "parenthetical", text: trimmed, wrapped });
      prevBlank = false;
      inDialogueBlock = true;
      lastNonBlankType = "parenthetical";
      continue;
    }

    // Shot slug inside a dialogue block — pdf-parse often eats the blank
    // separator line. Break out into action so "WE SEE a charging BULL."
    // doesn't get indented as dialogue.
    if (inDialogueBlock && SHOT_SLUG_RE.test(trimmed)) {
      out.push({ type: "action", text: trimmed, wrapped });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "action";
      continue;
    }

    // Italian stage direction inside a dialogue block — on a blank-less import
    // nothing closes the block until the next cue, so third-person narration
    // ("Filippo entra nel locale …", "Vediamo Milco esibirsi.", "FILIPPO (40)
    // è fuori dal locale.") would otherwise be swallowed as dialogue. Recover
    // it to action conservatively, mirroring the SHOT_SLUG path above.
    if (inDialogueBlock && looksLikeNarration(trimmed, knownNames)) {
      out.push({ type: "action", text: trimmed, wrapped });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "action";
      continue;
    }

    if (isCharacterCue(trimmed, prevBlank, lastNonBlankType)) {
      out.push({ type: "character", text: trimmed, wrapped });
      const name = cueNameToken(trimmed);
      if (name !== null) knownNames.add(name);
      prevBlank = false;
      inDialogueBlock = true;
      lastNonBlankType = "character";
      continue;
    }

    // Orphan dialogue — a page break can fall between a CHARACTER cue and its
    // dialogue, leaving page junk (a bare page number, the running header) that
    // cleanup strips down to a stray blank line. That blank resets
    // inDialogueBlock, so the cue's first spoken line would otherwise drop to
    // action. When the last non-blank emitted line was the cue itself (it was
    // not another structural element), the line here is that cue's dialogue:
    // re-enter the dialogue block. Mirrors the orphan-parenthetical recovery.
    if (lastNonBlankType === "character") {
      out.push({ type: "dialogue", text: trimmed, wrapped });
      prevBlank = false;
      inDialogueBlock = true;
      lastNonBlankType = "dialogue";
      continue;
    }

    if (inDialogueBlock) {
      out.push({ type: "dialogue", text: trimmed, wrapped });
      prevBlank = false;
      lastNonBlankType = "dialogue";
      continue;
    }

    out.push({ type: "action", text: trimmed, wrapped });
    prevBlank = false;
    lastNonBlankType = "action";
  }

  return out;
};

// ─── Pass 2b — Join wrapped lines ────────────────────────────────────────────
//
// Some PDFs (notably tidy exports run through pdf-parse) arrive with NO blank
// separators between elements, and the writer's logical paragraphs are split
// into one block per visual line at the page column width. Each wrapped line
// must be rejoined into the single logical paragraph it belongs to.
//
// The reliable signal is the trailing space the PDF leaves on a soft-wrapped
// line: a line that filled the column and flowed onto the next ends with a
// space, while a line the writer ended with a return (a real paragraph break)
// does not. So we append a block to its predecessor ONLY when the predecessor
// was marked `wrapped`. This never fuses two distinct paragraphs (the break
// line is unwrapped) and never crosses a cue, heading, parenthetical, or
// transition boundary because we only join consecutive same-type blocks of
// `action` or `dialogue`.

const JOINABLE_TYPES: ReadonlySet<ElementType> = new Set([
  "action",
  "dialogue",
]);

// A word broken across the wrap by a hyphen ("open-" + "mic"). When the
// predecessor ends in "<letter>-" and the continuation starts lowercase, rejoin
// the two halves directly (no inserted space) and keep the hyphen — screenplay
// monospace output does not justify, so a trailing hyphen is a real compound
// ("open-mic") far more often than a hyphenation break, and keeping it is the
// safe, lossless choice.
const HYPHEN_TAIL_RE = /[A-Za-zÀ-ÿ]-$/;

// A well-formed screenplay export uses blank lines to separate every element,
// so blanks make up a large share of the document (~30–40%). The wrap-join is
// only needed for the degenerate case where pdf-parse stripped all separators
// and a paragraph is split across visual lines; there blanks are rare (only
// stray page-break gaps, ~5–7%). Below this ratio we treat the import as
// blank-less and rejoin wrapped lines; above it the per-line output is already
// correct and joining would corrupt blank-separated paragraphs.
const BLANKLESS_RATIO_CEILING = 0.15;

const isBlankLessImport = (blocks: readonly Classified[]): boolean => {
  if (blocks.length === 0) return false;
  const blanks = blocks.filter((b) => b.type === "blank").length;
  return blanks / blocks.length < BLANKLESS_RATIO_CEILING;
};

const joinWrapped = (blocks: readonly Classified[]): Classified[] => {
  if (!isBlankLessImport(blocks)) return [...blocks];
  const out: Classified[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    const isContinuation =
      prev !== undefined &&
      prev.wrapped &&
      prev.type === block.type &&
      JOINABLE_TYPES.has(block.type);

    if (!isContinuation) {
      out.push({ ...block });
      continue;
    }

    const joined =
      HYPHEN_TAIL_RE.test(prev.text) && /^[a-zà-ÿ]/.test(block.text)
        ? prev.text + block.text
        : `${prev.text} ${block.text}`;
    out[out.length - 1] = {
      type: prev.type,
      text: joined,
      wrapped: block.wrapped,
    };
  }
  return out;
};

// ─── Pass 3 — Render ─────────────────────────────────────────────────────────

const renderLine = ({ type, text }: Classified): string => {
  switch (type) {
    case "scene_heading":
    case "transition":
    case "action":
      return text;
    case "character":
      return CHARACTER_INDENT + text;
    case "parenthetical":
    case "dialogue":
      return DIALOGUE_INDENT + text;
    case "blank":
      return "";
  }
};

/**
 * Converts raw text from a PDF (as extracted by `pdf-parse`) into a Fountain
 * string using the Oh Writers conventions — 6-space CHARACTER cues, 10-space
 * dialogue + parentheticals.
 *
 * Three passes:
 *   1. Cleanup — strip scene numbers, page numbers, revision asterisks,
 *      "Buff Revised Pages" headers, date annotations, `(MORE)` artefacts.
 *   2. Classify — label each surviving line (scene_heading, character, etc.).
 *   3. Render — emit with the Oh Writers indent convention.
 */
export const fountainFromPdf = (rawText: string): string => {
  const rawLines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const cleaned = cleanup(rawLines);
  const classified = joinWrapped(classify(cleaned));
  // Don't use .trim() — it would eat the leading 6-space indent of a
  // character cue that lands on the first line. Drop empty leading/trailing
  // lines only.
  const rendered = classified.map(renderLine);
  let start = 0;
  let end = rendered.length;
  while (start < end && rendered[start] === "") start++;
  while (end > start && rendered[end - 1] === "") end--;
  return rendered.slice(start, end).join("\n");
};
