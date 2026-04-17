import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  listVersions,
  getVersion,
  createManualVersion,
  restoreVersion,
  deleteVersion,
  createVersionFromScratch,
  duplicateVersion,
  renameVersion,
  switchToVersion,
  saveVersionContent,
  versionsQueryOptions,
  versionQueryOptions,
} from "../server/versions.server";
import type {
  CreateManualVersionData,
  RestoreVersionData,
  DeleteVersionData,
} from "../screenplay-versions.schema";

export { versionsQueryOptions, versionQueryOptions };

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
      unwrapResult(await createManualVersion({ data: input })),
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
      unwrapResult(await restoreVersion({ data: input })),
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
      unwrapResult(await deleteVersion({ data: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplayId],
      });
    },
  });
};

// ─── New Spec 06b mutations ───────────────────────────────────────────────────

const invalidate = (
  qc: ReturnType<typeof useQueryClient>,
  screenplayId: string,
  projectId?: string,
) => {
  void qc.invalidateQueries({ queryKey: ["versions", screenplayId] });
  if (projectId) {
    void qc.invalidateQueries({ queryKey: ["screenplays", projectId] });
  } else {
    void qc.invalidateQueries({ queryKey: ["screenplays"] });
  }
};

export const useCreateVersionFromScratch = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(await createVersionFromScratch({ data: { screenplayId } })),
    onSuccess: (v) => invalidate(qc, screenplayId, undefined),
  });
};

export const useDuplicateScreenplayVersion = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await duplicateVersion({ data: { versionId } })),
    onSuccess: () => invalidate(qc, screenplayId, undefined),
  });
};

export const useRenameScreenplayVersion = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { versionId: string; label: string | null }) =>
      unwrapResult(await renameVersion({ data: input })),
    onSuccess: () => invalidate(qc, screenplayId, undefined),
  });
};

export const useSwitchToVersion = (screenplayId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await switchToVersion({ data: { versionId } })),
    onSuccess: () => invalidate(qc, screenplayId, undefined),
  });
};

export const useSaveScreenplayVersionContent = () =>
  useMutation({
    mutationFn: async (input: {
      versionId: string;
      content: string;
      pageCount: number;
    }) => unwrapResult(await saveVersionContent({ data: input })),
  });

export {
  listVersions,
  getVersion,
  createManualVersion,
  restoreVersion,
  deleteVersion,
  createVersionFromScratch,
  duplicateVersion,
  renameVersion,
  switchToVersion,
  saveVersionContent,
};
