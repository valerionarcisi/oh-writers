import PDFDocument from "pdfkit";
import { CATEGORY_META, type BreakdownCategory } from "@oh-writers/domain";

export interface PdfRow {
  category: BreakdownCategory;
  name: string;
  totalQuantity: number;
  scenes: number[];
}

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

    const byCat = new Map<BreakdownCategory, PdfRow[]>();
    for (const r of rows) {
      const list = byCat.get(r.category) ?? [];
      list.push(r);
      byCat.set(r.category, list);
    }

    for (const [cat, items] of byCat) {
      doc
        .font("Courier-Bold")
        .fontSize(11)
        .text(`${CATEGORY_META[cat].labelEn} (${items.length})`);
      doc.font("Courier").fontSize(9);
      for (const it of items) {
        const scenes =
          it.scenes.length > 6
            ? `${it.scenes.slice(0, 6).join(", ")}…`
            : it.scenes.join(", ");
        doc.text(`  • ${it.name}  ×${it.totalQuantity}  → scenes ${scenes}`);
      }
      doc.moveDown(0.5);
    }
    doc.end();
  });
