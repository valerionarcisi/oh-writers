import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  listVersions,
  createVersionFromScratch,
  duplicateVersion,
  renameVersion,
  switchToVersion,
  deleteVersion,
  saveVersionContent,
  versionsQueryOptions,
} from "../server/versions.server";

export { versionsQueryOptions };

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useVersions = (documentId: string) =>
  useQuery(versionsQueryOptions(documentId));

// ─── Mutations ────────────────────────────────────────────────────────────────

const invalidateVersions = (
  qc: ReturnType<typeof useQueryClient>,
  documentId: string,
) => {
  void qc.invalidateQueries({ queryKey: ["document-versions", documentId] });
  // Force-refetch the active document so the editor body reflects the new
  // current version. Plain invalidate() is a no-op when the data is fresh,
  // which leaves the editor stuck on the previous version's content.
  void qc.refetchQueries({ queryKey: ["documents"], type: "active" });
};

export const useCreateVersionFromScratch = (documentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrapResult(await createVersionFromScratch({ data: { documentId } })),
    onSuccess: () => invalidateVersions(qc, documentId),
  });
};

export const useDuplicateVersion = (documentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await duplicateVersion({ data: { versionId } })),
    onSuccess: () => invalidateVersions(qc, documentId),
  });
};

export const useRenameVersion = (documentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { versionId: string; label: string | null }) =>
      unwrapResult(await renameVersion({ data: input })),
    onSuccess: () => invalidateVersions(qc, documentId),
  });
};

export const useSwitchToVersion = (documentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await switchToVersion({ data: { versionId } })),
    onSuccess: () => invalidateVersions(qc, documentId),
  });
};

export const useDeleteDocumentVersion = (documentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await deleteVersion({ data: { versionId } })),
    onSuccess: () => invalidateVersions(qc, documentId),
  });
};

export const useSaveVersionContent = () =>
  useMutation({
    mutationFn: async (input: { versionId: string; content: string }) =>
      unwrapResult(await saveVersionContent({ data: input })),
  });

export {
  listVersions,
  createVersionFromScratch,
  duplicateVersion,
  renameVersion,
  switchToVersion,
  deleteVersion,
  saveVersionContent,
};
