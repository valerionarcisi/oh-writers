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
// Date annotations like "(FEB `95)", "(MAR '90)", "(1969)" — accept both
// straight/curly quotes, backticks, or bare 4-digit years.
const DATE_ANNOTATION_STANDALONE_RE =
  /^\s*\((?:[A-Z]+\s*[`'']?\s*\d{2,4}|\d{4})\)\s*$/;
// Standalone scene-number + asterisk fragments like "* 42", "*46A".
const STANDALONE_ASTERISK_FRAGMENT_RE = /^\s*\*+\s*\d*[A-Z]?\s*$/;

const stripLeadingSceneNumber = (line: string): string =>
  line.replace(/^\s*\d+[A-Z]?(?:-\d+[A-Z]?)?\s{2,}/, "");

const stripDateAnnotationFromSlugline = (line: string): string =>
  line.replace(/\s*\([A-Z]+\s*[`'']?\s*\d{2,4}\)\s*$/, "");

// Trailing shooting-script noise: revision asterisks, scene numbers, and
// combinations like "* 42" or "*46A". Applied iteratively until stable so
// pairs like "* 42" get fully stripped in multiple passes.
const stripTrailingNoise = (line: string): string => {
  let prev: string;
  let current = line;
  do {
    prev = current;
    current = current.replace(/\s+\*+\s*$/, "");
    current = current.replace(/\s{2,}\d+[A-Z]?(?:-\d+[A-Z]?)?\s*$/, "");
    current = current.replace(/\s+\*+\s*\d+[A-Z]?(?:-\d+[A-Z]?)?\s*$/, "");
  } while (current !== prev);
  return current;
};

const cleanup = (rawLines: readonly string[]): string[] => {
  const out: string[] = [];
  for (const raw of rawLines) {
    if (BUFF_HEADER_RE.test(raw)) continue;
    if (BARE_PAGE_NUMBER_RE.test(raw)) continue;
    if (MORE_CONTINUATION_RE.test(raw)) continue;
    if (DATE_ANNOTATION_STANDALONE_RE.test(raw)) continue;
    if (STANDALONE_ASTERISK_FRAGMENT_RE.test(raw)) continue;

    let line = raw;
    line = stripTrailingNoise(line);
    line = stripLeadingSceneNumber(line);
    line = stripDateAnnotationFromSlugline(line);
    out.push(line);
  }
  return out;
};

// ─── Pass 2 — Classify ───────────────────────────────────────────────────────

// Accept English (INT./EXT.), Italian (INT./EST.), and slug-like INSERT.
const SCENE_HEADING_RE =
  /^(INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E|INSERT)\b/i;

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

const classify = (lines: readonly string[]): Classified[] => {
  const out: Classified[] = [];
  let prevBlank = true;
  let inDialogueBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      out.push({ type: "blank", text: "" });
      prevBlank = true;
      inDialogueBlock = false;
      continue;
    }

    if (SCENE_HEADING_RE.test(trimmed)) {
      out.push({ type: "scene_heading", text: trimmed.toUpperCase() });
      prevBlank = false;
      inDialogueBlock = false;
      continue;
    }

    if (TRANSITION_RE.test(trimmed)) {
      out.push({ type: "transition", text: trimmed });
      prevBlank = false;
      inDialogueBlock = false;
      continue;
    }

    if (PARENTHETICAL_RE.test(trimmed) && inDialogueBlock) {
      out.push({ type: "parenthetical", text: trimmed });
      prevBlank = false;
      continue;
    }

    if (isCharacterCue(trimmed, prevBlank)) {
      out.push({ type: "character", text: trimmed });
      prevBlank = false;
      inDialogueBlock = true;
      continue;
    }

    if (inDialogueBlock) {
      out.push({ type: "dialogue", text: trimmed });
      prevBlank = false;
      continue;
    }

    out.push({ type: "action", text: trimmed });
    prevBlank = false;
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
