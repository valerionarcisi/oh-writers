import { createFileRoute, redirect } from "@tanstack/react-router";

// Spec 66: the dedicated screenplay version-viewer route is superseded by the
// unified master→detail Versions surface. Any deep-link to it now redirects to
// the screenplay editor; the writer reopens Versions from there (the `Versioni`
// action knows the screenplay id, which this route does not carry — it only has
// the project id + a version id). Removal of this route file is a follow-up.
export const Route = createFileRoute(
  "/_app/projects/$id_/screenplay/versions/$vId",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$id/screenplay",
      params: { id: params.id },
    });
  },
});
