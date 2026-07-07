import { z } from "zod";
import { DocumentTypes } from "@oh-writers/domain";
import type { DocumentType } from "@oh-writers/domain";

// ─── Per-type content caps ────────────────────────────────────────────────────
// Values are chosen to match industry conventions:
// - logline: 1–3 lines, ~200 chars is the standard "elevator pitch" length
// - soggetto: 10–15 pages of Italian film-industry prose, ~30k chars
// - synopsis: 1–3 pages, ~5k chars leaves breathing room without enabling drift
// - treatment: long-form prose, 200k is a safety cap for DB health, not UX
// Outline has no string cap — it is stored as JSON structure (see 04b).

export const LOGLINE_MAX = 200;
export const SOGGETTO_MAX = 30_000;
export const SYNOPSIS_MAX = 5_000;
export const TREATMENT_MAX = 200_000;

export const ContentMaxByType: Record<DocumentType, number> = {
  [DocumentTypes.LOGLINE]: LOGLINE_MAX,
  [DocumentTypes.SOGGETTO]: SOGGETTO_MAX,
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

export const OutlineSceneSchema = z.object({
  id: z.string(),
  /** Scene heading (e.g. INT. LIVING ROOM - DAY). Planning only, not fountain-validated. */
  heading: z.string().default(""),
  description: z.string().default(""),
  characters: z.array(z.string()).default([]),
  /** Estimated page count for this scene, null if unknown. */
  pageEstimate: z.number().nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type OutlineScene = z.infer<typeof OutlineSceneSchema>;

export const OutlineSequenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  scenes: z.array(OutlineSceneSchema).default([]),
});
export type OutlineSequence = z.infer<typeof OutlineSequenceSchema>;

export const OutlineActSchema = z.object({
  id: z.string(),
  title: z.string(),
  sequences: z.array(OutlineSequenceSchema).default([]),
});
export type OutlineAct = z.infer<typeof OutlineActSchema>;

export const OutlineContentSchema = z.object({
  acts: z.array(OutlineActSchema).default([]),
});
export type OutlineContent = z.infer<typeof OutlineContentSchema>;

export const emptyOutline = (): OutlineContent => ({ acts: [] });

export const parseOutline = (raw: string): OutlineContent => {
  if (!raw) return emptyOutline();
  try {
    const result = OutlineContentSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : emptyOutline();
  } catch {
    return emptyOutline();
  }
};

export const serializeOutline = (content: OutlineContent): string =>
  JSON.stringify(content);

export const SiaeAuthorSchema = z.object({
  fullName: z.string().min(1).max(200),
  taxCode: z.string().max(16).nullable(),
});
export type SiaeAuthor = z.infer<typeof SiaeAuthorSchema>;

export const SiaeExportInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  authors: z.array(SiaeAuthorSchema).min(1),
  declaredGenre: z.string().max(100),
  estimatedDurationMinutes: z.number().int().min(1).max(600),
  compilationDate: z.string().date(),
  depositNotes: z.string().max(500).nullable(),
});
export type SiaeExportInput = z.infer<typeof SiaeExportInputSchema>;

export const SiaeMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  authors: z.array(SiaeAuthorSchema).min(1),
  declaredGenre: z.string().max(100),
  estimatedDurationMinutes: z.number().int().min(1).max(600),
  depositNotes: z.string().max(500).nullable(),
});
export type SiaeMetadata = z.infer<typeof SiaeMetadataSchema>;
