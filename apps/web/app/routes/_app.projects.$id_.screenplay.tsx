import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";

export const Route = createFileRoute("/_app/projects/$id_/screenplay")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Sceneggiatura"),
  component: () => <Outlet />,
});
