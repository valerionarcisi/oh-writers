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
  /** Scene heading (e.g. INT. LIVING ROOM - DAY). Planning only, not fountain-validated. */
  heading: string;
  description: string;
  characters: string[];
  /** Estimated page count for this scene, null if unknown. */
  pageEstimate: number | null;
  notes: string | null;
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

/** Backfills missing fields added after initial implementation (heading, pageEstimate). */
const backfillScene = (raw: Partial<OutlineScene> & { id: string }): OutlineScene => ({
  id: raw.id,
  heading: raw.heading ?? "",
  description: raw.description ?? "",
  characters: raw.characters ?? [],
  pageEstimate: raw.pageEstimate ?? null,
  notes: raw.notes ?? null,
});

const backfillSequence = (raw: Partial<OutlineSequence> & { id: string; title: string }): OutlineSequence => ({
  id: raw.id,
  title: raw.title,
  scenes: (raw.scenes ?? []).map((s) => backfillScene(s as Parameters<typeof backfillScene>[0])),
});

const backfillAct = (raw: Partial<OutlineAct> & { id: string; title: string }): OutlineAct => ({
  id: raw.id,
  title: raw.title,
  sequences: (raw.sequences ?? []).map((s) => backfillSequence(s as Parameters<typeof backfillSequence>[0])),
});

export const parseOutline = (raw: string): OutlineContent => {
  if (!raw) return emptyOutline();
  try {
    const parsed = JSON.parse(raw) as { acts?: unknown[] };
    const acts = Array.isArray(parsed?.acts) ? parsed.acts : [];
    return {
      acts: acts.map((a) => backfillAct(a as Parameters<typeof backfillAct>[0])),
    };
  } catch {
    return emptyOutline();
  }
};

export const serializeOutline = (content: OutlineContent): string =>
  JSON.stringify(content);

export const GenerateLoglineInputSchema = z.object({
  projectId: z.string().uuid(),
});
export type GenerateLoglineInput = z.infer<typeof GenerateLoglineInputSchema>;

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
