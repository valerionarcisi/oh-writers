// Pure text sanitizers for AI-generated content.
//
// repairMojibake: when valid UTF-8 bytes get reinterpreted as Latin-1 (or
// Windows-1252) and then re-emitted as UTF-8, a character like `è` becomes
// the two-char sequence `Ã¨`. We compute the broken sequences PROGRAMMATICALLY
// from the correct characters so the source file isn't fragile to invisible
// control bytes in editor/diff tooling.
//
// Strategy: for each (correct) char we want to repair, take its UTF-8 bytes,
// reinterpret them as either Latin-1 OR Windows-1252, take the resulting
// codepoints. That's the broken sequence. We register BOTH variants so any
// decoder behavior is covered.
//
// reflowFountainParagraphs: collapses single \n inside a paragraph into a
// space, while preserving \n\n (paragraph separator) and structural lines
// (scene headings, character cues, parentheticals, transitions) where line
// breaks carry meaning in Fountain.

// ── Char → broken-sequence derivation ────────────────────────────────────────

// Windows-1252 mapping for the 0x80-0x9F range (the only bytes where cp1252
// differs from latin-1). 0x81, 0x8D, 0x8F, 0x90, 0x9D are undefined in cp1252;
// most decoders leave them as the raw byte (treated as latin-1 fallback).
const CP1252_HIGH: ReadonlyArray<number> = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d,
  0x017e, 0x0178,
];

const cpDecode =
  (table: "latin1" | "cp1252") =>
  (byte: number): string => {
    if (byte < 0x80 || byte > 0x9f) return String.fromCharCode(byte);
    if (table === "latin1") return String.fromCharCode(byte);
    return String.fromCharCode(CP1252_HIGH[byte - 0x80] ?? byte);
  };

const utf8Bytes = (ch: string): number[] => {
  const code = ch.codePointAt(0);
  if (code === undefined) return [];
  if (code < 0x80) return [code];
  if (code < 0x800) return [0xc0 | (code >> 6), 0x80 | (code & 0x3f)];
  if (code < 0x10000)
    return [
      0xe0 | (code >> 12),
      0x80 | ((code >> 6) & 0x3f),
      0x80 | (code & 0x3f),
    ];
  return [
    0xf0 | (code >> 18),
    0x80 | ((code >> 12) & 0x3f),
    0x80 | ((code >> 6) & 0x3f),
    0x80 | (code & 0x3f),
  ];
};

const brokenSequence = (ch: string, table: "latin1" | "cp1252"): string =>
  utf8Bytes(ch).map(cpDecode(table)).join("");

// Characters we want to recover. Italian alphabet (vowels + ñ for foreign
// names) + the typographic punctuation Cesare emits. The list is small and
// closed by design — we only repair things we know we'll see, never guess.
const REPAIR_CHARS = [
  // Italian keyboard direct keys (lowercase): à è é ì ò ù
  "à",
  "è",
  "é",
  "ì",
  "ò",
  "ù",
  // Italian keyboard direct keys (uppercase, Shift): À È É Ì Ò Ù
  "À",
  "È",
  "É",
  "Ì",
  "Ò",
  "Ù",
  // Italian keyboard, Shift on accented keys: ° ç §
  "°",
  "ç",
  "Ç",
  "§",
  // Italian keyboard, AltGr / extra: € £
  "€",
  "£",
  // Less common but valid Italian / loanword chars (formal accents, foreign names)
  "á",
  "â",
  "ê",
  "í",
  "î",
  "ó",
  "ô",
  "ú",
  "û",
  "ñ",
  "Á",
  "Â",
  "Ê",
  "Í",
  "Î",
  "Ó",
  "Ô",
  "Ú",
  "Û",
  "Ñ",
  // Typographic punctuation Cesare commonly emits
  "—",
  "–",
  "…",
  "•",
  "“",
  "”",
  "‘",
  "’",
  "«",
  "»",
  "¡",
  "¿",
  "´",
  "¨",
  "¸",
  // Symbols
  "©",
  "®",
  "™",
  "¢",
  "¥",
  "µ",
  "±",
  "×",
  "÷",
  "¼",
  "½",
  "¾",
];

