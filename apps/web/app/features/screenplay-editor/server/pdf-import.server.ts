import { createServerFn } from "@tanstack/start";
import { ok, err } from "neverthrow";
import type { Result } from "neverthrow";
import { z } from "zod";
import { getUser } from "~/server/context";
import type { ResultShape } from "./screenplay.server";
import {
  InvalidPdfError,
  EncryptedPdfError,
  EmptyPdfError,
  FileTooLargeError,
} from "../pdf-import.errors";
import type { ImportPdfError } from "../pdf-import.errors";
import { fountainFromPdf } from "../lib/fountain-from-pdf";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
// base64 is ~1.37× larger than binary; add headroom for JSON framing
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES * 1.4);

// File travels as base64 so it survives JSON serialization through createServerFn.
const ImportPdfInput = z.object({
  fileName: z.string().max(255),
  base64: z.string().max(MAX_BASE64_LENGTH),
});

const requireUser = async () => {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
};

const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> =>
  result.isOk()
    ? { isOk: true as const, value: result.value }
    : { isOk: false as const, error: result.error };

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

    // Dynamically import pdf-parse to keep it server-only.
    const pdfParse = (await import("pdf-parse")).default;

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
