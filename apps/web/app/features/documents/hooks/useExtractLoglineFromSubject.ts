import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { projectQueryOptions } from "~/features/projects";
import { generateLoglineFromSubject } from "../server/subject-ai.server";

// Returns the proposed logline from the Soggetto; does NOT persist.
// The caller decides whether to accept and saves via the project-update mutation.
// Project row is invalidated so a stale logline doesn't shadow the new proposal
// if the user accepts it via a separate save.
export const useExtractLoglineFromSubject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string }) =>
      unwrapResult(await generateLoglineFromSubject({ data: input })),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({
        queryKey: projectQueryOptions(vars.projectId).queryKey,
      });
    },
  });
};
