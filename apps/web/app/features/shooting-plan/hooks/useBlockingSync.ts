import { useQueryClient } from "@tanstack/react-query";
import { blockingQueryOptions } from "../server/blocking.server";

/**
 * Invalidates the blocking query for the given scene/plan combination
 * so that BlockingCard re-fetches and Cesare can place/remove camera
 * pins for newly added/deleted shots.
 */
export const useBlockingSync = (sceneId: string, planId: string | null) => {
  const qc = useQueryClient();

  const invalidateBlocking = () => {
    if (!planId) return;
    void qc.invalidateQueries({
      queryKey: blockingQueryOptions(sceneId, planId).queryKey,
    });
  };

  return { invalidateBlocking };
};
