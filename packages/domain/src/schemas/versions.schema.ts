import { z } from "zod";
import { DocumentTypes } from "../constants.js";

export const DocumentTypeSchema = z.enum([
  DocumentTypes.LOGLINE,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
]);

export const VersionScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("screenplay"), screenplayId: z.string().uuid() }),
  z.object({
    kind: z.literal("document"),
    documentId: z.string().uuid(),
    docType: DocumentTypeSchema,
  }),
]);

export type VersionScope = z.infer<typeof VersionScopeSchema>;

export const VersionItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().nullable(),
  isAuto: z.boolean(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
});

export type VersionItem = z.infer<typeof VersionItemSchema>;
