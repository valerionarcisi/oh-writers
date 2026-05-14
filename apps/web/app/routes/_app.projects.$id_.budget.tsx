import { createFileRoute } from "@tanstack/react-router";
import { BudgetPageV2 } from "~/features/budget";

export const Route = createFileRoute("/_app/projects/$id_/budget")({
  component: BudgetRoute,
});

function BudgetRoute() {
  const { id } = Route.useParams();
  return <BudgetPageV2 projectId={id} />;
}
