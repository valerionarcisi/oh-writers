import { createHash } from "node:crypto";

// Pure utility: normalizes whitespace + casing then hashes (sha256).
// Used to detect content drift on free-form text blocks (scene notes,
// document bodies). No domain shape — string in, hex string out.

export const normalizeText = (raw: string): string =>
  raw.toLowerCase().replace(/\s+/g, " ").trim();

export const hashText = (raw: string): string =>
  createHash("sha256").update(normalizeText(raw)).digest("hex");
