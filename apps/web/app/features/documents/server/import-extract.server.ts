import { createServerFn } from "@tanstack/start";
import { ok, err } from "neverthrow";
import { z } from "zod";
import { toShape } from "@oh-writers/utils";
import type { ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import {
  UnsupportedFormatError,
  InvalidPdfError,
  EncryptedPdfError,
  InvalidDocxError,
  EmptyImportError,
  FileTooLargeError,
} from "../import.errors";
import type { ImportDocumentError } from "../import.errors";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB, same cap as the screenplay PDF import

const replacementCount = (s: string): number => (s.match(/�/g) ?? []).length;

// Pick the cleaner of two decodings (as-is vs. latin1→utf8 re-encode) by
// fewest U+FFFD replacement chars — same mojibake fix as the screenplay PDF
// import (pdf-parse sometimes hands back raw latin-1 code-units).
function bestDecoding(raw: string): string {
  const recoded = Buffer.from(raw, "latin1").toString("utf8");
  return replacementCount(recoded) < replacementCount(raw) ? recoded : raw;
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const decodeXmlEntities = (s: string): string =>
  s.replace(
    /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,
    (match: string, ent: string) => {
      const named = XML_ENTITIES[ent];
      if (named !== undefined) return named;
      if (ent.startsWith("#x"))
        return String.fromCodePoint(parseInt(ent.slice(2), 16));
      if (ent.startsWith("#"))
        return String.fromCodePoint(parseInt(ent.slice(1), 10));
      return match;
    },
  );

export function docxXmlToText(xml: string): string {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((paragraph) => {
      // `<w:br/>` and `<w:tab/>` are self-closing siblings of `<w:t>` inside a
      // run, not text content — wrap each in a fake `<w:t>` so the token scan
      // below picks them up in document order along with the real text runs.
      const withBreaks = paragraph
        .replace(/<w:br\s*\/>/g, "<w:t>\n</w:t>")
        .replace(/<w:tab\s*\/>/g, "<w:t> </w:t>");
      const tokens = withBreaks.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
      return tokens
        .map((token) => decodeXmlEntities(token.replace(/<[^>]+>/g, "")))
        .join("");
    })
    .join("\n\n");
}

export function normalizeImportedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

const extensionOf = (fileName: string): string =>
  (fileName.split(".").pop() ?? "").toLowerCase();

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // @ts-expect-error — pdf-parse has no types for its internal entry
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const parsed = await pdfParse(buffer, { max: 0 });
  return bestDecoding(parsed.text ?? "");
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml not found in DOCX");
  const xml = await entry.async("string");
  return docxXmlToText(xml);
}

const ImportTextInput = z.object({
  fileName: z.string().max(255),
  // No Zod max on the base64 string — the decoded-byte-length guard below
  // returns a typed FileTooLargeError instead of a raw Zod 500.
  base64: z.string(),
});

export const extractImportText = createServerFn({ method: "POST" })
  .validator(ImportTextInput)
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<{ text: string; chars: number }, ImportDocumentError>
    > => {
      await requireUser();

      const buffer = Buffer.from(data.base64, "base64");
      if (buffer.length > MAX_FILE_BYTES) {
        return toShape(err(new FileTooLargeError()));
      }

      const extension = extensionOf(data.fileName);
      let rawText: string;
      try {
        if (extension === "pdf") {
          rawText = await extractPdfText(buffer);
        } else if (extension === "docx") {
          rawText = await extractDocxText(buffer);
        } else {
          return toShape(err(new UnsupportedFormatError(extension)));
        }
      } catch (e) {
        if (extension === "pdf") {
          const msg = e instanceof Error ? e.message : "";
          if (msg.toLowerCase().includes("encrypt")) {
            return toShape(err(new EncryptedPdfError()));
          }
          return toShape(err(new InvalidPdfError()));
        }
        return toShape(err(new InvalidDocxError()));
      }

      const text = normalizeImportedText(rawText);
      if (!text) {
        return toShape(err(new EmptyImportError()));
      }

      return toShape(ok({ text, chars: text.length }));
    },
  );
