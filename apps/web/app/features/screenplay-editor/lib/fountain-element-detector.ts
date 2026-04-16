import {
  CHARACTER_INDENT,
  DIALOGUE_INDENT,
  SCENE_HEADING_RE,
  TRANSITION_SET,
} from "./fountain-constants";

/**
 * The six element types the Tab/Enter flow matrix operates on.
 *
 * "general" (shot / forced-action) is intentionally excluded from detection:
 * it's visually identical to "action" at the text-buffer level and only makes
 * sense when triggered explicitly (Alt+G / Cmd+7). Including it here would
 * make the detector ambiguous.
 */
export type ElementType =
  | "scene"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition";

/**
 * Pure function — given a line (and optionally the previous line for context),
 * classify which screenplay element it currently represents.
 *
 * Recognition rules, in priority order:
 *   1. Scene heading — starts with INT./EXT./EST./INT.\/EXT./EXT.\/INT./INT.\/EST./EST.\/INT./I\/E
 *      (EST. supports Italian conventions — "esterno")
 *   2. Parenthetical — trimmed line is wrapped in ()
 *   3. Dialogue — starts with the dialogue indent
 *   4. Character — starts with the character indent (and not dialogue indent),
 *                  OR is a plain-Fountain ALL-CAPS cue preceded by a blank line
 *   5. Transition — a known transition from FOUNTAIN_TRANSITIONS, at column 0
 *   6. Action — anything else (default)
 *
 * The detector is intentionally permissive about empty lines: an empty line
 * in dialogue indent is still "dialogue" (the writer is about to type), and
 * an empty line with no indent is "action".
 */
export const detectElement = (
  line: string,
  prevLine: string | null = null,
): ElementType => {
  // 1. Scene heading — must match at column 0 (possibly with trailing content)
  if (SCENE_HEADING_RE.test(line)) return "scene";

  const trimmed = line.trim();

  // 2. Parenthetical — (anything) on its own line, any indent
  if (trimmed.length >= 2 && trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return "parenthetical";
  }

  // 3. Dialogue — dialogue indent takes precedence over character indent
  //    because DIALOGUE_INDENT starts with CHARACTER_INDENT
  if (line.startsWith(DIALOGUE_INDENT)) return "dialogue";

  // 4a. Character — indented cue
  if (line.startsWith(CHARACTER_INDENT)) return "character";

  // 4b. Character — plain-Fountain cue: ALL CAPS at column 0, preceded by blank
  if (isPlainFountainCue(line, trimmed, prevLine)) return "character";

  // 5. Transition — known transition text at column 0
  if (TRANSITION_SET.has(trimmed)) return "transition";

  // 6. Action — default
  return "action";
};

// Permissive plain-Fountain cue detector.
//
// Canonical Fountain requires a blank line above an ALL-CAPS cue to disambiguate
// it from uppercase words inside action. We relax that: if the line looks like
// a short name (≤40 chars, no sentence punctuation in the body) we accept it
// even without a blank line separator. Tradeoff — easier for messy imports,
// tiny risk of a shouted ALL-CAPS action line being misread as a cue.
const isPlainFountainCue = (
  line: string,
  trimmed: string,
  _prevLine: string | null,
): boolean => {
  if (trimmed.length === 0) return false;
  if (line !== line.trimStart()) return false;
  if (SCENE_HEADING_RE.test(trimmed)) return false;
  if (TRANSITION_SET.has(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  if (trimmed.length > 40) return false;
  // Strip all trailing parenthetical extensions iteratively so that compound
  // cues like "JOHN (V.O.) (CONT'D)" don't leave an intermediate "(V.O.)"
  // with dots that would falsely trigger the punctuation check below.
  let nameOnly = trimmed;
  while (/\s*\([^)]*\)\s*$/.test(nameOnly)) {
    nameOnly = nameOnly.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  // Reject sentence-like punctuation that wouldn't appear in a name.
  if (/[.!?,;:]/.test(nameOnly)) return false;
  // Reject en-dash / em-dash: these appear in production notes ("SCENES 42 – 46
  // OMITTED") and range expressions, never in real character names.
  if (/[\u2013\u2014]/.test(nameOnly)) return false;
  return true;
};
