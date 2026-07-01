/**
 * Pure scene listing helper for fountain text.
 *
 * Used by:
 *   - Sides export multi-select UI (lists scenes the user can pick).
 *   - Fountain pre-processing pipelines (extract-scenes-from-fountain).
 *
 * A "scene heading" in fountain is a line that:
 *   - Starts with one of: INT., EXT., EST., I/E., INT/EXT, INT./EXT (case-insensitive)
 *   - OR starts with a non-standard slugline prefix: INSERT, INTERCUT, SERIES OF SHOTS,
 *     MONTAGE, FLASHBACK (professional screenwriting conventions, also emitted by the
 *     Oh Writers PDF importer)
 *   - OR is a "forced heading" beginning with "."
 *
 * For each detected heading we return:
 *   - `index`     — 1-based ordinal in document order (used as default scene id)
 *   - `heading`   — the raw heading line (trimmed, with any forced-heading "." stripped)
 *   - `number`    — explicit scene number from `#N#` suffix if present, else `String(index)`
 *
 * No external deps. Safe to import from any runtime (browser, server, RN).
 */

export interface FountainScene {
  /** 1-based ordinal in document order. Stable across re-parses. */
  readonly index: number;
  /** Trimmed heading text, without leading "." or trailing scene-number marker. */
  readonly heading: string;
  /** Stable identifier for selection. Equals the `#N#` marker if present, else `String(index)`. */
  readonly number: string;
  /** Index into the source `lines` array — used by extractors to slice ranges. */
  readonly lineIndex: number;
}

const HEADING_PREFIX =
  /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?\/EST\.?|EST\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)(\s|$)/i;

// Non-standard sluglines used by professional screenwriters and emitted by the
// Oh Writers PDF importer. Accepted when followed by whitespace, a dash, colon,
// or end-of-line — this keeps bare character names like "INTERCUT" from a
// hypothetical cue from being misclassified.
//
// CASE-SENSITIVE (no /i): a non-standard slugline is a heading only when written
// in UPPERCASE, exactly like the PM editor's SCENE_HEADING_RE
// (fountain-constants.ts). A lowercase line like "Montage di Filippo che lavora"
// is ACTION, not a scene. When the two parsers disagreed on this (DB counted it
// as a scene, the editor didn't), the DB scenes.number and the editor's scene
// ordinal drifted by one, so read_scene(N) and the on-screen scene N pointed at
// different scenes and Cesare edited the wrong one.
const NON_STANDARD_HEADING_PREFIX =
  /^(INSERT|INTERCUT|SERIES\s+OF\s+SHOTS|MONTAGE|FLASHBACK)(\s|[-–—:]|$)/;

const SCENE_NUMBER_SUFFIX = /\s+#([^#]+)#\s*$/;

const isHeading = (rawLine: string): boolean => {
  const line = rawLine.trim();
  if (line.length === 0) return false;
  if (line.startsWith(".") && !line.startsWith("..")) return true;
  return HEADING_PREFIX.test(line) || NON_STANDARD_HEADING_PREFIX.test(line);
};

const stripForcedDot = (line: string): string =>
  line.startsWith(".") && !line.startsWith("..") ? line.slice(1) : line;

export const listScenesInFountain = (fountain: string): FountainScene[] => {
  const lines = fountain.split(/\r?\n/);
  const result: FountainScene[] = [];
  let ordinal = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (!isHeading(raw)) continue;
    ordinal++;
    const trimmed = raw.trim();
    const numberMatch = trimmed.match(SCENE_NUMBER_SUFFIX);
    const headingNoNumber = numberMatch
      ? trimmed.slice(0, numberMatch.index ?? trimmed.length).trimEnd()
      : trimmed;
    const heading = stripForcedDot(headingNoNumber).trim();
    const number = numberMatch?.[1]?.trim() ?? String(ordinal);
    result.push({ index: ordinal, heading, number, lineIndex: i });
  }

  return result;
};
