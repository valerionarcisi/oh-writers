import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export const useSaveScreenplay = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveScreenplayData) =>
      throwOnErr(await saveScreenplay({ data: input })),
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

const AUTO_SAVE_DELAY_MS = 30_000;

/**
 * Schedules a save 30 seconds after the last content change.
 * Resets the timer on every keystroke so only one save fires per burst.
 */
export const useAutoSave = (
  screenplayId: string,
  content: string,
  savedContent: string,
): { isDirty: boolean; isSaving: boolean; isError: boolean } => {
  const save = useSaveScreenplay();
  const isDirty = content !== savedContent;

  useEffect(() => {
    if (!isDirty) return;
    const handle = setTimeout(() => {
      save.mutate({ screenplayId, content });
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // Re-schedule whenever content or dirty state changes (not save — stable mutation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDirty, screenplayId]);

  return { isDirty, isSaving: save.isPending, isError: save.isError };
};

export { getScreenplay, saveScreenplay };
