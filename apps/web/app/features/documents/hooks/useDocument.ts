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
  exportNarrativePdf,
  documentQueryOptions,
  type DocumentView,
} from "../server/documents.server";
import type { SaveDocumentData } from "../documents.schema";
import { base64ToBlob, downloadBlob } from "../lib/download";

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

const DEFAULT_AUTO_SAVE_DELAY_MS = 30_000;

// E2E override: Playwright can set window.__ohWritersAutoSaveDelayMs
// via addInitScript to shrink the debounce window (30s is untestable
// in an E2E run). Gated to non-production builds so a browser extension
// or console user can't dial it down to 1ms in production and hammer
// the server.
const getAutoSaveDelayMs = (): number => {
  if (typeof window === "undefined") return DEFAULT_AUTO_SAVE_DELAY_MS;
  if (import.meta.env.PROD) return DEFAULT_AUTO_SAVE_DELAY_MS;
  const override = (
    window as unknown as { __ohWritersAutoSaveDelayMs?: number }
  ).__ohWritersAutoSaveDelayMs;
  return typeof override === "number" && override > 0
    ? override
    : DEFAULT_AUTO_SAVE_DELAY_MS;
};

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
    }, getAutoSaveDelayMs());
    return () => clearTimeout(handle);
    // Re-schedule whenever content or dirty state changes (not save — stable mutation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDirty, documentId]);

  return { isDirty, isSaving: save.isPending, isError: save.isError };
};

// ─── Export narrative PDF ─────────────────────────────────────────────────────

export const useExportNarrativePdf = () =>
  useMutation({
    mutationFn: async (projectId: string) => {
      const result = unwrapResult(
        await exportNarrativePdf({ data: { projectId } }),
      );
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      downloadBlob(blob, result.filename);
      return result;
    },
  });

export { getDocument, saveDocument, exportNarrativePdf };
