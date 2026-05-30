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

// ─── Word-level inline diff ───────────────────────────────────────────────
// Flat word-level segment stream for an INLINE diff (one continuous coloured
// run, not side-by-side rows). Used by the Cesare "Mostra modifiche" live-doc
// overlay: equal words render plain, added words green, removed words red.

export type WordDiffOp = "eq" | "add" | "del";

export interface WordDiffSegment {
  readonly op: WordDiffOp;
  readonly text: string;
}

/**
 * Normalise HTML block/inline markup to plain prose text. The Cesare live diff
 * is shown to the user as words inside the document — never as raw markup — so
 * every tag is stripped BEFORE diffing. Block-level closers (`</p>`, `</h1-6>`,
 * `</li>`, `<br>`, …) collapse to a newline so paragraph boundaries survive as
 * whitespace; all other tags are removed and the common HTML entities decoded.
 * Runs of three or more newlines collapse to two so the diff stays compact.
 * Pure, no I/O.
 */
export const htmlToPlainText = (html: string): string =>
  html
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Build a flat word-level diff between `before` and `after`. Pure, no I/O.
 * Adjacent segments of the same op are coalesced so the rendered stream stays
 * compact. The reader sees deletion (red) inline before its replacement
 * insertion (green), with unchanged text plain.
 *
 * Both inputs are run through `htmlToPlainText` first so the diff is computed on
 * plain prose: the user only ever sees words, never block markup (`<p>`/`</p>`).
 */
export const buildWordDiffSegments = (
  before: string,
  after: string,
): WordDiffSegment[] => {
  const parts = diffWordsWithSpace(
    htmlToPlainText(before),
    htmlToPlainText(after),
  );
  const segments: WordDiffSegment[] = [];
  const push = (op: WordDiffOp, text: string) => {
    if (text === "") return;
    const last = segments[segments.length - 1];
    if (last && last.op === op) {
      segments[segments.length - 1] = { op, text: last.text + text };
      return;
    }
    segments.push({ op, text });
  };
  for (const p of parts) {
    if (p.added) push("add", p.value);
    else if (p.removed) push("del", p.value);
    else push("eq", p.value);
  }
  return segments;
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
