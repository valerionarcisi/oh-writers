import { createServerFn } from "@tanstack/start";
import { ok, err } from "neverthrow";
import { z } from "zod";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import {
  InvalidPdfError,
  EncryptedPdfError,
  EmptyPdfError,
  FileTooLargeError,
} from "../pdf-import.errors";
import type { ImportPdfError } from "../pdf-import.errors";
import { fountainFromPdf } from "../lib/fountain-from-pdf";
import {
  extractTitlePageFromPdf,
  type TitlePageDocJSON,
} from "../lib/title-page-from-pdf";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — real screenplays with
// embedded fonts/images routinely exceed 10 MB.

const ImportPdfInput = z.object({
  fileName: z.string().max(255),
  // No Zod max on the base64 string: a too-large file is caught by the
  // decoded-byte-length guard in the handler, which returns a clean
  // FileTooLargeError the client renders — a Zod `.max()` here instead throws a
  // raw 500 (unhandled in the client). The byte guard is the real gate.
  base64: z.string(),
});

export interface ImportPdfResult {
  fountain: string;
  titlePageDoc: TitlePageDocJSON | null;
}

/**
 * Accepts a PDF as a base64-encoded string, extracts its text server-side using
 * pdf-parse. Pass 0 (title-page extraction) runs first; the remaining body is
 * passed to Pass 1/2/3 (fountain conversion). Returns both pieces.
 */
export const importPdf = createServerFn({ method: "POST" })
  .validator(ImportPdfInput)
  .handler(
    async ({ data }): Promise<ResultShape<ImportPdfResult, ImportPdfError>> => {
      await requireUser();

      const buffer = Buffer.from(data.base64, "base64");

      if (buffer.length > MAX_FILE_BYTES) {
        return toShape(err(new FileTooLargeError()));
      }

      // Import the internal module directly: pdf-parse's index.js runs a debug
      // block that tries to read a missing test PDF when module.parent is null
      // (as happens under ESM dynamic import).
      // @ts-expect-error — pdf-parse has no types for its internal entry
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;

      let rawText: string;
      try {
        const parsed = await pdfParse(buffer, { max: 0 });
        // pdf-parse / pdfjs returns a string where each character is a raw byte
        // (latin-1 code-unit). Re-encode as a Buffer using latin-1 then decode
        // as UTF-8 to recover multi-byte Italian characters (è, à, ù, —, …).
        const raw = parsed.text ?? "";
        rawText = Buffer.from(raw, "latin1").toString("utf8").trim();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.toLowerCase().includes("encrypt")) {
          return toShape(err(new EncryptedPdfError()));
        }
        return toShape(err(new InvalidPdfError()));
      }

      if (!rawText) {
        return toShape(err(new EmptyPdfError()));
      }

      // Pass 0: isolate the title page (if any). What's left after the
      // detected title-page region is the body the rest of the pipeline parses.
      const { doc: titlePageDoc, consumedLines } =
        extractTitlePageFromPdf(rawText);
      const bodyText =
        consumedLines > 0
          ? rawText.split("\n").slice(consumedLines).join("\n")
          : rawText;

      const fountain = fountainFromPdf(bodyText);
      if (!fountain) {
        return toShape(err(new EmptyPdfError()));
      }

      return toShape(ok({ fountain, titlePageDoc }));
    },
  );
