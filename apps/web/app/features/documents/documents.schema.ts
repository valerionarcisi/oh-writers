import { z } from "zod";
import { DocumentTypes } from "@oh-writers/domain";
import type { DocumentType } from "@oh-writers/domain";

// ─── Per-type content caps ────────────────────────────────────────────────────
// Values are chosen to match industry conventions:
// - logline: 1–3 lines, ~200 chars is the standard "elevator pitch" length
// - synopsis: 1–3 pages, ~5k chars leaves breathing room without enabling drift
// - treatment: long-form prose, 200k is a safety cap for DB health, not UX
// Outline has no string cap — it is stored as JSON structure (see 04b).

export const LOGLINE_MAX = 200;
export const SYNOPSIS_MAX = 5_000;
export const TREATMENT_MAX = 200_000;

export const ContentMaxByType: Record<DocumentType, number> = {
  [DocumentTypes.LOGLINE]: LOGLINE_MAX,
  [DocumentTypes.SOGGETTO]: SYNOPSIS_MAX,
  [DocumentTypes.SYNOPSIS]: SYNOPSIS_MAX,
  [DocumentTypes.TREATMENT]: TREATMENT_MAX,
  [DocumentTypes.OUTLINE]: Number.POSITIVE_INFINITY,
};

export const SaveDocumentInput = z.object({
  documentId: z.string().uuid(),
  content: z.string(),
});

export type SaveDocumentData = z.infer<typeof SaveDocumentInput>;

export const GetDocumentInput = z.object({
  projectId: z.string().uuid(),
  type: z.enum([
    DocumentTypes.LOGLINE,
    DocumentTypes.SOGGETTO,
    DocumentTypes.SYNOPSIS,
    DocumentTypes.OUTLINE,
    DocumentTypes.TREATMENT,
  ]),
});

export type GetDocumentData = z.infer<typeof GetDocumentInput>;

// ─── Outline JSON structure ───────────────────────────────────────────────────

export type OutlineScene = {
  id: string;
  description: string;
  characters: string[];
  notes: string;
};

export type OutlineSequence = {
  id: string;
  title: string;
  scenes: OutlineScene[];
};

export type OutlineAct = {
  id: string;
  title: string;
  sequences: OutlineSequence[];
};

export type OutlineContent = {
  acts: OutlineAct[];
};

export const emptyOutline = (): OutlineContent => ({ acts: [] });

export const parseOutline = (raw: string): OutlineContent => {
  if (!raw) return emptyOutline();
  try {
    return JSON.parse(raw) as OutlineContent;
  } catch {
    return emptyOutline();
  }
};

export const serializeOutline = (content: OutlineContent): string =>
  JSON.stringify(content);
