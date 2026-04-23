/**
 * Pure scene listing helper for fountain text.
 *
 * Used by:
 *   - Sides export multi-select UI (lists scenes the user can pick).
 *   - Fountain pre-processing pipelines (extract-scenes-from-fountain).
 *
 * A "scene heading" in fountain is a line that:
 *   - Starts with one of: INT., EXT., EST., I/E., INT/EXT, INT./EXT (case-insensitive)
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

const HEADING_PREFIX = /^(INT|EXT|EST|I\/E|INT\/EXT|INT\.\/EXT)\.?(\s|$)/i;

const SCENE_NUMBER_SUFFIX = /\s+#([^#]+)#\s*$/;

const isHeading = (rawLine: string): boolean => {
  const line = rawLine.trim();
  if (line.length === 0) return false;
  if (line.startsWith(".") && !line.startsWith("..")) return true;
  return HEADING_PREFIX.test(line);
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
