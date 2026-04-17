import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  updateTitlePage,
  titlePageQueryOptions,
} from "../server/title-page.server";
import type { TitlePage } from "../title-page.schema";

export { titlePageQueryOptions };

export const useTitlePage = (projectId: string) =>
  useQuery(titlePageQueryOptions(projectId));

export const useUpdateTitlePage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; titlePage: TitlePage }) =>
      unwrapResult(await updateTitlePage({ data: input })),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "title-page"],
      });
    },
  });
};
