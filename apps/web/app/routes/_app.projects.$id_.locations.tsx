import { createFileRoute } from "@tanstack/react-router";
import { Features } from "@oh-writers/domain";
import { assertValidProjectId } from "~/lib/project-route";
import { requireFeature } from "~/lib/feature-route-guard";
import { titleHead } from "~/lib/document-title";
import { LocationsPage } from "~/features/locations";

export const Route = createFileRoute("/_app/projects/$id_/locations")({
  // Location is DEV_ONLY (not yet production-stable) — redirect a direct/
  // bookmarked deep link server-side, before any render.
  beforeLoad: async ({ params }) => {
    assertValidProjectId(params);
    await requireFeature(Features.LOCATIONS, params.id);
  },
  head: () => titleHead("Location"),
  component: LocationsRoute,
});

function LocationsRoute() {
  const { id } = Route.useParams();
  return <LocationsPage projectId={id} />;
}
