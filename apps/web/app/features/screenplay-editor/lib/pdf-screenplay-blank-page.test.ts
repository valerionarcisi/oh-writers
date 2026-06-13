import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { buildScreenplayPdf } from "./pdf-screenplay.js";
import { buildExportPipeline } from "./export-pipeline.js";
import { prependTitlePageToFountain } from "./title-page-prepend.js";

/**
 * Regression for BUG-N63e: every screenplay export began with a BLANK leading
 * page. Root cause — afterwriting defaults `print_title_page=true`, so it
 * always paints a (here empty) cover on PDFKit's auto-created first page and
 * then `addPage()`s the script, leaving page 1 blank when no cover exists.
 *
 * WYSIWYG contract: the export mirrors the editor exactly. No cover requested
 * (or Sides) ⇒ the body starts on page 1. Cover requested ⇒ page 1 IS the
 * cover (with content), never a blank page before it.
 *
 * These tests render real PDFs through the awc runner and inspect per-page
 * text via pdf-parse, so they are deterministic but heavier than a pure unit
 * test — hence the per-test timeout bump.
 */
const require = createRequire(import.meta.url);
// pdf-parse's index does a debug self-read on a hardcoded path; import the
// library entry directly (same pattern as fountain-from-pdf).
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buffer: Buffer,
  options?: {
    pagerender?: (page: {
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
    }) => Promise<string>;
  },
) => Promise<{ numpages: number }>;

const SAMPLE_FOUNTAIN = [
  "INT. KITCHEN - DAY",
  "",
  "Anna stares at the kettle.",
  "",
  "ANNA",
  "Why won't you boil?",
  "",
  "EXT. STREET - NIGHT",
  "",
  "Rain falls hard.",
  "",
  "MARCO",
  "We need to leave now.",
  "",
].join("\n");

const renderPages = async (
  fountain: string,
  invocation: Parameters<typeof buildScreenplayPdf>[1] extends infer O
    ? O extends { invocation?: infer I }
      ? I
      : never
    : never,
): Promise<string[]> => {
  const buffer = await buildScreenplayPdf(fountain, { invocation });
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: (page) =>
      page.getTextContent().then((content) => {
        const text = content.items.map((item) => item.str).join("");
        pages.push(text.replace(/\s+/g, " ").trim());
        return text;
      }),
  });
  return pages;
};

const TIMEOUT_MS = 60_000;

describe("screenplay PDF — no blank leading page (BUG-N63e)", () => {
  it(
    "Sides export starts the scene body on page 1 (no blank cover)",
    async () => {
      const result = buildExportPipeline("sides", {
        fountain: SAMPLE_FOUNTAIN,
        sceneSelection: ["1"],
      });
      const pages = await renderPages(result.fountain, result.invocation);

      expect(pages.length).toBeGreaterThan(0);
      expect(pages[0]!.length).toBeGreaterThan(0);
      expect(pages[0]).toContain("INT. KITCHEN");
    },
    TIMEOUT_MS,
  );

  it(
    "standard export without a cover starts the body on page 1",
    async () => {
      const result = buildExportPipeline("standard", {
        fountain: SAMPLE_FOUNTAIN,
        includeCoverPage: false,
      });
      const pages = await renderPages(result.fountain, result.invocation);

      expect(pages.length).toBeGreaterThan(0);
      expect(pages[0]!.length).toBeGreaterThan(0);
      expect(pages[0]).toContain("INT. KITCHEN");
    },
    TIMEOUT_MS,
  );

  it(
    "standard export WITH a cover puts the cover on page 1 (with content), body after",
    async () => {
      const withCover = prependTitlePageToFountain(SAMPLE_FOUNTAIN, {
        title: "My Film",
        titlePage: {
          author: "Valerio",
          basedOn: null,
          contact: null,
          draftDate: "2026-06-13",
          draftColor: null,
          wgaRegistration: null,
          notes: null,
        },
      });
      const result = buildExportPipeline("standard", {
        fountain: withCover,
        includeCoverPage: true,
      });
      const pages = await renderPages(result.fountain, result.invocation);

      expect(pages.length).toBeGreaterThanOrEqual(2);
      // Page 1 is the cover: has the (upper-cased) title, NOT the scene body.
      expect(pages[0]!.length).toBeGreaterThan(0);
      expect(pages[0]).toContain("MY FILM");
      expect(pages[0]).not.toContain("INT. KITCHEN");
      // Body begins on page 2.
      expect(pages[1]).toContain("INT. KITCHEN");
    },
    TIMEOUT_MS,
  );
});
