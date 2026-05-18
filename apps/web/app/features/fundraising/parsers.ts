const MONTHS_IT: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

const stripTags = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

export const htmlToText = (html: string | null | undefined): string =>
  html ? stripTags(html) : "";

export type ParsedDeadline = {
  date: Date | null;
  text: string | null;
};

export const parseItalianDeadline = (raw: string): ParsedDeadline => {
  if (!raw) return { date: null, text: null };
  const lower = raw.toLowerCase();

  const isoMatch = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    const date = new Date(
      Date.UTC(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3], 23, 59, 59),
    );
    return Number.isNaN(date.getTime())
      ? { date: null, text: raw }
      : { date, text: raw };
  }

  const slashMatch = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slashMatch && slashMatch[1] && slashMatch[2] && slashMatch[3]) {
    const y = slashMatch[3];
    const year = y.length === 2 ? 2000 + +y : +y;
    const date = new Date(
      Date.UTC(year, +slashMatch[2] - 1, +slashMatch[1], 23, 59, 59),
    );
    return Number.isNaN(date.getTime())
      ? { date: null, text: raw }
      : { date, text: raw };
  }

  const itMatch = lower.match(
    /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(\d{4}))?\b/,
  );
  if (itMatch && itMatch[1] && itMatch[2]) {
    const month = MONTHS_IT[itMatch[2]];
    if (!month) return { date: null, text: raw };
    const year = itMatch[3] ? +itMatch[3] : new Date().getUTCFullYear();
    const date = new Date(Date.UTC(year, month - 1, +itMatch[1], 23, 59, 59));
    return Number.isNaN(date.getTime())
      ? { date: null, text: raw }
      : { date, text: raw };
  }

  return { date: null, text: raw };
};

export type ParsedAmount = {
  min: number | null;
  max: number | null;
  text: string | null;
};

const normalizeAmount = (raw: string): number | null => {
  const cleaned = raw
    .replace(/\./g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

const expandShortAmount = (raw: string, suffix: string): number | null => {
  const base = normalizeAmount(raw);
  if (base === null) return null;
  switch (suffix.toLowerCase()) {
    case "k":
    case "mila":
      return base * 1000;
    case "m":
    case "mln":
    case "milioni":
    case "milione":
      return base * 1000000;
    default:
      return base;
  }
};

export const parseItalianAmount = (raw: string): ParsedAmount => {
  if (!raw) return { min: null, max: null, text: null };

  const text = raw;

  const rangeRegex =
    /(?:da\s+)?(?:€\s*)?([\d.,]+)\s*(k|mila|m|mln|milioni|milione)?\s*(?:€|euro|eur)?\s*(?:a|fino a|-|–)\s*(?:€\s*)?([\d.,]+)\s*(k|mila|m|mln|milioni|milione)?\s*(?:€|euro|eur)?/i;
  const rangeMatch = raw.match(rangeRegex);
  if (rangeMatch && rangeMatch[1] && rangeMatch[3]) {
    return {
      min: expandShortAmount(rangeMatch[1], rangeMatch[2] ?? ""),
      max: expandShortAmount(rangeMatch[3], rangeMatch[4] ?? ""),
      text,
    };
  }

  const singleRegex =
    /(?:€\s*|fino a\s+|max\s+|massimo\s+)?([\d.,]+)\s*(k|mila|m|mln|milioni|milione)?\s*(?:€|euro|eur)?/i;
  const singleMatch = raw.match(singleRegex);
  if (singleMatch && singleMatch[1]) {
    const value = expandShortAmount(singleMatch[1], singleMatch[2] ?? "");
    if (value === null || value < 100) return { min: null, max: null, text };
    return { min: null, max: value, text };
  }

  return { min: null, max: null, text };
};
