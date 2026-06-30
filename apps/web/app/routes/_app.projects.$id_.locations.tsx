import { createFileRoute } from "@tanstack/react-router";
import { assertValidProjectId } from "~/lib/project-route";
import { titleHead } from "~/lib/document-title";
import { LocationsPage } from "~/features/locations";

export const Route = createFileRoute("/_app/projects/$id_/locations")({
  beforeLoad: ({ params }) => assertValidProjectId(params),
  head: () => titleHead("Location"),
  component: LocationsRoute,
});

function LocationsRoute() {
  const { id } = Route.useParams();
  return <LocationsPage projectId={id} />;
}
