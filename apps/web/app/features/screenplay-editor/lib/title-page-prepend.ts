/**
 * Prepends a Fountain title page block to the screenplay text so afterwriting
 * renders the cover page using its native title-page parser.
 *
 * Fountain title page is a key:value block at the very top of the file,
 * separated from the body by a blank line. Empty fields are skipped.
 * Multi-line values use indented continuation lines (the parser appends any
 * non-key line to the previous key). A blank line ends the block, so no
 * field may emit one.
 *
 * afterwriting placement: Title/Credit/Author/Source are centered, Notes
 * lands bottom-left, and Draft date + Contact land bottom-right.
 *
 * The original `fountain` text MUST NOT already start with title-page
 * metadata — callers strip any pre-existing block before re-prepending.
 */
import type { TitlePageDocFields } from "~/features/projects/title-page-pm/export-fields";

export interface TitlePageFields {
  title: string;
  /** Centered credit block. Rendered as the Fountain `Author` value. */
  authorLines: readonly string[];
  /**
   * Extra credit line above the author (e.g. "di"). Null when the author
   * lines already carry their own credit phrasing.
   */
  creditLine: string | null;
  sourceLines: readonly string[];
  draftDateLines: readonly string[];
  notesLines: readonly string[];
  contactLines: readonly string[];
}

/** Legacy `projects.title_page_*` columns, used when no PM doc exists. */
export interface LegacyTitlePageColumns {
  title: string;
  author: string | null;
  basedOn: string | null;
  contact: string | null;
  notes: string | null;
  draftDate: string | null;
}

const sanitizeLine = (raw: string): string => raw.replace(/\r?\n/g, " ").trim();

const toLines = (value: string | null): readonly string[] =>
  value === null
    ? []
    : value
        .split("\n")
        .map(sanitizeLine)
        .filter((line) => line.length > 0);

// "di Mario Rossi" / "Scritto da ..." / "Written by ..." already carry the
// credit phrasing — injecting another credit line would duplicate it.
const carriesOwnCredit = (line: string): boolean =>
  /^(di\s|scritto\s|written\s)/i.test(line);

/**
 * Merges the frontespizio PM doc (the surface the user actually edits) with
 * the legacy columns (PDF-import era). Per-region: the doc wins when it has
 * text, the legacy column fills the gap otherwise.
 */
export const buildTitlePageFields = (
  legacy: LegacyTitlePageColumns,
  doc: TitlePageDocFields | null,
): TitlePageFields => {
  const docAuthor = doc?.centerLines ?? [];
  const authorLines = docAuthor.length > 0 ? docAuthor : toLines(legacy.author);
  const usesDocAuthor = docAuthor.length > 0;
  const firstAuthorLine = authorLines[0] ?? "";

  return {
    title: doc?.title || legacy.title,
    authorLines,
    // The doc's center block is free-form ("Written by\nName") — never
    // decorate it. A bare legacy author name gets the standard "di" credit.
    creditLine:
      authorLines.length > 0 &&
      !usesDocAuthor &&
      !carriesOwnCredit(firstAuthorLine)
        ? "di"
        : null,
    sourceLines: toLines(legacy.basedOn),
    draftDateLines:
      (doc?.footerLeftLines.length ?? 0) > 0
        ? (doc?.footerLeftLines ?? [])
        : toLines(legacy.draftDate),
    notesLines:
      (doc?.footerCenterLines.length ?? 0) > 0
        ? (doc?.footerCenterLines ?? [])
        : toLines(legacy.notes),
    contactLines:
      (doc?.footerRightLines.length ?? 0) > 0
        ? (doc?.footerRightLines ?? [])
        : toLines(legacy.contact),
  };
};

const keyedValue = (key: string, lines: readonly string[]): string[] => {
  const clean = lines.map(sanitizeLine).filter((line) => line.length > 0);
  if (clean.length === 0) return [];
  const [first, ...rest] = clean;
  return [`${key}: ${first}`, ...rest.map((line) => `   ${line}`)];
};

export const prependTitlePageToFountain = (
  fountain: string,
  fields: TitlePageFields,
): string => {
  const lines = [
    ...keyedValue("Title", [fields.title]),
    ...keyedValue("Credit", fields.creditLine ? [fields.creditLine] : []),
    ...keyedValue("Author", fields.authorLines),
    ...keyedValue("Source", fields.sourceLines),
    ...keyedValue("Draft date", fields.draftDateLines),
    ...keyedValue("Notes", fields.notesLines),
    ...keyedValue("Contact", fields.contactLines),
  ];
  return `${lines.join("\n")}\n\n${fountain.replace(/^\s+/, "")}`;
};
