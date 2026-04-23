/**
 * Slice a fountain document down to a chosen subset of scenes.
 *
 * Used by Sides export (Spec 05k): the user picks a list of scene numbers
 * (or ordinal indices) and we keep only those scenes, dropping everything
 * else — including the title page, sections (`#`), synopses (`=`), and
 * the body of unselected scenes.
 *
 * Rules:
 *   - Title block (the `Key: Value` lines at the top, ending at the first
 *     blank line before any heading) is removed entirely.
 *   - For each kept scene we keep the heading line + every line up to (but
 *     not including) the next heading line, preserving leading/trailing
 *     blank-line shape between consecutive kept scenes.
 *   - Selection compares against `scene.number` only — that is the explicit
 *     `#N#` marker if present, otherwise the 1-based ordinal stringified by
 *     `listScenesInFountain`. Single key-space avoids ambiguity when a
 *     fountain mixes explicit and implicit numbering.
 *
 * Pure: no I/O. Same input → same output.
 */

import { listScenesInFountain } from "./list-scenes.js";

export const extractScenesFromFountain = (
  fountain: string,
  selection: readonly string[],
): string => {
  if (selection.length === 0) return "";

  const lines = fountain.split(/\r?\n/);
  const allScenes = listScenesInFountain(fountain);
  const selectedSet = new Set(selection);

  // Re-derive scene line ranges from the original `lines`. A scene's range
  // runs from its `lineIndex` to the line BEFORE the next scene's lineIndex
  // (or to the end of the document for the last scene).
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < allScenes.length; i++) {
    const scene = allScenes[i]!;
    if (!selectedSet.has(scene.number)) continue;
    const next = allScenes[i + 1];
    ranges.push({
      start: scene.lineIndex,
      end: next ? next.lineIndex : lines.length,
    });
  }

  // Slice each range, strip trailing blank lines from the previous chunk to
  // avoid runaway whitespace, then join with a single blank separator.
  const chunks = ranges.map(({ start, end }) =>
    lines.slice(start, end).join("\n").replace(/\s+$/, ""),
  );
  const body = chunks.join("\n\n");

  // Title block removal is a no-op here: slicing by scene ranges already
  // excludes any pre-first-scene content (including `Key: value` headers).

  return body.length > 0 ? body + "\n" : "";
};
