import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { BudgetPage } from "~/features/budget";

export const Route = createFileRoute("/_app/projects/$id_/budget")({
  head: () => titleHead("Budget"),
  component: BudgetRoute,
});

function BudgetRoute() {
  const { id } = Route.useParams();
  return <BudgetPage projectId={id} />;
}
