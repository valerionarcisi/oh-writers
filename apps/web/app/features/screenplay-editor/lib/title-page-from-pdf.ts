// Pass 0 of the PDF import pipeline: isolate and structure the title page.
//
// Why a separate pass: the existing Pass 1 cleanup (fountain-from-pdf.ts) is
// designed to drop production noise from the screenplay body. Title pages are
// shaped completely differently (centered title, free-form credits block,
// 3-column footer) and would be mangled by those rules. Pass 0 runs first,
// extracts the title-page lines, and hands the rest off to Pass 1 unchanged.

export interface TitlePageDocJSON {
  type: "doc";
  content: [
    TitleNode,
    BlockNode<"centerBlock">,
    BlockNode<"footerLeft">,
    BlockNode<"footerCenter">,
    BlockNode<"footerRight">,
  ];
}

interface TitleNode {
  type: "title";
  content?: Array<{ type: "text"; text: string }>;
}

interface BlockNode<T extends string> {
  type: T;
  content: Array<ParaNode>;
}

interface ParaNode {
  type: "para";
  content?: Array<{ type: "text"; text: string }>;
}

const SLUGLINE_RE =
  /^(INT\.?|EST\.?|EXT\.?|INT\.?\/EXT\.?|I\.?\/E\.?|INSERT|FADE\s+IN:?)\b/i;
const FOUNTAIN_KEY_RE = /^([A-Za-z][A-Za-z\s]*?)\s*:\s*(.+)$/;
const FOOTER_TRIPLE_RE = /\s{4,}/g;
const MAX_HEAD_LINES_BEFORE_SLUG = 15;

export interface ExtractResult {
  /** PM doc JSON for the title page, or null if no title page detected. */
  doc: TitlePageDocJSON | null;
  /**
   * Number of raw lines (including blanks) consumed from the start. Callers
   * pass `rawText.split("\n").slice(consumed).join("\n")` to the body parser.
   * 0 when no title page was detected.
   */
  consumedLines: number;
}

const para = (text: string): ParaNode =>
  text.length > 0
    ? { type: "para", content: [{ type: "text", text }] }
    : { type: "para" };

const emptyPara = (): ParaNode => ({ type: "para" });

const titleNode = (text: string): TitleNode =>
  text.length > 0
    ? { type: "title", content: [{ type: "text", text }] }
    : { type: "title" };

const buildDoc = (parts: {
  title: string;
  centerLines: string[];
  footerLeft: string[];
  footerCenter: string[];
  footerRight: string[];
}): TitlePageDocJSON => {
  const center: ParaNode[] = parts.centerLines.length
    ? parts.centerLines.map(para)
    : [emptyPara()];
  const fl: ParaNode[] = parts.footerLeft.length
    ? parts.footerLeft.map(para)
    : [emptyPara()];
  const fc: ParaNode[] = parts.footerCenter.length
    ? parts.footerCenter.map(para)
    : [emptyPara()];
  const fr: ParaNode[] = parts.footerRight.length
    ? parts.footerRight.map(para)
    : [emptyPara()];
  return {
    type: "doc",
    content: [
      titleNode(parts.title),
      { type: "centerBlock", content: center },
      { type: "footerLeft", content: fl },
      { type: "footerCenter", content: fc },
      { type: "footerRight", content: fr },
    ],
  };
};

interface IsolateResult {
  candidate: string[];
  consumedLines: number;
}

// Walk the raw lines until the first slugline. The slugline itself stays in
// the body — only the lines strictly before it are returned as candidates.
const isolateFirstPageLines = (rawText: string): IsolateResult => {
  const lines = rawText.split("\n");
  let nonBlankSeen = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]?.trim() ?? "";
    if (t.length === 0) continue;
    if (SLUGLINE_RE.test(t)) {
      // Title page must have at least one non-blank line before the slugline,
      // and the slugline must appear past the head threshold to be plausible.
      if (nonBlankSeen === 0) return { candidate: [], consumedLines: 0 };
      if (nonBlankSeen < MAX_HEAD_LINES_BEFORE_SLUG) {
        return { candidate: lines.slice(0, i), consumedLines: i };
      }
      return { candidate: lines.slice(0, i), consumedLines: i };
    }
    nonBlankSeen++;
  }
  // No slugline found at all — treat the whole input as candidate so we still
  // try to extract a title page; the body parser will produce an empty result.
  return { candidate: lines, consumedLines: 0 };
};

// Fountain-style key:value title page. Highland and many fountain exports use
// this format directly; some PDF exports preserve it verbatim.
const tryFountainKeyValue = (candidate: string[]): TitlePageDocJSON | null => {
  const pairs: Array<{ key: string; value: string }> = [];
  for (const line of candidate) {
    const t = line.trim();
    if (t.length === 0) continue;
    const m = t.match(FOUNTAIN_KEY_RE);
    if (!m) return null;
    pairs.push({ key: m[1]!.toLowerCase().trim(), value: m[2]!.trim() });
  }
  if (pairs.length === 0) return null;
  const find = (...keys: string[]): string => {
    for (const k of keys) {
      const v = pairs.find((p) => p.key === k)?.value;
      if (v) return v;
    }
    return "";
  };
  const title = find("title");
  if (!title) return null;
  const credit = find("credit", "written by");
  const author = find("author", "authors");
  const draftDate = find("draft date", "date");
  const contact = find("contact");
  const source = find("source", "based on");
  const center = [credit, author, source].filter((s) => s.length > 0);
  const footerLeft = draftDate ? [draftDate] : [];
  const footerRight = contact ? [contact] : [];
  return buildDoc({
    title,
    centerLines: center,
    footerLeft,
    footerCenter: [],
    footerRight,
  });
};

