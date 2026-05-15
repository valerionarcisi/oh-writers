import { createFileRoute } from "@tanstack/react-router";
import { ProjectOverviewPage } from "~/features/projects";

export const Route = createFileRoute("/_app/projects/$id")({
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = Route.useParams();
  return <ProjectOverviewPage projectId={id} />;
}
