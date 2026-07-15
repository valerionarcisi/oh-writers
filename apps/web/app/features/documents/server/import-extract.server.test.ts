import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph, TextRun } from "docx";
import {
  docxXmlToText,
  normalizeImportedText,
  extractPdfText,
} from "./import-extract.server";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(
  HERE,
  "../../../../../../tests/fixtures/screenplays",
);
const loadFixtureBuffer = (name: string): Buffer =>
  readFileSync(path.join(FIXTURES, name));

async function buildDocxXml(paragraphs: Paragraph[]): Promise<string> {
  const doc = new Document({
    sections: [{ children: paragraphs }],
  });
  const zipBuffer = await Packer.toBuffer(doc);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipBuffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml missing in generated docx");
  return entry.async("string");
}

describe("docxXmlToText", () => {
  it("separates paragraphs with a blank line", async () => {
    const xml = await buildDocxXml([
      new Paragraph({ children: [new TextRun("Primo paragrafo.")] }),
      new Paragraph({ children: [new TextRun("Secondo paragrafo.")] }),
    ]);
    const text = docxXmlToText(xml);
    expect(text).toBe("Primo paragrafo.\n\nSecondo paragrafo.");
  });

  it("concatenates multiple runs within a paragraph", async () => {
    const xml = await buildDocxXml([
      new Paragraph({
        children: [
          new TextRun("Una frase "),
          new TextRun({ text: "in grassetto", bold: true }),
          new TextRun(" e continua."),
        ],
      }),
    ]);
    const text = docxXmlToText(xml);
    expect(text).toBe("Una frase in grassetto e continua.");
  });

  it("turns a line break into a newline", async () => {
    const xml = await buildDocxXml([
      new Paragraph({
        children: [
          new TextRun("Prima riga"),
          new TextRun({ text: "", break: 1 }),
          new TextRun("Seconda riga"),
        ],
      }),
    ]);
    const text = docxXmlToText(xml);
    expect(text).toBe("Prima riga\nSeconda riga");
  });

  it("decodes XML entities in the run text", () => {
    const xml =
      "<w:p><w:r><w:t>Tom &amp; Jerry &lt;3 &quot;friends&quot;</w:t></w:r></w:p>";
    expect(docxXmlToText(xml)).toBe('Tom & Jerry <3 "friends"');
  });

  it("returns an empty string for a document with no paragraphs", () => {
    expect(docxXmlToText("<w:body></w:body>")).toBe("");
  });
});

describe("normalizeImportedText", () => {
  it("converts CRLF line endings to LF", () => {
    expect(normalizeImportedText("riga uno\r\nriga due")).toBe(
      "riga uno\nriga due",
    );
  });

  it("collapses repeated intra-line whitespace", () => {
    expect(normalizeImportedText("parola   con    spazi")).toBe(
      "parola con spazi",
    );
  });

  it("squeezes three or more consecutive newlines into two", () => {
    expect(normalizeImportedText("uno\n\n\n\ndue")).toBe("uno\n\ndue");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeImportedText("   testo con spazi   ")).toBe(
      "testo con spazi",
    );
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeImportedText("   \n\n  \t  ")).toBe("");
  });
});

describe("extractPdfText", () => {
  it("extracts non-empty text from a real screenplay PDF", async () => {
    const buffer = loadFixtureBuffer("clean-short.pdf");
    const text = await extractPdfText(buffer);
    expect(text.length).toBeGreaterThan(0);
  });

  it("rejects a non-PDF buffer", async () => {
    const buffer = Buffer.from("this is not a pdf file at all");
    await expect(extractPdfText(buffer)).rejects.toThrow();
  });
});
