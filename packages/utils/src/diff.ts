import { diffLines, diffWordsWithSpace } from "diff";

// Side-by-side diff row shapes. Rows align the two versions line-by-line.
// Emitted by `buildSideBySideDiff` and consumed by the compare modal.

export type DiffRowKind = "equal" | "removed" | "added" | "changed";

export interface DiffSegment {
  readonly text: string;
  readonly changed: boolean;
}

export interface DiffRow {
  readonly kind: DiffRowKind;
  readonly left: readonly DiffSegment[] | null;
  readonly right: readonly DiffSegment[] | null;
}

const plain = (text: string): readonly DiffSegment[] => [
  { text, changed: false },
];

const intraLine = (
  left: string,
  right: string,
): { left: DiffSegment[]; right: DiffSegment[] } => {
  const parts = diffWordsWithSpace(left, right);
  const l: DiffSegment[] = [];
  const r: DiffSegment[] = [];
  for (const p of parts) {
    if (p.added) r.push({ text: p.value, changed: true });
    else if (p.removed) l.push({ text: p.value, changed: true });
    else {
      l.push({ text: p.value, changed: false });
      r.push({ text: p.value, changed: false });
    }
  }
  return { left: l, right: r };
};

const splitLines = (value: string): string[] => {
  if (value === "") return [];
  const lines = value.split("\n");
  // `diff` emits trailing newlines as part of the value — drop the empty tail
  // so we don't produce a phantom row after the final newline.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/**
 * Build side-by-side diff rows for two strings. Pure, no I/O.
 *
 * Algorithm: diff by line, then walk the hunks pairing consecutive
 * remove+add hunks as "changed" rows (with intra-line segments). Lone
 * removes / adds become one-sided rows.
 */
export const buildSideBySideDiff = (left: string, right: string): DiffRow[] => {
  const hunks = diffLines(left, right);
  const rows: DiffRow[] = [];

  for (let i = 0; i < hunks.length; i++) {
    const h = hunks[i];
    if (!h) continue;
    const lines = splitLines(h.value);

    if (!h.added && !h.removed) {
      for (const line of lines) {
        rows.push({ kind: "equal", left: plain(line), right: plain(line) });
      }
      continue;
    }

    if (h.removed) {
      const next = hunks[i + 1];
      if (next && next.added) {
        const rightLines = splitLines(next.value);
        const pairs = Math.min(lines.length, rightLines.length);
        for (let k = 0; k < pairs; k++) {
          const seg = intraLine(lines[k] ?? "", rightLines[k] ?? "");
          rows.push({ kind: "changed", left: seg.left, right: seg.right });
        }
        for (let k = pairs; k < lines.length; k++) {
          rows.push({
            kind: "removed",
            left: plain(lines[k] ?? ""),
            right: null,
          });
        }
        for (let k = pairs; k < rightLines.length; k++) {
          rows.push({
            kind: "added",
            left: null,
            right: plain(rightLines[k] ?? ""),
          });
        }
        i++;
        continue;
      }
      for (const line of lines) {
        rows.push({ kind: "removed", left: plain(line), right: null });
      }
      continue;
    }

    // h.added with no preceding removed
    for (const line of lines) {
      rows.push({ kind: "added", left: null, right: plain(line) });
    }
  }

  return rows;
};
