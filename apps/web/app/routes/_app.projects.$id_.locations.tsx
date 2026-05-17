import { createFileRoute } from "@tanstack/react-router";
import { LocationsPage } from "~/features/locations";

export const Route = createFileRoute("/_app/projects/$id_/locations")({
  component: LocationsRoute,
});

function LocationsRoute() {
  const { id } = Route.useParams();
  return <LocationsPage projectId={id} />;
}
