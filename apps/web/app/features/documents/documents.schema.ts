import { z } from "zod";
import { DocumentTypes } from "@oh-writers/domain";

export const SaveDocumentInput = z.object({
  documentId: z.string().uuid(),
  content: z.string(),
});

export type SaveDocumentData = z.infer<typeof SaveDocumentInput>;

export const GetDocumentInput = z.object({
  projectId: z.string().uuid(),
  type: z.enum([
    DocumentTypes.LOGLINE,
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
