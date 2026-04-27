import { useMutation } from "@tanstack/react-query";
import type { SubjectSection } from "@oh-writers/domain";
import { unwrapResult } from "@oh-writers/utils";
import { generateSubjectSection } from "../server/subject-ai.server";

// Pure text generator — the caller inserts the returned text into the editor.
// No cache invalidation: persistence of the Soggetto document happens via
// the existing saveDocument mutation in useDocument.
export const useGenerateSubjectSection = () =>
  useMutation({
    mutationFn: async (input: { projectId: string; section: SubjectSection }) =>
      unwrapResult(await generateSubjectSection({ data: input })),
  });
