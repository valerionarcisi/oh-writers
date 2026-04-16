import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
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
  /** Forces an immediate save, cancelling the pending debounce. */
  flush: () => void;
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
): UseAutoSaveResult => {
  const save = useSaveScreenplay();
  const isDirty = !disabled && content !== savedContent;
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

  const flush = useCallback(() => {
    if (disabled) return;
    const { screenplayId: id, content: c, pmDoc: d } = latest.current;
    save.mutate({ screenplayId: id, content: c, pmDoc: d });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

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
