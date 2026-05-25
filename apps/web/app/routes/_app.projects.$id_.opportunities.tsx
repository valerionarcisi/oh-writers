import { createFileRoute } from "@tanstack/react-router";
import { OpportunitiesPage } from "~/features/fundraising/components/OpportunitiesPage";

export const Route = createFileRoute("/_app/projects/$id_/opportunities")({
  component: OpportunitiesRoute,
});

function OpportunitiesRoute() {
  const { id } = Route.useParams();
  return <OpportunitiesPage projectId={id} />;
}
