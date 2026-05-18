import PDFDocument from "pdfkit";
import type { ShotListCsvScene } from "./shot-list-csv";

// Industry-standard letter-size margin (0.5 in = 36pt).
const MARGIN = 36;

// Column widths in points for the shot table (letter page = 612pt usable width
// after two 36pt margins = 540pt).
const COL_SHOT = 36;
const COL_CAM = 28;
const COL_SIZE = 44;
const COL_MOVE = 68;
const COL_MIN = 40;
const COL_NOTES = 540 - COL_SHOT - COL_CAM - COL_SIZE - COL_MOVE - COL_MIN;

const TABLE_ROW_HEIGHT = 14;

const drawTableHeader = (doc: PDFKit.PDFDocument, y: number) => {
  const headers = ["Shot #", "Cam", "Size", "Movement", "Min", "Notes"];
  const widths = [COL_SHOT, COL_CAM, COL_SIZE, COL_MOVE, COL_MIN, COL_NOTES];
  let x = MARGIN;
  doc.font("Courier-Bold").fontSize(7).fillColor("#555");
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i]!, x + 2, y + 3, { width: widths[i]! - 4, lineBreak: false });
    x += widths[i]!;
  }
  doc
    .moveTo(MARGIN, y + TABLE_ROW_HEIGHT)
    .lineTo(MARGIN + 540, y + TABLE_ROW_HEIGHT)
    .strokeColor("#ccc")
    .lineWidth(0.5)
    .stroke();
};

const drawShotRow = (
  doc: PDFKit.PDFDocument,
  y: number,
  shot: { position: number; camera: string; size: string; movement: string; estimatedMinutes: number | null; notes: string | null },
  isEven: boolean,
) => {
  if (isEven) {
    doc
      .rect(MARGIN, y, 540, TABLE_ROW_HEIGHT)
      .fillColor("#f9f9f9")
      .fill();
  }

  const cols = [
    { text: String(shot.position + 1), width: COL_SHOT },
    { text: shot.camera, width: COL_CAM },
    { text: shot.size, width: COL_SIZE },
    { text: shot.movement, width: COL_MOVE },
    { text: shot.estimatedMinutes !== null ? String(shot.estimatedMinutes) : "", width: COL_MIN },
    { text: shot.notes ?? "", width: COL_NOTES },
  ];

  let x = MARGIN;
  doc.font("Courier").fontSize(7).fillColor("#111");
  for (const col of cols) {
    doc.text(col.text, x + 2, y + 3, { width: col.width - 4, lineBreak: false, ellipsis: true });
    x += col.width;
  }
};

/**
 * Renders a full shot list into a PDF buffer following the industry-standard
 * per-scene-header + shots-table layout used by Shot Lister and StudioBinder.
 */
export const buildShotListPdf = (
  projectTitle: string,
  scenes: ShotListCsvScene[],
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Cover header
    doc
      .font("Courier-Bold")
      .fontSize(14)
      .fillColor("#000")
      .text(`${projectTitle} — Shot List`, { align: "center" });
    doc
      .font("Courier")
      .fontSize(8)
      .fillColor("#777")
      .text(new Date().toISOString().slice(0, 10), { align: "center" });
    doc.moveDown(1);

    for (const scene of scenes) {
      // Scene heading band
      doc
        .rect(MARGIN, doc.y, 540, 18)
        .fillColor("#111")
        .fill();
      doc
        .font("Courier-Bold")
        .fontSize(9)
        .fillColor("#fff")
        .text(
          `SC.${scene.sceneNumber}  ${scene.heading}`,
          MARGIN + 4,
          doc.y - 18 + 4,
          { width: 536, lineBreak: false, ellipsis: true },
        );
      doc.moveDown(0.1);

      if (scene.shots.length === 0) {
        doc
          .font("Courier")
          .fontSize(7)
          .fillColor("#888")
          .text("  No shots planned.", MARGIN + 4, doc.y + 4);
        doc.moveDown(0.8);
        continue;
      }

      const headerY = doc.y + 2;
      drawTableHeader(doc, headerY);
      doc.y = headerY + TABLE_ROW_HEIGHT + 2;

      for (let i = 0; i < scene.shots.length; i++) {
        if (doc.y + TABLE_ROW_HEIGHT > doc.page.height - MARGIN) {
          doc.addPage();
        }
        drawShotRow(doc, doc.y, scene.shots[i]!, i % 2 === 1);
        doc.y += TABLE_ROW_HEIGHT;
      }

      doc.moveDown(1);
    }

    doc.end();
  });
