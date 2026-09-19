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
// Case-insensitive: a typed heading like "EXT/Int. QUARTIERE" (mixed case,
// caught live — see fountain-constants.test.ts) must still classify as a
// scene, matching packages/domain/src/screenplay/list-scenes.ts's
// HEADING_PREFIX (also /i). Without this, normalizeFountainForExport's
// round-trip through this detector silently demotes the heading to action,
// losing its scene number and bold styling only in the exported PDF —
// the live PM editor keeps the node type it was first parsed with.
const STANDARD_HEADING_PREFIX =
  /^(?:INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E)(?:\s|$)/i;

// Non-standard sluglines (INSERT, INTERCUT, SERIES OF SHOTS, MONTAGE, FLASHBACK)
// stay CASE-SENSITIVE — exactly like NON_STANDARD_HEADING_PREFIX in
// packages/domain/src/screenplay/list-scenes.ts, whose comment explains why:
// a lowercase "Montage di Filippo che lavora" must read as action, not scene.
const NON_STANDARD_HEADING_PREFIX =
  /^(?:INSERT|INTERCUT|SERIES\s+OF\s+SHOTS|MONTAGE|FLASHBACK)(?:\s|$)/;

// NOT a real RegExp — deliberately, so a future `instanceof RegExp` check or
// `.source`/`.flags` access fails loudly instead of silently misbehaving.
// Plain RegExp can't mix per-alternative flags (the standard prefix needs
// /i, the non-standard one must not), so this exposes only the `test`/`exec`
// surface every existing call site already uses.
export const SCENE_HEADING_RE = {
  test: (line: string): boolean =>
    STANDARD_HEADING_PREFIX.test(line) ||
    NON_STANDARD_HEADING_PREFIX.test(line),
  exec: (line: string): RegExpExecArray | null =>
    STANDARD_HEADING_PREFIX.exec(line) ??
    NON_STANDARD_HEADING_PREFIX.exec(line),
};

// Canonical list of Fountain transitions. Order matters for UI display.
export const FOUNTAIN_TRANSITIONS = [
  "CUT TO:",
  "FADE IN:",
  "FADE OUT.",
  "FADE OUT:",
  "FADE TO:",
  "FADE TO BLACK.",
  "DISSOLVE TO:",
  "SMASH CUT TO:",
  "MATCH CUT TO:",
  "JUMP CUT TO:",
] as const;

export const TRANSITION_SET: ReadonlySet<string> = new Set(
  FOUNTAIN_TRANSITIONS,
);
