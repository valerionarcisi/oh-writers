import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ResultAsync } from "neverthrow";
import {
  useSaveScreenplay,
  screenplayQueryOptions,
} from "~/features/screenplay-editor";
import { useCreateProject } from "./useProjects";

/**
 * Shared round-trip behind the dashboard's "Import Fountain" and "Import PDF"
 * buttons: create a fresh feature project, write the given screenplay text
 * into it, and land the user in its editor. Both buttons only differ in how
 * they get the `content` string (a raw file read vs. the PDF-import
 * pipeline) — this hook owns the create-project/save/navigate chain so it
 * isn't duplicated between them.
 */
export function useCreateProjectFromScreenplay() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  const saveScreenplay = useSaveScreenplay();

  const createAndImport = async (
    title: string,
    content: string,
  ): Promise<boolean> => {
    const outcome = await ResultAsync.fromPromise(
      createProject.mutateAsync({ title, format: "feature" }),
      () => "create" as const,
    ).andThen((project) =>
      ResultAsync.fromPromise(
        queryClient.fetchQuery(screenplayQueryOptions(project.id)),
        () => "screenplay" as const,
      ).andThen((result) =>
        result.isOk
          ? ResultAsync.fromPromise(
              saveScreenplay.mutateAsync({
                screenplayId: result.value.id,
                content,
                pmDoc: null,
              }),
              () => "save" as const,
            ).map(() => project)
          : ResultAsync.fromPromise(
              Promise.reject(new Error("no-screenplay")),
              () => "screenplay" as const,
            ),
      ),
    );

    if (outcome.isErr()) return false;

    void navigate({
      to: "/projects/$id/screenplay",
      params: { id: outcome.value.id },
    });
    return true;
  };

  return { createAndImport };
}
