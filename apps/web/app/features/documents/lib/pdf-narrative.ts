import PDFDocument from "pdfkit";

export interface NarrativePdfInput {
  projectTitle: string;
  author: string | null;
  draftDate: string | null;
  logline: string;
  synopsis: string;
  treatment: string;
}

// Industry-standard margin: 2.5cm ≈ 72pt (1in). pdfkit default is 72; we make
// it explicit so layout changes here stay intentional.
const MARGIN = 72;

const SECTION_SPACING = 24;

const writeSectionHeader = (doc: PDFKit.PDFDocument, title: string) => {
  doc
    .moveDown(1)
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#000")
    .text(title.toUpperCase(), { characterSpacing: 2 })
    .moveTo(MARGIN, doc.y + 4)
    .lineTo(doc.page.width - MARGIN, doc.y + 4)
    .strokeColor("#888")
    .lineWidth(0.5)
    .stroke()
    .moveDown(0.8);
};

const writeBody = (doc: PDFKit.PDFDocument, text: string) => {
  doc.font("Times-Roman").fontSize(11).fillColor("#000").text(text, {
    align: "left",
    lineGap: 2,
    paragraphGap: 8,
  });
};

const writeCoverPage = (
  doc: PDFKit.PDFDocument,
  { projectTitle, author, draftDate }: NarrativePdfInput,
) => {
  doc
    .font("Helvetica-Bold")
    .fontSize(28)
    .fillColor("#000")
    .text(projectTitle.toUpperCase(), { align: "center" })
    .moveDown(2);
  if (author) {
    doc
      .font("Times-Roman")
      .fontSize(12)
      .text("Written by", { align: "center" })
      .moveDown(0.5)
      .fontSize(14)
      .text(author, { align: "center" });
  }
  if (draftDate) {
    doc.moveDown(2).fontSize(10).text(draftDate, { align: "center" });
  }
  doc.addPage();
};

/**
 * Renders the three narrative documents into a single PDF buffer.
 * Returns a Promise that resolves once the PDF stream is finished.
 */
export const buildNarrativePdf = (input: NarrativePdfInput): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    writeCoverPage(doc, input);

    const sections: Array<[title: string, body: string]> = [
      ["Logline", input.logline],
      ["Synopsis", input.synopsis],
      ["Treatment", input.treatment],
    ];

    for (const [title, body] of sections) {
      writeSectionHeader(doc, title);
      writeBody(doc, body.trim().length > 0 ? body : "(not written yet)");
      doc.moveDown(SECTION_SPACING / 12);
    }

    doc.end();
  });

// Slug helper used to build a safe filename from the project title.
export const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";

export const buildNarrativeFilename = (projectTitle: string): string =>
  `${slugify(projectTitle)}-narrative.pdf`;
