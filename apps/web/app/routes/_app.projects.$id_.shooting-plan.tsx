import { createFileRoute } from "@tanstack/react-router";
// @ts-ignore — ShootingPlanPage will be added in Task 9
import { ShootingPlanPage } from "~/features/shooting-plan";

export const Route = createFileRoute("/_app/projects/$id_/shooting-plan")({
  component: ShootingPlanRoute,
});

function ShootingPlanRoute() {
  const { id } = Route.useParams();
  return <ShootingPlanPage projectId={id} />;
}
