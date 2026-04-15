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

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES * 1.4);

const ImportPdfInput = z.object({
  fileName: z.string().max(255),
  base64: z.string().max(MAX_BASE64_LENGTH),
});

/**
 * Accepts a PDF as a base64-encoded string, extracts its text server-side using
 * pdf-parse, converts the raw text to Fountain format and returns the result.
 */
export const importPdf = createServerFn({ method: "POST" })
  .validator(ImportPdfInput)
  .handler(async ({ data }): Promise<ResultShape<string, ImportPdfError>> => {
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
      rawText = parsed.text?.trim() ?? "";
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

    const fountain = fountainFromPdf(rawText);
    if (!fountain) {
      return toShape(err(new EmptyPdfError()));
    }

    return toShape(ok(fountain));
  });
