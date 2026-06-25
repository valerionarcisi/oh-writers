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
  updateVersionMeta,
  versionsQueryOptions,
  currentVersionQueryOptions,
} from "../server/versions.server";
import type { DraftRevisionColor } from "@oh-writers/domain";

export { versionsQueryOptions };

// ─── Queries ──────────────────────────────────────────────────────────────────

export const useVersions = (documentId: string) =>
  useQuery(versionsQueryOptions(documentId));

// The document's LIVE current version id — drives the Versions surface "current"
// badge so it tracks Attiva instead of the static URL hint.
export const useCurrentVersionId = (documentId: string) =>
  useQuery(currentVersionQueryOptions(documentId));

// ─── Mutations ────────────────────────────────────────────────────────────────

const invalidateVersions = (
  qc: ReturnType<typeof useQueryClient>,
  documentId: string,
) => {
  void qc.invalidateQueries({ queryKey: ["document-versions", documentId] });
  // Force-refetch the LIVE current-version pointer so the Versions list's
  // "Attuale" badge moves to the activated version. The key is a sibling of the
  // `["documents", ...]` family below, but an explicit refetch keeps it from
  // being skipped (refetchQueries with a broad prefix can miss it on a race),
  // which is what left the badge stuck on the old version after Attiva.
  void qc.refetchQueries({
    queryKey: currentVersionQueryOptions(documentId).queryKey,
  });
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

export const useUpdateVersionMeta = (documentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      versionId: string;
      draftColor?: DraftRevisionColor | null;
      draftDate?: string | null;
    }) => unwrapResult(await updateVersionMeta({ data: input })),
    onSuccess: () => invalidateVersions(qc, documentId),
  });
};

export {
  listVersions,
  createVersionFromScratch,
  duplicateVersion,
  renameVersion,
  switchToVersion,
  deleteVersion,
  saveVersionContent,
  updateVersionMeta,
};
