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
const stripDateAnnotationFromSlugline = (line: string): string =>
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
    if (BARE_PAGE_NUMBER_RE.test(raw)) continue;
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
const SCENE_HEADING_RE =
  /^(INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E|INSERT)(?=\s|$)/i;

// Alternative structural sluglines — scene-level groupings that screenwriters
// use in place of a full INT./EXT. heading. Accepted only on ALL-CAPS, full-line
// matches at a blank-line boundary, so mid-sentence uses stay action.
const ALT_HEADING_RE =
  /^(A\s+SERIES\s+OF\s+[A-ZÀ-Ý0-9 '\-–—]+|SERIES\s+OF\s+SHOTS(?:\s*[-–—:]\s*.+)?|MONTAGE(?:\s*[-–—:]\s*.+)?|INTERCUT(?:\s*[-–—:]\s*.+)?|FLASHBACK(?:\s*[-–—:]\s*.+)?)$/;

// Transitions: ALL-CAPS phrase ending with TO:, IN:, OUT., or specific
// recognised phrases (CUT TO BLACK., FADE TO BLACK., DISSOLVENZA A NERO.).
const TRANSITION_RE =
  /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 ]*(?:TO:|IN:|OUT\.|TO BLACK\.|A NERO\.)\s*$/;

const PARENTHETICAL_RE = /^\s*\(.+\)\s*$/;

const isAllUppercase = (text: string): boolean => {
  if (!/[A-ZÀ-Ý]/.test(text)) return false;
  return text === text.toUpperCase();
};

// Character cue: ALL CAPS, letters plus digits/space/#/parens/periods/apostrophes,
// no trailing sentence punctuation (allow closing paren).
const isCharacterCue = (trimmed: string, prevBlank: boolean): boolean => {
  if (!prevBlank) return false;
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

// Shot-slug openers — when they appear mid-dialogue block, they're a hint
// that we've returned to action (common in shooting-script imports where
// the blank line between dialogue and the next shot got eaten).
const SHOT_SLUG_RE =
  /^(WE\s+SEE|CAMERA\b|ANGLE\s+ON|BACK\s+TO|INTERCUT\b|MONTAGE\b|SERIES\s+OF|VARIOUS\s+SHOTS|CLOSE\s+ON|CUT\s+TO|PUSH\s+IN|PULL\s+OUT|FROM\b)/i;

const classify = (lines: readonly CleanedLine[]): Classified[] => {
  const out: Classified[] = [];
  let prevBlank = true;
  let inDialogueBlock = false;
  // Tracks the last non-blank emitted type so we can recover dialogue blocks
  // when pdf-parse inserts an extra blank between CHARACTER and its parenthetical.
  let lastNonBlankType: ElementType | null = null;

  for (const { text: line, number } of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      out.push({ type: "blank", text: "" });
      prevBlank = true;
      inDialogueBlock = false;
      continue;
    }

    if (prevBlank && isAllUppercase(trimmed) && ALT_HEADING_RE.test(trimmed)) {
      const headingText = number !== null ? `${trimmed} #${number}#` : trimmed;
      out.push({ type: "scene_heading", text: headingText });
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
      out.push({ type: "scene_heading", text: headingText });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "scene_heading";
      continue;
    }

    if (TRANSITION_RE.test(trimmed)) {
      out.push({ type: "transition", text: trimmed });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "transition";
      continue;
    }

    // Shot slug inside a dialogue block — pdf-parse often eats the blank
    // separator line. Break out into action so "WE SEE a charging BULL."
    // doesn't get indented as dialogue.
    if (inDialogueBlock && SHOT_SLUG_RE.test(trimmed)) {
      out.push({ type: "action", text: trimmed });
      prevBlank = false;
      inDialogueBlock = false;
      lastNonBlankType = "action";
      continue;
    }

    if (PARENTHETICAL_RE.test(trimmed) && inDialogueBlock) {
      out.push({ type: "parenthetical", text: trimmed });
      prevBlank = false;
      lastNonBlankType = "parenthetical";
      continue;
    }

    // Orphan parenthetical — pdf-parse sometimes inserts a spurious blank
    // between CHARACTER and its parenthetical. If the last non-blank was a
    // character cue, re-enter the dialogue block instead of falling to action.
    if (PARENTHETICAL_RE.test(trimmed) && lastNonBlankType === "character") {
      out.push({ type: "parenthetical", text: trimmed });
      prevBlank = false;
      inDialogueBlock = true;
      lastNonBlankType = "parenthetical";
      continue;
    }

    if (isCharacterCue(trimmed, prevBlank)) {
      out.push({ type: "character", text: trimmed });
      prevBlank = false;
      inDialogueBlock = true;
      lastNonBlankType = "character";
      continue;
    }

    if (inDialogueBlock) {
      out.push({ type: "dialogue", text: trimmed });
      prevBlank = false;
      lastNonBlankType = "dialogue";
      continue;
    }

    out.push({ type: "action", text: trimmed });
    prevBlank = false;
    lastNonBlankType = "action";
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
  const rawLines = rawText.split("\n");
  const cleaned = cleanup(rawLines);
  const classified = classify(cleaned);
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
