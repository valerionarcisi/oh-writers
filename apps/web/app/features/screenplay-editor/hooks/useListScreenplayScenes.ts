import { queryOptions, useQuery } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { listScreenplayScenes } from "../server/screenplay-export.server";

export const screenplayScenesQueryOptions = (screenplayId: string) =>
  queryOptions({
    queryKey: ["screenplay", screenplayId, "scenes"],
    queryFn: async () =>
      unwrapResult(await listScreenplayScenes({ data: { screenplayId } })),
  });

export const useListScreenplayScenes = (
  screenplayId: string,
  options: { enabled?: boolean } = {},
) =>
  useQuery({
    ...screenplayScenesQueryOptions(screenplayId),
    enabled: options.enabled ?? true,
  });
