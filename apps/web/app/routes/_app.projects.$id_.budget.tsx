import { createFileRoute } from "@tanstack/react-router";
import { Features } from "@oh-writers/domain";
import { assertValidProjectId } from "~/lib/project-route";
import { requireFeature } from "~/lib/feature-route-guard";
import { titleHead } from "~/lib/document-title";
import { BudgetPage } from "~/features/budget";

export const Route = createFileRoute("/_app/projects/$id_/budget")({
  // Budget is DEV_ONLY (not yet production-stable) — redirect a direct/
  // bookmarked deep link server-side, before any render, same pattern as the
  // fundraising market gate.
  beforeLoad: async ({ params }) => {
    assertValidProjectId(params);
    await requireFeature(Features.BUDGET, params.id);
  },
  head: () => titleHead("Budget"),
  component: BudgetRoute,
});

function BudgetRoute() {
  const { id } = Route.useParams();
  return <BudgetPage projectId={id} />;
}
