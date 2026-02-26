import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentType } from "@oh-writers/shared";
import {
  getDocument,
  saveDocument,
  documentQueryOptions,
} from "../server/documents.server";
import type { SaveDocumentData } from "../documents.schema";

export { documentQueryOptions };

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useDocument = (projectId: string, type: DocumentType) =>
  useQuery(documentQueryOptions(projectId, type));

// ─── Mutations ────────────────────────────────────────────────────────────────

const throwOnErr = <T>(result: {
  isOk: boolean;
  value?: T;
  error?: { message: string };
}): T => {
  if (!result.isOk) {
    const domainError = result.error!;
    throw Object.assign(new Error(domainError.message), domainError);
  }
  return result.value as T;
};

export const useSaveDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDocumentData) =>
      throwOnErr(await saveDocument({ data: input })),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({
        queryKey: ["documents", saved.projectId, saved.type],
      });
      // Refresh project so the progress bar updates (completed doc count)
      void queryClient.invalidateQueries({
        queryKey: ["projects", saved.projectId],
      });
    },
  });
};

// ─── Auto-save ────────────────────────────────────────────────────────────────

const AUTO_SAVE_DELAY_MS = 30_000;

/**
 * Schedules a save 30 seconds after the last content change.
 * Resets the timer on every keystroke so only one save fires per burst.
 */
export const useAutoSave = (
  documentId: string,
  content: string,
  savedContent: string,
): { isDirty: boolean; isSaving: boolean; isError: boolean } => {
  const save = useSaveDocument();
  const isDirty = content !== savedContent;

  useEffect(() => {
    if (!isDirty) return;
    const handle = setTimeout(() => {
      save.mutate({ documentId, content });
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // Re-schedule whenever content or dirty state changes (not save — stable mutation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDirty, documentId]);

  return { isDirty, isSaving: save.isPending, isError: save.isError };
};

export { getDocument, saveDocument };
