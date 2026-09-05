/**
 * Spec 89 — AI disclosure stamp, screenplay PDF.
 *
 * The screenplay PDF is rendered by `afterwriting` (an external CLI, see
 * pdf-screenplay.ts) — unlike every other export in this spec, there's no
 * pdfkit call we control to inject a note into. This post-processes the
 * ALREADY-RENDERED PDF with pdf-lib, stamping a small note in the
 * bottom-right corner of every page — independent of whether the writer
 * chose to include a cover page, since the note is a property of the whole
 * document, not of any one page's content.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const FOOTER_MARGIN = 24;
const FOOTER_FONT_SIZE = 7;

export const stampAiDisclosureFooter = async (
  pdfBuffer: Buffer,
  note: string,
): Promise<Buffer> => {
  const doc = await PDFDocument.load(pdfBuffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const textWidth = font.widthOfTextAtSize(note, FOOTER_FONT_SIZE);

  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    page.drawText(note, {
      x: width - FOOTER_MARGIN - textWidth,
      y: FOOTER_MARGIN,
      size: FOOTER_FONT_SIZE,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return Buffer.from(await doc.save());
};
