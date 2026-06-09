import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import {
  updateTitlePageState,
  titlePageStateQueryOptions,
} from "../server/title-page.server";
import type { TitlePageState } from "../title-page-state.schema";

export { titlePageStateQueryOptions };

export const useTitlePageState = (projectId: string) =>
  useQuery(titlePageStateQueryOptions(projectId));

export const useUpdateTitlePageState = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      state: TitlePageState;
      // Defaults to true server-side. Import passes false so a foreign PDF's
      // title page never renames the project.
      syncProjectTitle?: boolean;
    }) => unwrapResult(await updateTitlePageState({ data: input })),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "title-page-state"],
      });
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });
};
