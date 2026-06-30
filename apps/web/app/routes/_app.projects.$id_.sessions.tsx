import { createFileRoute, Outlet } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";

// Spec 47-A5 — parent for the Cesare sessions routes. Escapes the
// `/_app/projects/$id` overview layout (`$id_`) so the landing and the central
// conversation fully replace the main content. Renders only an Outlet.
export const Route = createFileRoute("/_app/projects/$id_/sessions")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Cesare"),
  component: () => <Outlet />,
});
