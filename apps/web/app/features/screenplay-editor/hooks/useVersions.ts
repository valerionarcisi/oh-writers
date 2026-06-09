import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  listVersions,
  getVersion,
  createManualVersion,
  createBlankVersion,
  restoreVersion,
  deleteVersion,
  renameVersion,
  duplicateVersion,
  updateVersionMeta,
  versionsQueryOptions,
  versionQueryOptions,
  currentVersionIdQueryOptions,
} from "../server/versions.server";
import type {
  CreateManualVersionData,
  CreateVersionFromScratchData,
  RestoreVersionData,
  DeleteVersionData,
  RenameVersionData,
  DuplicateVersionData,
  UpdateVersionMetaData,
} from "../screenplay-versions.schema";

export { versionsQueryOptions, versionQueryOptions };

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useVersions = (screenplayId: string) =>
  useQuery(versionsQueryOptions(screenplayId));

export const useVersion = (versionId: string, enabled = true) =>
  useQuery({ ...versionQueryOptions(versionId), enabled });

/** The screenplay's current (active) version id — drives the "Attuale" badge +
 *  the delete guard in the Versions surface. */
export const useCurrentVersionId = (screenplayId: string) =>
  useQuery(currentVersionIdQueryOptions(screenplayId));

// ─── Mutations ────────────────────────────────────────────────────────────────

// Checkpoint a version (snapshot current content under a name). Used by the
// import flow to preserve the pre-import draft. Does NOT change the active
// version, so it only refreshes the versions list.
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

// "+ Nuova versione": create a BLANK active version. This moves the current
// pointer + blanks the live content, so the editor must reload to a clean page.
// Refetch the mounted editor content + the badge/guard pointer. The returned
// VersionView has no projectId, so target the active ["screenplays", …] query.
export const useCreateBlankVersion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVersionFromScratchData) =>
      unwrapResult(await createBlankVersion({ data: input })),
    onSuccess: (version) => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", version.screenplayId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["screenplays"],
        type: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: ["screenplay-current-version", version.screenplayId],
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
      void queryClient.invalidateQueries({
        queryKey: ["screenplays", screenplay.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplay.id],
      });
      // Activating sets the current pointer — refresh the badge/guard.
      void queryClient.invalidateQueries({
        queryKey: ["screenplay-current-version", screenplay.id],
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
      void queryClient.invalidateQueries({
        queryKey: ["screenplay-current-version", screenplayId],
      });
    },
  });
};

export const useRenameVersion = (screenplayId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RenameVersionData) =>
      unwrapResult(await renameVersion({ data: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplayId],
      });
    },
  });
};

export const useDuplicateVersion = (screenplayId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: DuplicateVersionData) =>
      unwrapResult(await duplicateVersion({ data: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplayId],
      });
    },
  });
};

export const useUpdateVersionMeta = (screenplayId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateVersionMetaData) =>
      unwrapResult(await updateVersionMeta({ data: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["versions", screenplayId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
    },
  });
};

export {
  listVersions,
  getVersion,
  createManualVersion,
  createBlankVersion,
  restoreVersion,
  deleteVersion,
  renameVersion,
  duplicateVersion,
  updateVersionMeta,
};
