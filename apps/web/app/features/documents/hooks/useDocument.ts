import { useEffect, useRef, useState } from "react";
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
import { base64ToBlob } from "../lib/download";
import { openPdfPreview } from "../lib/pdf-preview";

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
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", saved.id],
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
  // Optional content normaliser used ONLY for the dirty comparison. Two contents
  // that normalise equal are not dirty, so a pure re-serialisation (a Cesare
  // agentic edit stored as plain text that re-enters the rich editor as HTML) is
  // not treated as a local edit and the autosave never clobbers the applied draft
  // (Spec 61). Omitted → identity, so the single-line logline autosave is
  // unchanged. The content we actually persist is always the raw `content`.
  normalize: (s: string) => string = (s) => s,
): {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  lastSavedAt: number | null;
  flush: () => void;
} => {
  // Guard an empty document id: the logline autosave on a narrative page passes
  // `loglineDoc?.id ?? ""` before the sibling logline doc has loaded. Saving with
  // an empty id is a phantom request, so an unloaded doc is never "dirty" (Spec
  // 63 P2).
  const hasDoc = documentId !== "";
  const isDirty = hasDoc && normalize(content) !== normalize(savedContent);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const handle = setTimeout(() => {
      save.mutate(
        { documentId, content },
        { onSuccess: () => setLastSavedAt(Date.now()) },
      );
    }, getAutoSaveDelayMs());
    return () => clearTimeout(handle);
    // Re-schedule whenever content or dirty state changes (not save — stable mutation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDirty, documentId]);

  const flush = (): void => {
    if (!isDirty || save.isPending) return;
    save.mutate(
      { documentId, content },
      { onSuccess: () => setLastSavedAt(Date.now()) },
    );
  };

  // NOTE: this hook does NOT publish to the SaveStateProvider. A narrative page
  // runs two autosaves (the document + the shared logline pill), and the
  // screenplay editor runs its own; if each instance published, they would race
  // last-writer-wins and the TopBar pill would flicker / lie (Spec 63 P2). The
  // page is the single publisher — it derives the pill state from the MAIN
  // document's `{ isDirty, isSaving, isError, lastSavedAt }` and calls
  // `useSaveStatePublisher` exactly once.
  return {
    isDirty,
    isSaving: save.isPending,
    isError: save.isError,
    lastSavedAt,
    flush,
  };
};

// ─── Version resync ───────────────────────────────────────────────────────────

/**
 * Re-sync the local editor state when the document's ACTIVE VERSION changes
 * from outside the editor (switchToVersion, version restore, a Cesare draft
 * promotion) — those refetch the route query, but the editor's `useState` was
 * frozen at mount.
 *
 * Two version changes must NOT resync:
 * - the mount run (state is already initialised from the same document; in
 *   realtime mode pushing a possibly-stale HTTP value into a just-synced CRDT
 *   editor is the external replace that clobbers the shared doc — BUG-N53);
 * - a version id OUR OWN SAVE created (the first save of a doc snapshots
 *   "Versione 1", flipping currentVersionId null→v1). That refetch carries the
 *   content as of the save request — resyncing stomps every keystroke typed
 *   while the save was in flight, and the autosave then persists the truncated
 *   text (BUG-N56: the editor visibly ate its own content mid-typing).
 */
export const useVersionResync = (
  currentVersionId: string | null,
  save: SaveDocumentMutation,
  resync: () => void,
): void => {
  const mountedRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const resyncRef = useRef(resync);
  resyncRef.current = resync;
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (
      currentVersionId !== null &&
      currentVersionId === saveRef.current.data?.currentVersionId
    )
      return;
    resyncRef.current();
  }, [currentVersionId]);
};

// ─── Export narrative PDF ─────────────────────────────────────────────────────

export const useExportNarrativePdf = () =>
  useMutation({
    mutationFn: async (input: {
      projectId: string;
      includeTitlePage: boolean;
    }) => {
      const result = unwrapResult(await exportNarrativePdf({ data: input }));
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openPdfPreview(url, result.filename);
      return result;
    },
  });

export { getDocument, saveDocument, exportNarrativePdf };