// Heuristic title detection over visually-formatted candidates: the first
// ALL-CAPS line that is reasonably long for the page is the title.
const pickTitle = (lines: string[]): { title: string; index: number } => {
  const lengths = lines
    .map((l) => l.trim().length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (lengths.length === 0) return { title: "", index: -1 };
  const p60 = lengths[Math.floor(lengths.length * 0.6)] ?? 1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]?.trim() ?? "";
    if (t.length === 0) continue;
    const isAllCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
    // Accept short titles too (movies are often <20 chars), but require
    // either ALL-CAPS or being above the 60th percentile in length.
    if (isAllCaps || t.length >= p60) {
      return { title: t, index: i };
    }
  }
  // Fallback: first non-empty line.
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  return { title: lines[firstIdx]?.trim() ?? "", index: firstIdx };
};

const splitFooterLine = (
  line: string,
): { left: string; center: string; right: string } => {
  const runs = line.split(FOOTER_TRIPLE_RE).filter((s) => s.trim().length > 0);
  if (runs.length >= 3)
    return {
      left: runs[0]!.trim(),
      center: runs[1]!.trim(),
      right: runs.slice(2).join(" ").trim(),
    };
  if (runs.length === 2)
    return { left: runs[0]!.trim(), center: "", right: runs[1]!.trim() };
  return { left: line.trim(), center: "", right: "" };
};

const extractVisual = (candidate: string[]): TitlePageDocJSON | null => {
  const nonBlank = candidate.filter((l) => l.trim().length > 0);
  if (nonBlank.length === 0) return null;
  const { title, index: titleIdx } = pickTitle(candidate);
  if (!title) return null;

  // Skip up to 2 leading blank lines after the title before we start the
  // centerBlock — it's the typical "Title\n\nWritten by" cushion.
  let cursor = titleIdx + 1;
  let blankSkipped = 0;
  while (
    cursor < candidate.length &&
    blankSkipped < 2 &&
    (candidate[cursor]?.trim() ?? "").length === 0
  ) {
    cursor++;
    blankSkipped++;
  }

  // Footer = last "third" of remaining non-blank lines, but at least keep
  // 1 line in centerBlock if possible.
  const remaining = candidate.slice(cursor);
  const remainingNonBlankCount = remaining.filter(
    (l) => l.trim().length > 0,
  ).length;
  const footerCount = Math.max(
    0,
    Math.min(remainingNonBlankCount, Math.ceil(remainingNonBlankCount / 3)),
  );

  // Walk remaining lines from the end, collecting `footerCount` non-blank
  // lines into the footer bucket. The rest goes into centerBlock.
  const footerLines: string[] = [];
  let footerBoundary = remaining.length;
  let collected = 0;
  for (let i = remaining.length - 1; i >= 0 && collected < footerCount; i--) {
    const t = remaining[i]?.trim() ?? "";
    if (t.length === 0) continue;
    footerLines.unshift(t);
    footerBoundary = i;
    collected++;
  }

  const centerLines = remaining
    .slice(0, footerBoundary)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let footerLeft: string[] = [];
  let footerCenter: string[] = [];
  let footerRight: string[] = [];

  for (const line of footerLines) {
    const split = splitFooterLine(line);
    if (split.center || split.right) {
      if (split.left) footerLeft.push(split.left);
      if (split.center) footerCenter.push(split.center);
      if (split.right) footerRight.push(split.right);
    } else {
      footerLeft.push(split.left);
    }
  }

  return buildDoc({
    title,
    centerLines,
    footerLeft,
    footerCenter,
    footerRight,
  });
};

/**
 * Attempt to extract a title-page PM doc from the raw PDF text. Returns
 * `{ doc: null, consumedLines: 0 }` when no title page is detected so callers
 * can hand the entire input to Pass 1 unchanged.
 */
export const extractTitlePageFromPdf = (rawText: string): ExtractResult => {
  if (!rawText || rawText.trim().length === 0) {
    return { doc: null, consumedLines: 0 };
  }
  const { candidate, consumedLines } = isolateFirstPageLines(rawText);
  if (candidate.length === 0) return { doc: null, consumedLines: 0 };
  // Reject when there's no slugline AND the input looks like a single block.
  if (consumedLines === 0) return { doc: null, consumedLines: 0 };

  const fountainStyle = tryFountainKeyValue(candidate);
  if (fountainStyle) return { doc: fountainStyle, consumedLines };

  const visual = extractVisual(candidate);
  if (!visual) return { doc: null, consumedLines: 0 };
  return { doc: visual, consumedLines };
};
