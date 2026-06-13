/**
 * Prepends a Fountain title page block to the screenplay text so afterwriting
 * renders the cover page using its native title-page parser.
 *
 * Fountain title page is a key:value block at the very top of the file,
 * separated from the body by a blank line. Empty fields are skipped.
 * The original `fountain` text MUST NOT already start with title-page
 * metadata — callers strip any pre-existing block before re-prepending.
 *
 * The field set is the project's CANONICAL title page (`TitlePage`, 7 fields)
 * — author, basedOn, contact, draftDate, wgaRegistration, notes — so the
 * exported cover matches what the writer authored. Previously this emitted only
 * title/author/draftDate, silently dropping contact / based-on / WGA / notes
 * from the handed-out PDF (BUG-N63b).
 */
import type { TitlePage } from "~/features/projects/title-page.schema";

export interface TitlePageExportFields {
  /** The screenplay/project title shown as the Fountain `Title:` key. */
  readonly title: string;
  /** The canonical project title page (author, basedOn, contact, …). */
  readonly titlePage: TitlePage;
}

const escapeFountainValue = (raw: string): string =>
  raw.replace(/\r?\n/g, " ").trim();

const nonEmpty = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Maps the canonical `TitlePage` model to the Fountain title-page key block
 * afterwriting renders. Pure + exported so the export and a unit test share the
 * exact mapping. Empty fields are omitted (Fountain skips absent keys).
 *
 * Fountain → cover position:
 *   Title      → centred title
 *   Credit     → "Scritto da" above the author (only when an author exists)
 *   Author     → author name
 *   Source     → "Tratto da …" (basedOn)
 *   Draft date → bottom-left footer
 *   Contact    → bottom-left footer (contact block)
 *   Copyright  → WGA registration (Fountain has no WGA key; Copyright is the
 *                closest rights line afterwriting renders)
 *   Notes      → bottom-left footer note
 */
export const titlePageToFountainKeys = (
  fields: TitlePageExportFields,
): string[] => {
  const { title, titlePage } = fields;
  const lines: string[] = [];
  lines.push(`Title: ${escapeFountainValue(title)}`);
  if (nonEmpty(titlePage.author)) {
    lines.push(`Credit: Scritto da`);
    lines.push(`Author: ${escapeFountainValue(titlePage.author)}`);
  }
  if (nonEmpty(titlePage.basedOn)) {
    lines.push(`Source: Tratto da ${escapeFountainValue(titlePage.basedOn)}`);
  }
  if (nonEmpty(titlePage.draftDate)) {
    lines.push(`Draft date: ${escapeFountainValue(titlePage.draftDate)}`);
  }
  if (nonEmpty(titlePage.contact)) {
    lines.push(`Contact: ${escapeFountainValue(titlePage.contact)}`);
  }
  if (nonEmpty(titlePage.wgaRegistration)) {
    lines.push(
      `Copyright: WGA ${escapeFountainValue(titlePage.wgaRegistration)}`,
    );
  }
  if (nonEmpty(titlePage.notes)) {
    lines.push(`Notes: ${escapeFountainValue(titlePage.notes)}`);
  }
  return lines;
};

// ─── WYSIWYG: serialize the authored title-page PM doc ──────────────────────
//
// The frontespizio the writer actually sees + edits lives in `projects.titlePageDoc`
// (a ProseMirror doc: title · centerBlock credits · footerLeft/Center/Right), NOT
// in the 7 scalar `TitlePage` fields (which are often all null while the doc is
// full). The export must reproduce the EDITOR's title page verbatim (WYSIWYG), so
// when a doc is present we serialize IT to the Fountain key block. Region → key:
//   title       → Title
//   centerBlock → Credit (the credit/author lines, in order, joined with newlines)
//   footerLeft  → Draft date    (editor label "Data bozza")
//   footerCenter→ Notes         (editor label "Note")
//   footerRight → Contact       (editor label "Contatti")
// Mirrors the title-page editor's region→label map (placeholders.ts) and the
// import parser's region shape (title-page-from-pdf.ts).

