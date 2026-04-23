import {
  queryOptions,
  useMutation,
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