// Build the broken → fixed table, deduplicated.
const buildMojibakeMap = (): ReadonlyArray<readonly [string, string]> => {
  const seen = new Map<string, string>();
  for (const ch of REPAIR_CHARS) {
    for (const table of ["cp1252", "latin1"] as const) {
      const broken = brokenSequence(ch, table);
      if (broken === ch) continue;
      if (!seen.has(broken)) seen.set(broken, ch);
    }
  }
  // Sort longest-first so multi-byte sequences win over prefixes.
  return [...seen.entries()].sort(([a], [b]) => b.length - a.length);
};

const MOJIBAKE_PATTERNS = buildMojibakeMap();

export const repairMojibake = (input: string): string => {
  if (!input) return input;
  // Fast path: no mojibake markers at all.
  if (!input.includes("Ã") && !input.includes("Â") && !input.includes("â")) {
    return input;
  }
  let out = input;
  for (const [broken, fixed] of MOJIBAKE_PATTERNS) {
    if (out.includes(broken)) {
      out = out.split(broken).join(fixed);
    }
  }
  return out;
};

// ── reflowFountainParagraphs ─────────────────────────────────────────────────

// Fountain structural lines whose line breaks must be preserved as-is.
const SCENE_HEADING = /^(INT|EXT|EST|I\/E|INT\.\/EXT|\.[A-Z])/i;
const TRANSITION_RIGHT = /^>?.*TO:\s*$/;
const TRANSITION_LEFT = /^>[^<]*$/;
const CENTERED = /^>.*<\s*$/;
const PAGE_BREAK = /^={3,}\s*$/;
const SECTION_HEADING = /^#{1,6}\s/;
const SYNOPSIS = /^=\s/;
const FORCED_ACTION = /^!/;

// Indented all-caps = character cue. Indented anything else = structural.
const CHARACTER_CUE_INDENTED =
  /^\s+[A-ZÀ-Ý][A-ZÀ-Ý0-9 .'\-]*(\s*\([^)]*\))?\s*$/;
const PARENTHETICAL = /^\s*\([^)]*\)\s*$/;
const INDENTED = /^\s{2,}\S/;

const isStructuralLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (SCENE_HEADING.test(trimmed)) return true;
  if (TRANSITION_RIGHT.test(trimmed)) return true;
  if (CENTERED.test(trimmed)) return true;
  if (TRANSITION_LEFT.test(trimmed)) return true;
  if (PAGE_BREAK.test(trimmed)) return true;
  if (SECTION_HEADING.test(trimmed)) return true;
  if (SYNOPSIS.test(trimmed)) return true;
  if (FORCED_ACTION.test(line)) return true;
  if (CHARACTER_CUE_INDENTED.test(line)) return true;
  if (PARENTHETICAL.test(line)) return true;
  if (INDENTED.test(line)) return true;
  return false;
};

export const reflowFountainParagraphs = (input: string): string => {
  if (!input) return input;
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    out.push(buf.join(" ").replace(/\s+/g, " ").trim());
    buf = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      out.push("");
      continue;
    }
    if (isStructuralLine(line)) {
      flush();
      out.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();

  // Pass 2: merge adjacent action paragraphs that look like a single
  // sentence Cesare soft-wrapped into two paragraphs. Triggers when:
  //   - both are plain action (not structural)
  //   - the first does NOT end with strong punctuation
  // We're conservative: punctuation-terminated paragraphs are LEFT alone
  // because they're likely intentional beats.
  const merged = mergeSoftWrappedActionParagraphs(out);

  return merged.join("\n").replace(/\n{3,}/g, "\n\n");
};

// A line counts as "closed" if it ends with strong punctuation, optionally
// followed by a closing quote / bracket. Open quote (no close) or a comma
// or a hyphen or nothing → considered continuation.
const STRONG_PUNCT_END = /[.!?…:;»)"”’\]]\s*$/;

