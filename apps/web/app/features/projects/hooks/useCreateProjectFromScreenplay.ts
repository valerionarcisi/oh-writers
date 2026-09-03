import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ResultAsync } from "neverthrow";
import {
  useSaveScreenplay,
  screenplayQueryOptions,
} from "~/features/screenplay-editor";
import type { TitlePageDocJSON } from "~/features/screenplay-editor";
import { useCreateProject } from "./useProjects";
import { useUpdateTitlePageState } from "./useTitlePageState";
import { titlePageDocForWire } from "../title-page-state.schema";

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
  const updateTitlePageState = useUpdateTitlePageState();

  const createAndImport = async (
    title: string,
    content: string,
    titlePageDoc?: TitlePageDocJSON | null,
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
            ).map((saved) => ({ project, saved }))
          : ResultAsync.fromPromise(
              Promise.reject(new Error("no-screenplay")),
              () => "screenplay" as const,
            ),
      ),
    );

    if (outcome.isErr()) return false;
    const { project, saved } = outcome.value;

    // Write the just-saved screenplay straight into the query cache before
    // navigating. useSaveScreenplay's onSuccess only *invalidates* this key,
    // which refetches active queries — but the screenplay route isn't mounted
    // yet at this point, so the stale entry (content: "" from the fetchQuery
    // above, before the save) survives until navigation. ScreenplayEditor
    // seeds its local `content` state from that prop on mount, and its own
    // autosave then persists the empty string right over the imported text.
    // Found live 2026-09-03 (PDF import producing a blank editor).
    queryClient.setQueryData(screenplayQueryOptions(project.id).queryKey, {
      isOk: true,
      value: saved,
    });

    // A PDF's title page is applied to the fresh project's own (empty) title
    // page — syncProjectTitle stays true (the default) since this project's
    // placeholder name ("Imported screenplay" etc.) is meant to be replaced,
    // unlike importing a PDF into an already-named existing project.
    if (titlePageDoc) {
      await updateTitlePageState.mutateAsync({
        projectId: project.id,
        state: {
          doc: titlePageDocForWire(titlePageDoc),
          draftDate: null,
          draftColor: null,
        },
      });
    }

    void navigate({
      to: "/projects/$id/screenplay",
      params: { id: project.id },
    });
    return true;
  };

  return { createAndImport };
}
