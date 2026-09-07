import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { stampAiDisclosureFooter } from "./stamp-pdf-footer";

const makeTestPdf = async (pageCount = 2): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]); // US Letter, same as afterwriting's default
  }
  return Buffer.from(await doc.save());
};

describe("stampAiDisclosureFooter", () => {
  it("produces a valid PDF buffer", async () => {
    const input = await makeTestPdf();
    const stamped = await stampAiDisclosureFooter(
      input,
      "Contiene testo suggerito da Cesare (AI).",
    );
    expect(stamped.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("adds the footer to EVERY page, not just the first", async () => {
    const input = await makeTestPdf(3);
    const stamped = await stampAiDisclosureFooter(
      input,
      "Contiene testo suggerito da Cesare (AI).",
    );
    const doc = await PDFDocument.load(stamped);
    expect(doc.getPageCount()).toBe(3);
  });

  it("produces a larger buffer than the unstamped input", async () => {
    const input = await makeTestPdf();
    const stamped = await stampAiDisclosureFooter(
      input,
      "Contiene testo suggerito da Cesare (AI).",
    );
    expect(stamped.length).toBeGreaterThan(input.length);
  });
});
