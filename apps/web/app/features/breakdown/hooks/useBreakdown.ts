import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  getBreakdownForScene,
  getBreakdownContext,
  getProjectBreakdown,
  getStaleScenes,
  addBreakdownElement,
  updateBreakdownElement,
  archiveBreakdownElement,
  setOccurrenceStatus,
} from "../server/breakdown.server";
import { suggestBreakdownForScene } from "../server/cesare-suggest.server";
import { runAutoSpoglioForVersion } from "../server/auto-spoglio.server";
import {
  streamFullSpoglio,
  getSpoglioProgress,
} from "../server/llm-spoglio.server";
import {
  exportBreakdownPdf,
  exportBreakdownCsv,
} from "../server/export.server";

export const breakdownContextOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["breakdown", "context", projectId] as const,
    queryFn: async () =>
      unwrapResult(await getBreakdownContext({ data: { projectId } })),
  });

export const breakdownForSceneOptions = (sceneId: string, versionId: string) =>
  queryOptions({
    queryKey: ["breakdown", "scene", sceneId, versionId] as const,
    queryFn: async () =>
      unwrapResult(
        await getBreakdownForScene({
          data: { sceneId, screenplayVersionId: versionId },
        }),
      ),
    enabled: sceneId.length > 0 && versionId.length > 0,
  });

export const projectBreakdownOptions = (projectId: string, versionId: string) =>
  queryOptions({
    queryKey: ["breakdown", "project", projectId, versionId] as const,
    queryFn: async () =>
      unwrapResult(
        await getProjectBreakdown({
          data: { projectId, screenplayVersionId: versionId },
        }),
      ),
    enabled: projectId.length > 0 && versionId.length > 0,
  });

export const staleScenesOptions = (versionId: string) =>
  queryOptions({
    queryKey: ["breakdown", "stale", versionId] as const,
    queryFn: async () =>
      unwrapResult(
        await getStaleScenes({ data: { screenplayVersionId: versionId } }),
      ),
    enabled: versionId.length > 0,
  });

export const useAddBreakdownElement = (
  projectId: string,
  versionId: string,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Parameters<typeof addBreakdownElement>[0]["data"],
    ) => unwrapResult(await addBreakdownElement({ data: input })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["breakdown"] });
      void qc.invalidateQueries({
        queryKey: ["breakdown", "project", projectId, versionId],
      });
    },
  });
};

export const useUpdateBreakdownElement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Parameters<typeof updateBreakdownElement>[0]["data"],
    ) => unwrapResult(await updateBreakdownElement({ data: input })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["breakdown"] }),
  });
};

export const useArchiveBreakdownElement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { elementId: string }) =>
      unwrapResult(await archiveBreakdownElement({ data: input })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["breakdown"] }),
  });
};

export const useSetOccurrenceStatus = (sceneId: string, versionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      occurrenceIds: string[];
      status: "accepted" | "ignored" | "pending";
    }) => unwrapResult(await setOccurrenceStatus({ data: input })),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["breakdown", "scene", sceneId, versionId],
      });
    },
  });
};

/**
 * Auto-spoglio (Spec 10e) — runs the RegEx extractors over every scene of
 * the version. Idempotent server-side via text-hash short-circuit, so it's
 * safe to call once per breakdown-page mount.
 */
export const useRunAutoSpoglio = (_projectId: string, versionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(
        await runAutoSpoglioForVersion({
          data: { screenplayVersionId: versionId },
        }),
      ),
    // Single broad invalidation: ["breakdown"] already covers the project
    // breakdown query (its key starts with "breakdown"). A second invalidation
    // would just re-fetch the same cache entries.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["breakdown"] }),
  });
};

/**
 * Spec 10g — fire the Sonnet full-script breakdown for a version. The
 * server fn early-returns when the env-var feature flag is off, so this
 * hook can be called unconditionally from the BreakdownPage alongside
 * the regex baseline. Successful runs invalidate the breakdown queries
 * so newly-persisted occurrences appear without a manual refresh.
 */
export const useStreamFullSpoglio = (versionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (variables?: { force?: boolean }) =>
      unwrapResult(
        await streamFullSpoglio({
          data: {
            screenplayVersionId: versionId,
            force: variables?.force ?? false,
          },
        }),
      ),
    onMutate: () => {
      // Force the polling banner to wake up immediately so the user sees the
      // progress UI within ~1.5 s of pressing the trigger, instead of waiting
      // for the in-flight tick to elapse on a stale `scenesTotal: null`.
      void qc.invalidateQueries({
        queryKey: ["spoglio-progress", versionId],
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["breakdown"] });
      void qc.invalidateQueries({
        queryKey: ["spoglio-progress", versionId],
      });
    },
  });
};

/**
 * Spec 10g — polls the per-version progress row every 1.5 s while a run
 * is active, then disables itself once `isComplete` flips to true. The
 * BreakdownPage uses this to drive the StreamingProgressBanner without
 * needing a websocket.
 */
export const spoglioProgressOptions = (versionId: string) =>
  queryOptions({
    queryKey: ["spoglio-progress", versionId] as const,
    queryFn: async () =>
      unwrapResult(
        await getSpoglioProgress({
          data: { screenplayVersionId: versionId },
        }),
      ),
    enabled: versionId.length > 0,
    refetchInterval: (query) => (query.state.data?.isComplete ? false : 1500),
    staleTime: 0,
  });

export const useSpoglioProgress = (versionId: string) =>
  useQuery(spoglioProgressOptions(versionId));

export const useCesareSuggest = (sceneId: string, versionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(
        await suggestBreakdownForScene({
          data: { sceneId, screenplayVersionId: versionId },
        }),
      ),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: ["breakdown", "scene", sceneId, versionId],
      }),
  });
};

export const useExportBreakdown = () => {
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      screenplayVersionId: string;
      format: "pdf" | "csv";
    }) => {
      if (input.format === "pdf") {
        return {
          format: "pdf" as const,
          data: unwrapResult(
            await exportBreakdownPdf({
              data: {
                projectId: input.projectId,
                screenplayVersionId: input.screenplayVersionId,
              },
            }),
          ),
        };
      }
      return {
        format: "csv" as const,
        data: unwrapResult(
          await exportBreakdownCsv({
            data: {
              projectId: input.projectId,
              screenplayVersionId: input.screenplayVersionId,
            },
          }),
        ),
      };
    },
  });
};