interface PMTextNode {
  readonly type: string;
  readonly text?: string;
  readonly content?: readonly PMTextNode[];
}
export interface TitlePageDocLike {
  readonly type: string;
  readonly content?: readonly PMTextNode[];
}

const regionText = (region: PMTextNode | undefined): string[] => {
  if (!region?.content) return [];
  // A region holds paragraphs; each paragraph's text is the concatenation of its
  // text nodes. Empty paragraphs are dropped so a blank region emits nothing.
  return region.content
    .map((para) =>
      (para.content ?? [])
        .map((t) => t.text ?? "")
        .join("")
        .trim(),
    )
    .filter((line) => line.length > 0);
};

const titleText = (region: PMTextNode | undefined): string =>
  (region?.content ?? [])
    .map((t) => t.text ?? "")
    .join("")
    .trim();

/**
 * True when the doc carries any authored content (a title or any non-empty
 * region) — i.e. worth using as the WYSIWYG source instead of the scalar fields.
 */
export const titlePageDocHasContent = (
  doc: TitlePageDocLike | null | undefined,
): boolean => {
  if (!doc?.content) return false;
  const byType = (name: string) =>
    doc.content!.find((r) => r.type === name) as PMTextNode | undefined;
  if (titleText(byType("title")).length > 0) return true;
  for (const region of [
    "centerBlock",
    "footerLeft",
    "footerCenter",
    "footerRight",
  ]) {
    if (regionText(byType(region)).length > 0) return true;
  }
  return false;
};

/**
 * Serialize the authored title-page PM doc to the Fountain key block. The
 * `fallbackTitle` (the project/screenplay title) is used only when the doc's
 * title region is empty, so the cover always carries a title.
 */
export const titlePageDocToFountainKeys = (
  doc: TitlePageDocLike,
  fallbackTitle: string,
): string[] => {
  const byType = (name: string) =>
    (doc.content ?? []).find((r) => r.type === name) as PMTextNode | undefined;
  const lines: string[] = [];

  const title = titleText(byType("title")) || fallbackTitle.trim();
  lines.push(`Title: ${escapeFountainValue(title)}`);

  // centerBlock = credit lines (e.g. "Valerio Narcisi" / "e" / "Giordano Viozzi").
  // afterwriting renders a multi-line Credit key when given a `\n`-joined value.
  const credit = regionText(byType("centerBlock"));
  if (credit.length > 0) {
    lines.push(`Credit: ${credit.map(escapeFountainValue).join("\n   ")}`);
  }

  const draftDate = regionText(byType("footerLeft"));
  if (draftDate.length > 0) {
    lines.push(`Draft date: ${draftDate.map(escapeFountainValue).join(" ")}`);
  }
  const notes = regionText(byType("footerCenter"));
  if (notes.length > 0) {
    lines.push(`Notes: ${notes.map(escapeFountainValue).join(" ")}`);
  }
  const contact = regionText(byType("footerRight"));
  if (contact.length > 0) {
    lines.push(`Contact: ${contact.map(escapeFountainValue).join(" ")}`);
  }
  return lines;
};

export interface TitlePageExportInput {
  readonly title: string;
  readonly titlePage: TitlePage;
  /** The authored title-page PM doc — the WYSIWYG source, preferred when present. */
  readonly titlePageDoc?: TitlePageDocLike | null;
}

export const prependTitlePageToFountain = (
  fountain: string,
  fields: TitlePageExportInput,
): string => {
  // WYSIWYG: prefer the authored PM doc (what the editor shows). Fall back to the
  // scalar TitlePage fields only when no doc content exists.
  const lines = titlePageDocHasContent(fields.titlePageDoc)
    ? titlePageDocToFountainKeys(fields.titlePageDoc!, fields.title)
    : titlePageToFountainKeys({
        title: fields.title,
        titlePage: fields.titlePage,
      });
  return `${lines.join("\n")}\n\n${fountain.replace(/^\s+/, "")}`;
};
