import PDFDocument from "pdfkit";
import type { ShootingDayView } from "../server/schedule.server";

const MARGIN = 36;
const COL_WIDTHS = {
  scene: 40,
  heading: 180,
  intExt: 36,
  dayNight: 48,
  location: 130,
  pages: 36,
};
const ROW_HEIGHT = 14;
const HEADER_HEIGHT = 16;

const tableWidth = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

const drawTableHeader = (doc: PDFKit.PDFDocument, x: number, y: number) => {
  doc
    .rect(x, y, tableWidth, HEADER_HEIGHT)
    .fillColor("#222")
    .fill();

  const cols = [
    { label: "SC", width: COL_WIDTHS.scene },
    { label: "HEADING", width: COL_WIDTHS.heading },
    { label: "I/E", width: COL_WIDTHS.intExt },
    { label: "D/N", width: COL_WIDTHS.dayNight },
    { label: "LOCATION", width: COL_WIDTHS.location },
    { label: "PG", width: COL_WIDTHS.pages },
  ];

  let cx = x + 4;
  doc.font("Courier-Bold").fontSize(7).fillColor("#fff");
  for (const col of cols) {
    doc.text(col.label, cx, y + 4, { width: col.width - 4, lineBreak: false });
    cx += col.width;
  }
};

const drawStripRow = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  strip: ShootingDayView["strips"][number],
  isEven: boolean,
) => {
  doc
    .rect(x, y, tableWidth, ROW_HEIGHT)
    .fillColor(isEven ? "#f7f7f5" : "#fff")
    .fill();

  doc.rect(x, y, tableWidth, ROW_HEIGHT).strokeColor("#ddd").lineWidth(0.25).stroke();

  const cols = [
    { value: String(strip.sceneNumber), width: COL_WIDTHS.scene },
    { value: strip.sceneHeading, width: COL_WIDTHS.heading },
    { value: strip.intExt, width: COL_WIDTHS.intExt },
    { value: strip.timeOfDay ?? "", width: COL_WIDTHS.dayNight },
    { value: strip.location, width: COL_WIDTHS.location },
    { value: String(strip.pageCount), width: COL_WIDTHS.pages },
  ];

  let cx = x + 4;
  doc.font("Courier").fontSize(7).fillColor("#000");
  for (const col of cols) {
    doc.text(col.value, cx, y + 3, {
      width: col.width - 4,
      lineBreak: false,
      ellipsis: true,
    });
    cx += col.width;
  }
};

export const buildSchedulePdf = (
  projectTitle: string,
  days: ShootingDayView[],
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: MARGIN, layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Title page header
    doc
      .font("Courier-Bold")
      .fontSize(16)
      .fillColor("#000")
      .text(`${projectTitle} — Shooting Schedule`, { align: "center" })
      .moveDown(0.4);

    doc
      .font("Courier")
      .fontSize(9)
      .fillColor("#555")
      .text(
        `Generato il ${new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}  ·  ${days.length} ${days.length === 1 ? "giornata" : "giornate"}`,
        { align: "center" },
      )
      .moveDown(1.2);

    const pageWidth =
      doc.page.width - MARGIN * 2;
    const x = MARGIN + (pageWidth - tableWidth) / 2;

    for (const day of days) {
      if (day.strips.length === 0) continue;

      // Day banner
      const dateLabel = day.date
        ? new Date(day.date).toLocaleDateString("it-IT", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "";

      const bannerHeight = 18;
      const blockHeight =
        bannerHeight + HEADER_HEIGHT + day.strips.length * ROW_HEIGHT + 16;

      // Add new page when block won't fit
      if (doc.y + blockHeight > doc.page.height - MARGIN) {
        doc.addPage();
      }

      const bannerY = doc.y;

      doc
        .rect(x, bannerY, tableWidth, bannerHeight)
        .fillColor("#1a1a1a")
        .fill();

      doc
        .font("Courier-Bold")
        .fontSize(9)
        .fillColor("#fff")
        .text(
          `GIORNATA ${day.dayNumber}${dateLabel ? `   ${dateLabel.toUpperCase()}` : ""}   ·   ${day.strips.length} SCENE  ·  ${day.totalPageCount} PAG`,
          x + 6,
          bannerY + 5,
          { width: tableWidth - 12, lineBreak: false },
        );

      drawTableHeader(doc, x, bannerY + bannerHeight);

      let rowY = bannerY + bannerHeight + HEADER_HEIGHT;
      for (let i = 0; i < day.strips.length; i++) {
        drawStripRow(doc, x, rowY, day.strips[i]!, i % 2 === 0);
        rowY += ROW_HEIGHT;
      }

      doc.y = rowY + 12;
    }

    doc.end();
  });
