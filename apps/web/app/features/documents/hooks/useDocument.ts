import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { DocumentType } from "@oh-writers/domain";
import { unwrapResult } from "@oh-writers/utils";
import {
  getDocument,
  saveDocument,
  documentQueryOptions,
  type DocumentView,
} from "../server/documents.server";
import type { SaveDocumentData } from "../documents.schema";

export type SaveDocumentMutation = UseMutationResult<
  DocumentView,
  Error,
  SaveDocumentData
>;

export { documentQueryOptions };

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useDocument = (projectId: string, type: DocumentType) =>
  useQuery(documentQueryOptions(projectId, type));

export const useSaveDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDocumentData) =>
      unwrapResult(await saveDocument({ data: input })),
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
 *
 * Takes the shared `save` mutation from the caller so auto-save and manual
 * save report through the same status (otherwise two separate useMutation
 * instances diverge and SaveStatus ignores manual-save errors).
 */
export const useAutoSave = (
  save: SaveDocumentMutation,
  documentId: string,
  content: string,
  savedContent: string,
): { isDirty: boolean; isSaving: boolean; isError: boolean } => {
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
