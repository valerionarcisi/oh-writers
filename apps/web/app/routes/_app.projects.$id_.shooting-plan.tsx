import { createFileRoute } from "@tanstack/react-router";
import { Features } from "@oh-writers/domain";
import { assertValidProjectId } from "~/lib/project-route";
import { requireFeature } from "~/lib/feature-route-guard";
import { titleHead } from "~/lib/document-title";
// @ts-ignore — ShootingPlanPage will be added in Task 9
import { ShootingPlanPage } from "~/features/shooting-plan";

export const Route = createFileRoute("/_app/projects/$id_/shooting-plan")({
  // Piano di ripresa is DEV_ONLY (not yet production-stable) — redirect a
  // direct/bookmarked deep link server-side, before any render.
  beforeLoad: async ({ params }) => {
    assertValidProjectId(params);
    await requireFeature(Features.SHOOTING_PLAN, params.id);
  },
  head: () => titleHead("Piano Inquadrature"),
  component: ShootingPlanRoute,
});

function ShootingPlanRoute() {
  const { id } = Route.useParams();
  return <ShootingPlanPage projectId={id} />;
}
