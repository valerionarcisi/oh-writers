import PDFDocument from "pdfkit";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";

export interface PdfRow {
  category: BreakdownCategory;
  name: string;
  totalQuantity: number;
  scenes: number[];
}

/** A category group header line + its element lines, ready to print. */
export interface BreakdownPdfGroup {
  readonly header: string;
  readonly elements: readonly string[];
}

/**
 * Pure text-shaping for the breakdown PDF, split from pdfkit I/O so it is
 * unit-testable. Uses the IT category label (the product is IT-localised) and
 * emits EVERY scene an element appears in — no truncation (BUG-N63d).
 */
export const breakdownPdfGroups = (rows: PdfRow[]): BreakdownPdfGroup[] => {
  const byCat = new Map<BreakdownCategory, PdfRow[]>();
  for (const r of rows) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }
  const groups: BreakdownPdfGroup[] = [];
  for (const [cat, items] of byCat) {
    groups.push({
      header: `${CATEGORY_META[cat].labelIt} (${items.length})`,
      elements: items.map(
        (it) =>
          `  • ${it.name}  ×${it.totalQuantity}  → scene ${it.scenes.join(", ")}`,
      ),
    });
  }
  return groups;
};

export const buildBreakdownPdf = (
  projectTitle: string,
  rows: PdfRow[],
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 36 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .font("Courier-Bold")
      .fontSize(14)
      .text(`${projectTitle} — Breakdown`, { align: "center" });
    doc.moveDown();

    for (const group of breakdownPdfGroups(rows)) {
      doc.font("Courier-Bold").fontSize(11).text(group.header);
      doc.font("Courier").fontSize(9);
      for (const line of group.elements) {
        doc.text(line);
      }
      doc.moveDown(0.5);
    }
    doc.end();
  });
