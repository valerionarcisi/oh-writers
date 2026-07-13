import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { computeSaveStatus, type SaveState } from "@oh-writers/ui";
import { useSaveStatePublisher } from "~/features/app-shell";
import {
  getScreenplay,
  saveScreenplay,
  screenplayQueryOptions,
} from "../server/screenplay.server";
import type { SaveScreenplayData } from "../screenplay.schema";

export { screenplayQueryOptions };

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useScreenplay = (projectId: string) =>
  useQuery(screenplayQueryOptions(projectId));

export const useSaveScreenplay = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveScreenplayData) =>
      unwrapResult(await saveScreenplay({ data: input })),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({
        queryKey: ["screenplays", saved.projectId],
      });
      // Refresh project so the page count in the project overview updates
      void queryClient.invalidateQueries({
        queryKey: ["projects", saved.projectId],
      });
    },
  });
};

// ─── Auto-save ────────────────────────────────────────────────────────────────

const AUTO_SAVE_DELAY_MS = 2_000;

interface UseAutoSaveResult {
  isDirty: boolean;
  isSaving: boolean;
  isError: boolean;
  isOffline: boolean;
  lastSavedAt: number | null;
  /**
   * Forces an immediate save, cancelling the pending debounce.
   * Returns a Promise that resolves once the server confirms the save —
   * callers (including the E2E `forceSave` hook) can await it.
   */
  flush: () => Promise<void>;
}

/**
 * Schedules a save {@link AUTO_SAVE_DELAY_MS}ms after the last content change
 * and resets the timer on every keystroke so only one save fires per burst.
 * Also exposes an explicit {@link UseAutoSaveResult.flush} for the Save button.
 */
export const useAutoSave = (
  screenplayId: string,
  content: string,
  savedContent: string,
  pmDoc: Record<string, unknown> | null,
  disabled: boolean = false,
  // Optional content normaliser used ONLY for the dirty comparison (Spec 63 S2).
  // The editor emits `docToFountain(doc)`, but a stored screenplay (PDF import,
  // Cesare plain edit, older save) is NOT the serializer's canonical form —
  // `docToFountain(fountainToDoc(x)) !== x` for normal inputs (the serializer
  // re-indents character/dialogue and normalises blank lines). Without
  // canonical comparison the screenplay is "dirty" on first render with zero
  // edits → a phantom autosave fires and rewrites the stored content. Omitted →
  // identity. The content we persist is always the raw `content`.
  normalize: (s: string) => string = (s) => s,
): UseAutoSaveResult => {
  const save = useSaveScreenplay();
  const isDirty = !disabled && normalize(content) !== normalize(savedContent);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const latest = useRef({ screenplayId, content, pmDoc });
  latest.current = { screenplayId, content, pmDoc };

  // Track online/offline so the indicator can show a dedicated state and so
  // we skip saving while disconnected (Yjs buffers updates locally).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Record the successful save timestamp so the indicator can render a
  // "Salvato N min fa" tooltip without a round-trip.
  useEffect(() => {
    if (save.isSuccess) setLastSavedAt(Date.now());
  }, [save.isSuccess]);

  useEffect(() => {
    if (!isDirty || isOffline || disabled) return;
    const handle = setTimeout(() => {
      save.mutate({ screenplayId, content, pmDoc });
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // Re-schedule whenever content or dirty state changes (not save — stable mutation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDirty, isOffline, screenplayId, disabled]);

  const flush = useCallback((): Promise<void> => {
    if (disabled) return Promise.resolve();
    const { screenplayId: id, content: c, pmDoc: d } = latest.current;
    // Resolve on success, REJECT on failure (Spec 63 S3). The mutation's
    // `isError` already drives the pill's `error` state; propagating the
    // rejection also lets an awaiting caller (e.g. a "save before leave"
    // guard) know the save did not land instead of silently continuing.
    return save
      .mutateAsync({ screenplayId: id, content: c, pmDoc: d })
      .then(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Publish the auto-save state to the SaveStateProvider so the Viewbar pill
  // renders. The state machine is the SHARED one (Spec 63 F4) so the TopBar pill
  // and the editor's own SaveIndicator agree: `dirty` is distinct from `saving`,
  // and a failed save surfaces `error` (previously both collapsed into
  // "saving"). `flush` makes the pill a "save now" button.
  // 2026-07-13 (supersedes the OHW-140/BUG-N55 edit-gate): published whenever
  // the editor is enabled, starting from "Salvato" — the loaded screenplay IS
  // persisted, and the pill doubles as the "save now" button, so it must not
  // wait for the first keystroke to exist. Same decision on narrative docs
  // (see NarrativeEditor).
  const publishedState = useMemo<SaveState | undefined>(() => {
    if (disabled) return undefined;
    return computeSaveStatus({
      isDirty,
      isSaving: save.isPending,
      isError: save.isError,
      isOffline,
    });
  }, [disabled, isOffline, save.isPending, save.isError, isDirty]);
  const secondsAgo = useMemo(() => {
    if (!lastSavedAt) return undefined;
    return Math.floor((Date.now() - lastSavedAt) / 1000);
  }, [lastSavedAt]);
  useSaveStatePublisher(publishedState, secondsAgo, () => {
    void flush();
  });

  return {
    isDirty,
    isSaving: save.isPending,
    isError: save.isError,
    isOffline,
    lastSavedAt,
    flush,
  };
};

export { getScreenplay, saveScreenplay };
