import PDFDocument from "pdfkit";
import type { BudgetLine } from "@oh-writers/domain";

const MARGIN = 54;

const TOP_SHEET_LABELS: Record<string, string> = {
  above_the_line: "Above the Line",
  production: "Production",
  crew: "Crew",
  post_production: "Post-Production",
  contingency: "Contingency",
};

const TOP_SHEET_ORDER = [
  "above_the_line",
  "crew",
  "production",
  "post_production",
  "contingency",
] as const;

const formatEur = (v: number): string =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const lineEstimate = (line: BudgetLine): number =>
  line.quantity !== null && line.rate !== null ? line.quantity * line.rate : 0;

const writeHeader = (
  doc: PDFKit.PDFDocument,
  projectTitle: string,
  grandTotal: number,
  date: string,
) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#111")
    .text(projectTitle.toUpperCase(), { align: "left" });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#666")
    .text(`Budget · ${date}`, { align: "left" });

  doc.moveDown(0.5);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111")
    .text(`Total: ${formatEur(grandTotal)}`, { align: "right" });

  doc
    .moveTo(MARGIN, doc.y + 6)
    .lineTo(doc.page.width - MARGIN, doc.y + 6)
    .strokeColor("#ccc")
    .lineWidth(0.5)
    .stroke();

  doc.moveDown(1);
};

const writeSectionHeader = (
  doc: PDFKit.PDFDocument,
  label: string,
  subtotal: number,
) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#333")
    .text(label.toUpperCase(), { continued: true, characterSpacing: 1 })
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#555")
    .text(`   ${formatEur(subtotal)}`, { align: "right" });

  doc
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(doc.page.width - MARGIN, doc.y + 2)
    .strokeColor("#ddd")
    .lineWidth(0.3)
    .stroke();

  doc.moveDown(0.4);
};

const writeLineItem = (doc: PDFKit.PDFDocument, line: BudgetLine) => {
  const estimate = lineEstimate(line);
  const colName = doc.page.width - MARGIN * 2 - 100;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#222")
    .text(line.name, MARGIN, doc.y, { width: colName, continued: false });

  const y = doc.y - doc.currentLineHeight(true);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#444")
    .text(formatEur(estimate), MARGIN + colName, y, {
      width: 100,
      align: "right",
    });

  doc.moveDown(0.1);
};

const writeSubtotalRow = (
  doc: PDFKit.PDFDocument,
  label: string,
  amount: number,
) => {
  const colName = doc.page.width - MARGIN * 2 - 100;
  doc.moveDown(0.3);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#333")
    .text(`${label} subtotal`, MARGIN, doc.y, {
      width: colName,
      continued: false,
    });

  const y = doc.y - doc.currentLineHeight(true);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#333")
    .text(formatEur(amount), MARGIN + colName, y, {
      width: 100,
      align: "right",
    });

  doc.moveDown(0.8);
};

const writeGrandTotal = (doc: PDFKit.PDFDocument, grandTotal: number) => {
  doc
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(doc.page.width - MARGIN, doc.y + 2)
    .strokeColor("#333")
    .lineWidth(0.8)
    .stroke();

  doc.moveDown(0.5);

  const colName = doc.page.width - MARGIN * 2 - 100;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111")
    .text("GRAND TOTAL", MARGIN, doc.y, { width: colName, continued: false });

  const y = doc.y - doc.currentLineHeight(true);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111")
    .text(formatEur(grandTotal), MARGIN + colName, y, {
      width: 100,
      align: "right",
    });
};

export const buildBudgetPdf = (
  projectTitle: string,
  lines: BudgetLine[],
  date: string,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const grandTotal = lines.reduce((sum, l) => sum + lineEstimate(l), 0);

    writeHeader(doc, projectTitle, grandTotal, date);

    const byTopSheet = new Map<string, BudgetLine[]>();
    for (const line of lines) {
      const bucket = byTopSheet.get(line.topSheet) ?? [];
      bucket.push(line);
      byTopSheet.set(line.topSheet, bucket);
    }

    for (const key of TOP_SHEET_ORDER) {
      const sectionLines = byTopSheet.get(key);
      if (!sectionLines || sectionLines.length === 0) continue;

      const subtotal = sectionLines.reduce(
        (sum, l) => sum + lineEstimate(l),
        0,
      );
      const label = TOP_SHEET_LABELS[key] ?? key;

      writeSectionHeader(doc, label, subtotal);

      for (const line of sectionLines) {
        writeLineItem(doc, line);
      }

      writeSubtotalRow(doc, label, subtotal);
    }

    writeGrandTotal(doc, grandTotal);

    doc.end();
  });
