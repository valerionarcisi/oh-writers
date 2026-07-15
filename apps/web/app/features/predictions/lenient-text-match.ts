// #106 — `apply_text_edit` matched the model's quoted text byte-for-byte
// against the stored document. The stored content is HTML-ish (typographic
// quotes, &nbsp;/&amp; entities, double spaces survive round-trips), while
// the model quotes what it *read* — so a correct quote failed to match and
// the model flailed through retries, narrating them to the user.
//
// This module finds the ORIGINAL span for a leniently-normalised needle:
// both sides are normalised (quotes folded to ASCII, common entities
// decoded, whitespace runs collapsed) while keeping, for the haystack, a
// per-character map back to original offsets — so the replacement is
// applied to the document's real bytes and nothing outside the span is
// rewritten.

interface NormalisedText {
  readonly norm: string;
  /** For each char of `norm`: [startInOriginal, endInOriginal). */
  readonly spans: ReadonlyArray<readonly [number, number]>;
}

// Superset of the canonical serializer's vocabulary (parse-canonical-narrative-html.ts):
// legacy/pasted content can carry typographic entities the canonical writer
// never emits, and missing one here re-opens the #106 miss on that document.
const ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ["&nbsp;", " "],
  ["&amp;", "&"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&apos;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&hellip;", "…"],
  ["&rsquo;", "’"],
  ["&lsquo;", "‘"],
  ["&rdquo;", "”"],
  ["&ldquo;", "“"],
  ["&mdash;", "—"],
  ["&ndash;", "–"],
];

const QUOTE_FOLD: Readonly<Record<string, string>> = {
  "‘": "'", // ‘
  "’": "'", // ’
  "‚": "'", // ‚
  "“": '"', // “
  "”": '"', // ”
  "„": '"', // „
  "«": '"', // «
  "»": '"', // »
  "–": "-", // –
  "—": "-", // —
  "…": "...", // … (folds to three chars)
};

const isWhitespace = (ch: string): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === " ";

function normalise(original: string): NormalisedText {
  let norm = "";
  const spans: Array<readonly [number, number]> = [];
  let i = 0;
  const push = (text: string, start: number, end: number): void => {
    for (const ch of text) {
      norm += ch;
      spans.push([start, end]);
    }
  };
  while (i < original.length) {
    const entity = ENTITIES.find(([e]) => original.startsWith(e, i));
    if (entity) {
      const [raw, decoded] = entity;
      const folded = QUOTE_FOLD[decoded] ?? decoded;
      if (isWhitespace(folded)) {
        if (!norm.endsWith(" ")) push(" ", i, i + raw.length);
        else
          spans[spans.length - 1] = [
            spans[spans.length - 1]![0],
            i + raw.length,
          ];
      } else {
        push(folded, i, i + raw.length);
      }
      i += raw.length;
      continue;
    }
    const ch = original[i]!;
    if (isWhitespace(ch)) {
      // Collapse the whole whitespace run into one normalised space whose
      // span covers the run (so a replacement swallows it entirely).
      let j = i;
      while (j < original.length && isWhitespace(original[j]!)) j += 1;
      if (!norm.endsWith(" ")) push(" ", i, j);
      else spans[spans.length - 1] = [spans[spans.length - 1]![0], j];
      i = j;
      continue;
    }
    push(QUOTE_FOLD[ch] ?? ch, i, i + 1);
    i += 1;
  }
  return { norm, spans };
}

const normaliseNeedle = (needle: string): string =>
  normalise(needle).norm.trim();

export interface LenientMatch {
  readonly start: number;
  readonly end: number;
}

/**
 * Find `needle` in `haystack`, tolerant of typographic quotes, common HTML
 * entities and whitespace-run differences on BOTH sides. Returns the span in
 * the ORIGINAL haystack, or null when the needle is absent or ambiguous-empty.
 * Exact `indexOf` matches short-circuit (byte-precise span, no normalisation).
 */
export function findLenient(
  haystack: string,
  needle: string,
): LenientMatch | null {
  if (needle.length === 0) return null;
  const exact = haystack.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  const normNeedle = normaliseNeedle(needle);
  if (normNeedle.length === 0) return null;
  const { norm, spans } = normalise(haystack);
  const at = norm.indexOf(normNeedle);
  if (at === -1) return null;
  const first = spans[at]!;
  const last = spans[at + normNeedle.length - 1]!;
  // Fail closed when the match starts or ends INSIDE a multi-char fold
  // ('…' → '...'): all three normalised dots map to the same original char,
  // so a partial-fold match would silently delete the unmatched part.
  const startsMidChar = at > 0 && spans[at - 1]![0] === first[0];
  const endsMidChar =
    at + normNeedle.length < norm.length &&
    spans[at + normNeedle.length]![0] < last[1];
  if (startsMidChar || endsMidChar) return null;
  return { start: first[0], end: last[1] };
}

/**
 * Replace the first lenient occurrence of `find` with `replace`. Returns the
 * new text, or null when no match exists.
 */
export function replaceLenient(
  haystack: string,
  find: string,
  replace: string,
): string | null {
  if (find.length === 0) return null;
  // Exact match preserves the tool's original splice semantics.
  const exact = haystack.indexOf(find);
  if (exact !== -1) {
    return (
      haystack.slice(0, exact) + replace + haystack.slice(exact + find.length)
    );
  }
  const match = findLenient(haystack, find);
  if (!match) return null;
  // The lenient span may cover HTML entities (&amp;, &lt;) the needle matched
  // through their decoded forms; splicing the model's raw text there would
  // inject unescaped '<'/'&' into stored HTML and corrupt it on the next
  // innerHTML parse. Escape the replacement on this path — the document is
  // HTML-ish, plain text is what the tool contract promises.
  const escaped = replace
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return haystack.slice(0, match.start) + escaped + haystack.slice(match.end);
}
