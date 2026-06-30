import { createFileRoute, useRouter } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { BlockingEditorPage } from "~/features/shooting-plan/components/blocking-editor/BlockingEditorPage";

export const Route = createFileRoute(
  "/_app/projects/$id_/shooting-plan_/blocking-editor",
)({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  component: BlockingEditorRoute,
});

function BlockingEditorRoute() {
  const { id: projectId } = Route.useParams();
  const router = useRouter();

  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const sceneId = search.get("scene") ?? "";
  const planId = search.get("plan") ?? "";

  if (!sceneId || !planId) {
    return <p>Missing scene or plan parameters. (projectId: {projectId})</p>;
  }

  return (
    <BlockingEditorPage
      sceneId={sceneId}
      planId={planId}
      onClose={() => router.history.back()}
    />
  );
}