const mergeSoftWrappedActionParagraphs = (
  paragraphs: ReadonlyArray<string>,
): string[] => {
  const result: string[] = [];
  for (const p of paragraphs) {
    if (p === "" || isStructuralLine(p)) {
      result.push(p);
      continue;
    }
    const prev = result[result.length - 1];
    const prevBeforeBlank = result[result.length - 2];
    // We merge into `prev` only when:
    //   - the immediately previous non-empty entry is action (not structural)
    //   - it ended with `""` separator AND that action did NOT close with punct
    if (
      prev === "" &&
      prevBeforeBlank !== undefined &&
      prevBeforeBlank !== "" &&
      !isStructuralLine(prevBeforeBlank) &&
      !STRONG_PUNCT_END.test(prevBeforeBlank)
    ) {
      // Pop the blank line and merge p into the preceding action.
      result.pop();
      result[result.length - 1] = `${prevBeforeBlank} ${p}`
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    result.push(p);
  }
  return result;
};

// ── Combined: the standard sanitizer applied at any AI write boundary ───────

export const sanitizeAiText = (input: string): string =>
  reflowFountainParagraphs(repairMojibake(input));

// ── toPlainText: strip markup for human-readable previews ───────────────────
//
// Document content is stored in heterogeneous source formats: ProseMirror emits
// HTML (`<p>…</p>`), Cesare emits markdown/fountain (sometimes wrapped in a
// ```fountain fenced block with a Title:/Author:/=== title-page header). A card
// preview must NEVER show that raw source — it shows the first real prose.
//
// This is the single owner of "source → readable plain text". Reuse it anywhere
// a snippet of stored document content is shown to the user.

const stripHtml = (input: string): string => {
  if (!input.includes("<")) return input;
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|h[1-6]|li|div|blockquote|ul|ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
};

const stripInlineMarkdown = (input: string): string =>
  input
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    .replace(/_(.+?)_/gs, "$1")
    .replace(/~~(.+?)~~/gs, "$1")
    .replace(/`(.+?)`/gs, "$1");

// Remove markdown code fences (```lang … ```), keeping the inner content. AI
// often wraps fountain output in a ```fountain block; the fence is noise.
export const stripCodeFences = (input: string): string =>
  input
    .replace(/^[ \t]*```[^\n]*\n?/gm, "")
    .replace(/\n?[ \t]*```[ \t]*$/gm, "");

// A fountain title page is a leading block of `Key: value` lines, optionally
// closed by a `===` page break. It's metadata, not prose, so the preview skips
// past it. We only consume it when it's actually at the very top.
const FOUNTAIN_TITLE_KEY =
  /^(Title|Credit|Author|Authors|Source|Draft date|Date|Contact|Copyright|Notes|Revision|Format)\s*:/i;
const PAGE_BREAK_LINE = /^=+\s*$/;

export const skipFountainTitlePage = (input: string): string => {
  const lines = input.split("\n");
  let index = 0;
  let sawKey = false;
  while (index < lines.length) {
    const line = lines[index]!.trim();
    if (line.length === 0) {
      index += 1;
      continue;
    }
    if (PAGE_BREAK_LINE.test(line)) {
      // A page break only ends the title page if we were inside one.
      if (!sawKey) break;
      index += 1;
      return lines.slice(index).join("\n");
    }
    // Continuation of a previous key (indented) stays part of the title page.
    if (
      FOUNTAIN_TITLE_KEY.test(line) ||
      (sawKey && /^\s/.test(lines[index]!))
    ) {
      sawKey = true;
      index += 1;
      continue;
    }
    break;
  }
  return sawKey ? lines.slice(index).join("\n") : input;
};

// Drop markdown/fountain structural prefixes that aren't prose: heading markers
// (`#`, `##`), blockquote (`>`), list bullets (`-`, `*`, `1.`), synopsis (`=`),
// section (`#`) — keep the text, drop the marker.
const stripBlockMarkers = (line: string): string =>
  line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^=\s+/, "");

export const toPlainText = (raw: string): string => {
  if (!raw) return "";
  const defenced = stripCodeFences(raw);
  const noHtml = stripHtml(defenced);
  const body = skipFountainTitlePage(noHtml);
  const text = body
    .split("\n")
    .map((line) => stripBlockMarkers(line.trim()))
    .map((line) => stripInlineMarkdown(line))
    .filter((line) => line.length > 0 && !PAGE_BREAK_LINE.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
};
