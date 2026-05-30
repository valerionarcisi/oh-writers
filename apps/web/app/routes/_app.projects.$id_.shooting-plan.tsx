import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
// @ts-ignore — ShootingPlanPage will be added in Task 9
import { ShootingPlanPage } from "~/features/shooting-plan";

export const Route = createFileRoute("/_app/projects/$id_/shooting-plan")({
  head: () => titleHead("Piano Inquadrature"),
  component: ShootingPlanRoute,
});

function ShootingPlanRoute() {
  const { id } = Route.useParams();
  return <ShootingPlanPage projectId={id} />;
}
