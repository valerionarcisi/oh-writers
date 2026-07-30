// pdf-parse@1.1.1 bundles a 2017 pdf.js whose lexer fails NONDETERMINISTICALLY
// on Node 25: the same valid buffer alternates between "bad XRef entry" /
// "Invalid number" and a clean parse across calls in one process (measured
// 99/100 failures on generator output that pdfjs-dist accepts every time —
// the [226] flake, see #116). Tests parse exported PDFs with the current
// pdfjs-dist instead. The app's own pdf-parse usage (PDF import) is untouched.
import type { TextItem } from "pdfjs-dist/types/src/display/api";

const loadPdf = async (buffer: Buffer) => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
};

const isTextItem = (it: unknown): it is TextItem =>
  typeof (it as TextItem).str === "string";

/**
 * Full text of the PDF, page by page. Headings rendered with letter-spacing
 * come back with spaces between glyphs ("L O G L I N E") — assert on
 * `pdfCompactText` when the marker may be a styled heading.
 */
export const pdfText = async (buffer: Buffer): Promise<string> => {
  const doc = await loadPdf(buffer);
  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    parts.push(
      tc.items
        .filter(isTextItem)
        .map((it) => it.str)
        .join("\n"),
    );
  }
  await doc.destroy();
  return parts.join("\n");
};

/** `pdfText` with ALL whitespace stripped — spacing-proof marker checks. */
export const pdfCompactText = async (buffer: Buffer): Promise<string> =>
  (await pdfText(buffer)).replace(/\s+/g, "");

/**
 * Per-item x-position + fontName of the first page. The x tells dialogue
 * (indented) from action (flush-left); the fontName tells a bold run (a
 * distinct font face) from the regular body — the PDF compresses the font
 * NAME into a stream, so a raw-buffer substring check is not reliable, but
 * pdf.js resolves the per-item fontName.
 */
export const pdfFirstPageItems = async (
  buffer: Buffer,
): Promise<Array<{ x: number; str: string; font: string }>> => {
  const doc = await loadPdf(buffer);
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const items = tc.items
    .filter(isTextItem)
    .filter((it) => it.str.trim())
    .map((it) => ({
      x: Math.round(it.transform[4] as number),
      str: it.str.trim(),
      font: String(it.fontName ?? ""),
    }));
  await doc.destroy();
  return items;
};
