import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listVersions,
  getVersion,
  createManualVersion,
  restoreVersion,
  deleteVersion,
  versionsQueryOptions,
  versionQueryOptions,
} from "../server/versions.server";
import type {
  CreateManualVersionData,
  RestoreVersionData,
  DeleteVersionData,
} from "../screenplay-versions.schema";

export { versionsQueryOptions, versionQueryOptions };

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useVersions = (screenplayId: string) =>
  useQuery(versionsQueryOptions(screenplayId));

export const useVersion = (versionId: string, enabled = true) =>
  useQuery({ ...versionQueryOptions(versionId), enabled });

// ─── Mutations ────────────────────────────────────────────────────────────────

export const useCreateManualVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateManualVersionData) =>
      throwOnErr(await createManualVersion({ data: input })),
    onSuccess: (version) => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", version.screenplayId],
      });
    },
  });
};

export const useRestoreVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RestoreVersionData) =>
      throwOnErr(await restoreVersion({ data: input })),
    onSuccess: (screenplay) => {
      // Invalidate screenplay so the editor reloads with restored content
      void queryClient.invalidateQueries({
        queryKey: ["screenplays", screenplay.projectId],
      });
      // Invalidate versions list (restore creates a safety auto-save)
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplay.id],
      });
    },
  });
};

export const useDeleteVersion = (screenplayId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteVersionData) =>
      throwOnErr(await deleteVersion({ data: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplayId],
      });
    },
  });
};

export {
  listVersions,
  getVersion,
  createManualVersion,
  restoreVersion,
  deleteVersion,
};
