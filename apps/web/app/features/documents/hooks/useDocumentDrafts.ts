import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  getDocumentDrafts,
  promoteDocumentDraft,
  discardDocumentDraft,
  documentDraftsQueryOptions,
} from "../server/drafts.server";

export { documentDraftsQueryOptions, getDocumentDrafts };

export const useDocumentDrafts = (documentId: string) =>
  useQuery(documentDraftsQueryOptions(documentId));

const invalidate = (
  qc: ReturnType<typeof useQueryClient>,
  documentId: string,
  projectId: string | null,
  docType: string | null,
) => {
  void qc.invalidateQueries({ queryKey: ["document-drafts", documentId] });
  void qc.invalidateQueries({ queryKey: ["document-versions", documentId] });
  if (projectId && docType) {
    void qc.invalidateQueries({ queryKey: ["documents", projectId, docType] });
  }
};

export const usePromoteDocumentDraft = (
  documentId: string,
  projectId: string | null,
  docType: string | null,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await promoteDocumentDraft({ data: { versionId } })),
    onSuccess: () => invalidate(qc, documentId, projectId, docType),
  });
};

export const useDiscardDocumentDraft = (
  documentId: string,
  projectId: string | null,
  docType: string | null,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await discardDocumentDraft({ data: { versionId } })),
    onSuccess: () => invalidate(qc, documentId, projectId, docType),
  });
};
