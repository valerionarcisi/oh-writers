import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import type { SiaeMetadata } from "../documents.schema";
import {
  loadSiaeMetadata,
  saveSiaeMetadata,
} from "../server/subject-siae-metadata.server";

export const siaeMetadataQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ["siae-metadata", projectId],
    queryFn: () => loadSiaeMetadata({ data: { projectId } }).then(unwrapResult),
  });

export const useSiaeMetadata = (projectId: string) =>
  useQuery(siaeMetadataQueryOptions(projectId));

export const useSaveSiaeMetadata = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (metadata: SiaeMetadata) =>
      saveSiaeMetadata({ data: { projectId, metadata } }).then(unwrapResult),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["siae-metadata", projectId] }),
  });
};
