import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  listDocumentVersions,
  getDocumentVersion,
  createDocumentVersion,
  renameDocumentVersion,
  deleteDocumentVersion,
  documentVersionsQueryOptions,
} from "../server/document-versions.server";

export { documentVersionsQueryOptions };

export const useDocumentVersions = (documentId: string) =>
  useQuery(documentVersionsQueryOptions(documentId));

export const useCreateDocumentVersion = (documentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (label?: string) =>
      unwrapResult(
        await createDocumentVersion({ data: { documentId, label } }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", documentId],
      });
    },
  });
};

export const useRenameDocumentVersion = (documentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { versionId: string; label: string }) =>
      unwrapResult(await renameDocumentVersion({ data: input })),
    onMutate: async (input) => {
      const key = ["document-versions", documentId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(
        key,
        (old: ReturnType<typeof listDocumentVersions> | undefined) => {
          if (!old) return old;
          return old;
        },
      );
      return { prev };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", documentId],
      });
    },
  });
};

export const useDeleteDocumentVersion = (documentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrapResult(await deleteDocumentVersion({ data: { versionId } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["document-versions", documentId],
      });
    },
  });
};
