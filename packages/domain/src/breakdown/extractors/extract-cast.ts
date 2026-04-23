/**
 * Cast extractor — detects Fountain CHARACTER lines.
 *
 * Fountain convention: a CHARACTER cue is a line in ALL CAPS by itself,
 * optionally followed by a parenthetical extension like "(V.O.)" or "(O.S.)".
 * The next non-empty line is the dialogue (we ignore it; we only need the
 * character name).
 *
 * Heuristics applied to keep precision high (false-positives kill the UX):
 *   - The whole line, after trimming, must be UPPERCASE letters / digits /
 *     spaces / dots / parens / dashes / apostrophes.
 *   - At least one alphabetic character must be present (skip "1." / "...")
 *   - Lines starting with `INT.` / `EXT.` / `EST.` / `I/E.` are skipped
 *     (they're slug-lines, not characters).
 *   - The line must be **preceded by a blank line** (or be the first line) —
 *     this is how the Fountain spec defines a CHARACTER cue and is the
 *     single most effective filter against ALL-CAPS action lines like
 *     "BANG! POI SILENZIO." being misread as character names.
 *   - The line must be **followed by a non-empty next line within the next
 *     two lines** — Fountain requires a dialogue or parenthetical right
 *     after the character cue. This filters out shouted-action lines like
 *     "AHAHHAH!" inside an action paragraph.
 *   - Parenthetical extensions ("(V.O.)", "(CONT'D)", …) are stripped from
 *     the canonical name.
 *
 * Returns one `ExtractedItem` per distinct character, with `quantity` equal
 * to the number of cues for that character in the scene. Marked `accepted`
 * by default — Fountain CHARACTER convention is ~95% reliable.
 */

import type { ExtractedItem, Extractor } from "./types.js";
import { titleCase } from "./types.js";

const SLUGLINE_PREFIXES = /^(INT|EXT|EST|I\/E|INT\/EXT|INT\.\/EXT)\.?\b/;

// Allowed in a CHARACTER cue line (before stripping parens):
//   A-Z digits spaces hyphens apostrophes dots parens slashes colon
const CAPS_LINE = /^[A-Z0-9\s.\-'()/:]+$/;
// Must contain at least one A-Z letter (skip "1." / "...")
const HAS_LETTER = /[A-Z]/;

// Lines we must NOT treat as a CHARACTER cue even if they look like one.
// Fountain transitions and end-of-script markers are ALL-CAPS, are preceded
// by blank lines, and are often followed by another non-empty line — so they
// pass every other heuristic. Bilingual list (EN + IT) so the same extractor
// handles both languages.
const TRANSITION_OR_TERMINAL = new Set([
  // English transitions
  "FADE IN",
  "FADE IN:",
  "FADE OUT",
  "FADE OUT.",
  "FADE OUT:",
  "FADE TO BLACK",
  "FADE TO BLACK.",
  "FADE TO BLACK:",
  "CUT TO",
  "CUT TO:",
  "SMASH CUT",
  "SMASH CUT TO",
  "SMASH CUT TO:",
  "DISSOLVE TO",
  "DISSOLVE TO:",
  "MATCH CUT TO",
  "MATCH CUT TO:",
  "JUMP CUT TO",
  "JUMP CUT TO:",
  "TIME CUT",
  "TIME CUT:",
  "BACK TO SCENE",
  "BACK TO SCENE:",
  "INTERCUT",
  "INTERCUT:",
  "THE END",
  "THE END.",
  "END",
  "END.",
  // Italian transitions / end markers
  "DISSOLVENZA",
  "DISSOLVENZA.",
  "DISSOLVENZA:",
  "STACCO",
  "STACCO:",
  "STACCO SU",
  "STACCO SU:",
  "FINE",
  "FINE.",
  "TITOLI DI CODA",
]);

const isTransitionOrTerminal = (line: string): boolean => {
  if (TRANSITION_OR_TERMINAL.has(line)) return true;
  // Generic Fountain transition rule: line ending with "TO:" is a transition.
  if (/\sTO:$/.test(line)) return true;
  return false;
};

const stripParenthetical = (line: string): string =>
  line.replace(/\([^)]*\)/g, "").trim();

export const extractCast: Extractor = (sceneBody) => {
  const lines = sceneBody.split(/\r?\n/);
  const counts = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (raw.length === 0) continue;
    if (SLUGLINE_PREFIXES.test(raw)) continue;
    if (!CAPS_LINE.test(raw)) continue;
    if (!HAS_LETTER.test(raw)) continue;
    if (isTransitionOrTerminal(raw)) continue;

    // Must be preceded by a blank line (or be the first non-empty line)
    // — Fountain CHARACTER cue rule. Filters ALL-CAPS action like
    // "BANG! POI SILENZIO." that lives inside an action paragraph.
    const prev = i > 0 ? (lines[i - 1] ?? "").trim() : "";
    if (i > 0 && prev.length > 0) continue;

    // Must be followed by a non-empty line within 2 lines to qualify as a cue.
    const next1 = lines[i + 1]?.trim() ?? "";
    const next2 = lines[i + 2]?.trim() ?? "";
    const hasDialogue = next1.length > 0 || next2.length > 0;
    if (!hasDialogue) continue;

    const cleaned = stripParenthetical(raw);
    if (cleaned.length === 0) continue;
    // Drop trailing ":" some writers use ("FILIPPO:")
    const name = cleaned.replace(/:$/, "").trim();
    if (name.length === 0 || name.length > 60) continue;

    const canonical = titleCase(name);
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
  }

  const items: ExtractedItem[] = [];
  for (const [name, quantity] of counts) {
    items.push({
      category: "cast",
      name,
      quantity,
      defaultStatus: "accepted",
      source: "regex",
    });
  }
  return items;
};
