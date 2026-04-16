import { z } from "zod";

export const ListDocumentVersionsInput = z.object({
  documentId: z.string().uuid(),
});

export const GetDocumentVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const CreateDocumentVersionInput = z.object({
  documentId: z.string().uuid(),
  label: z.string().min(1).max(200).optional(),
});

export const RenameDocumentVersionInput = z.object({
  versionId: z.string().uuid(),
  label: z.string().min(1).max(200),
});

export const DeleteDocumentVersionInput = z.object({
  versionId: z.string().uuid(),
});

export const DocumentVersionView = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  label: z.string().nullable(),
  content: z.string(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
});

export type DocumentVersionView = z.infer<typeof DocumentVersionView>;
