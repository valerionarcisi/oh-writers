/**
 * Prepends a Fountain title page block to the screenplay text so afterwriting
 * renders the cover page using its native title-page parser.
 *
 * Fountain title page is a key:value block at the very top of the file,
 * separated from the body by a blank line. Empty fields are skipped.
 * The original `fountain` text MUST NOT already start with title-page
 * metadata — callers strip any pre-existing block before re-prepending.
 */
export interface TitlePageFields {
  title: string;
  author: string | null;
  draftDate: string | null;
}

const escapeFountainValue = (raw: string): string =>
  raw.replace(/\r?\n/g, " ").trim();

export const prependTitlePageToFountain = (
  fountain: string,
  fields: TitlePageFields,
): string => {
  const lines: string[] = [];
  lines.push(`Title: ${escapeFountainValue(fields.title)}`);
  if (fields.author) {
    lines.push(`Credit: Written by`);
    lines.push(`Author: ${escapeFountainValue(fields.author)}`);
  }
  if (fields.draftDate) {
    lines.push(`Draft date: ${escapeFountainValue(fields.draftDate)}`);
  }
  return `${lines.join("\n")}\n\n${fountain.replace(/^\s+/, "")}`;
};
