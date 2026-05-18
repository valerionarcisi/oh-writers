/**
 * Shared constants for Fountain element recognition and formatting.
 *
 * Single source of truth — previously duplicated across
 * fountain-keybindings.ts and fountain-autocomplete.ts.
 */

// Character cue indent: ~6 spaces to simulate centering in monospace.
export const CHARACTER_INDENT = "      ";

// Dialogue indent: ~10 spaces (2.5" from left in Courier at screenplay scale).
export const DIALOGUE_INDENT = "          ";

// Scene-heading prefixes accepted by the tokenizer and element detector.
// Supports English (INT./EXT.) and Italian (INT./EST.) conventions, plus
// the common shorthand where the first period is dropped (INT/EXT., INT/EST.).
// EST. = "esterno" (Italian for exterior). Combined forms come first.
// Non-standard sluglines (INSERT, INTERCUT, SERIES OF SHOTS, MONTAGE, FLASHBACK)
// are accepted when followed by whitespace or end-of-line, matching the same set
// as NON_STANDARD_HEADING_PREFIX in packages/domain/src/screenplay/list-scenes.ts.
export const SCENE_HEADING_RE =
  /^(?:INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E|INSERT|INTERCUT|SERIES\s+OF\s+SHOTS|MONTAGE|FLASHBACK)(?:\s|$)/;

// Canonical list of Fountain transitions. Order matters for UI display.
export const FOUNTAIN_TRANSITIONS = [
  "CUT TO:",
  "FADE IN:",
  "FADE OUT.",
  "FADE OUT:",
  "FADE TO:",
  "DISSOLVE TO:",
  "SMASH CUT TO:",
  "MATCH CUT TO:",
  "JUMP CUT TO:",
] as const;

export const TRANSITION_SET: ReadonlySet<string> = new Set(
  FOUNTAIN_TRANSITIONS,
);
