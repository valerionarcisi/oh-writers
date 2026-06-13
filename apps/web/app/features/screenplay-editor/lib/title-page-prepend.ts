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

export const prependTitlePageToFountain = (
  fountain: string,
  fields: TitlePageExportFields,
): string => {
  const lines = titlePageToFountainKeys(fields);
  return `${lines.join("\n")}\n\n${fountain.replace(/^\s+/, "")}`;
};
