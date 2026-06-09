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
import { fountainFromPdfCoords } from "../lib/fountain-from-pdf-coords";
import { extractCoordLines } from "./pdf-coords.server";
import {
  extractTitlePageFromPdf,
  type TitlePageDocJSON,
} from "../lib/title-page-from-pdf";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — real screenplays with
// embedded fonts/images routinely exceed 10 MB.

// Count U+FFFD replacement chars in a string (lower = better decoding).
const replacementCount = (s: string): number => (s.match(/�/g) ?? []).length;

/**
 * Pick the cleaner of two decodings of pdf-parse's output: the text as-is
 * (already Unicode for most PDFs) vs. a latin1→utf8 re-encode (needed only when
 * pdf-parse hands back raw latin-1 code-units / mojibake). Choose by fewest
 * replacement chars; on a tie, prefer the raw text (the re-encode is the lossy
 * one when it isn't needed).
 */
export function bestDecoding(raw: string): string {
  const recoded = Buffer.from(raw, "latin1").toString("utf8");
  return replacementCount(recoded) < replacementCount(raw) ? recoded : raw;
}

/**
 * Produce the body Fountain. Tries the coordinate-aware classifier first
 * (deterministic element typing by X bucket); on any failure — no coordinates,
 * an unrecognised layout, or an extraction error — falls back to the text-only
 * heuristic path so no PDF that worked before regresses. The mojibake fix
 * (`bestDecoding`) is applied per line on the coord path, mirroring the
 * whole-text decode the text path already received.
 */
async function resolveFountain(
  buffer: Buffer,
  bodyText: string,
  titlePageDoc: TitlePageDocJSON | null,
): Promise<string> {
  const coordResult = await extractCoordLines(buffer);
  if (coordResult.isOk() && coordResult.value.length > 0) {
    const decoded = coordResult.value.map((line) => ({
      ...line,
      text: bestDecoding(line.text),
    }));
    const coordFountain = fountainFromPdfCoords(decoded, {
      dropTitlePagePrefix: titlePageDoc !== null,
    });
    if (coordFountain) return coordFountain;
  }
  return fountainFromPdf(bodyText);
}

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
        const raw = parsed.text ?? "";
        // Most PDFs come back already-decoded Unicode (accents intact). Some,
        // however, return latin-1 code-units where multi-byte chars look like
        // mojibake (è → "Ã¨"). A blanket latin1→utf8 re-encode FIXES the second
        // case but CORRUPTS the first (turning a clean "È" into U+FFFD). So pick
        // whichever variant has fewer replacement chars + intact accents.
        rawText = bestDecoding(raw).trim();
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

      // Preferred path: classify the body by per-line X coordinate, which makes
      // element type (scene/action/dialogue/parenthetical/character)
      // deterministic instead of heuristic. Falls back to the text-only path
      // when coordinates are unavailable (scanned/image PDFs, exotic encoders)
      // or the layout isn't a recognisable screenplay.
      const fountain = await resolveFountain(buffer, bodyText, titlePageDoc);
      if (!fountain) {
        return toShape(err(new EmptyPdfError()));
      }

      return toShape(ok({ fountain, titlePageDoc }));
    },
  );
