import {
  diff_match_patch,
  DIFF_DELETE,
  DIFF_INSERT,
  DIFF_EQUAL,
} from "diff-match-patch";

export type DiffLine =
  | { type: "equal"; text: string }
  | { type: "insert"; text: string }
  | { type: "delete"; text: string };

/**
 * Computes a line-level diff between two screenplay texts.
 * Returns each line tagged as equal, insert, or delete.
 * Uses diff-match-patch's line-mode for screenplay readability.
 */
export const diffScreenplays = (
  oldText: string,
  newText: string,
): DiffLine[] => {
  const dmp = new diff_match_patch();

  // Line-mode diff: each "character" represents a full line
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(
    oldText,
    newText,
  );
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const result: DiffLine[] = [];

  for (const [op, text] of diffs) {
    // Each diff segment may contain multiple lines — split and tag each
    const lines = text.split("\n");
    // diff_match_patch appends a trailing \n to each line segment; remove the last empty entry
    if (lines.at(-1) === "") lines.pop();

    for (const line of lines) {
      if (op === DIFF_EQUAL) result.push({ type: "equal", text: line });
      else if (op === DIFF_INSERT) result.push({ type: "insert", text: line });
      else if (op === DIFF_DELETE) result.push({ type: "delete", text: line });
    }
  }

  return result;
};

export const diffStats = (
  lines: DiffLine[],
): { added: number; removed: number } => ({
  added: lines.filter((l) => l.type === "insert").length,
  removed: lines.filter((l) => l.type === "delete").length,
});
