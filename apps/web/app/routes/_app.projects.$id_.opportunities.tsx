import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { OpportunitiesPage } from "~/features/fundraising/components/OpportunitiesPage";

export const Route = createFileRoute("/_app/projects/$id_/opportunities")({
  head: () => titleHead("Opportunità"),
  component: OpportunitiesRoute,
});

function OpportunitiesRoute() {
  const { id } = Route.useParams();
  return <OpportunitiesPage projectId={id} />;
}
