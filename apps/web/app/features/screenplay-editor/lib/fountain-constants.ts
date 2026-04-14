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
export const SCENE_HEADING_RE =
  /^(?:INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E)\s/;

// Canonical list of Fountain transitions. Order matters for UI display.
export const FOUNTAIN_TRANSITIONS = [
  "FADE IN:",
  "FADE OUT:",
  "CUT TO:",
  "SMASH CUT TO:",
  "DISSOLVE TO:",
  "MATCH CUT TO:",
  "JUMP CUT TO:",
] as const;

export const TRANSITION_SET: ReadonlySet<string> = new Set(
  FOUNTAIN_TRANSITIONS,
);
