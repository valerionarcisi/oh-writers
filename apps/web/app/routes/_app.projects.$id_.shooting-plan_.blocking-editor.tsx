import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Features } from "@oh-writers/domain";
import { assertValidProjectId } from "~/lib/project-route";
import { requireFeature } from "~/lib/feature-route-guard";
import { BlockingEditorPage } from "~/features/shooting-plan/components/blocking-editor/BlockingEditorPage";

export const Route = createFileRoute(
  "/_app/projects/$id_/shooting-plan_/blocking-editor",
)({
  // Same DEV_ONLY gate as the parent shooting-plan route.
  beforeLoad: async ({ params }) => {
    assertValidProjectId(params);
    await requireFeature(Features.SHOOTING_PLAN, params.id);
  },
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
