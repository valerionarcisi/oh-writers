import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { assertValidProjectId } from "~/lib/project-route";
import { ProjectOverviewPage } from "~/features/projects";

export const Route = createFileRoute("/_app/projects/$id")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Progetto"),
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  return <ProjectOverviewPage projectId={id} />;
}
