import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Skeleton } from "@oh-writers/ui";
import { TeamDashboardPage } from "~/features/teams";

export const Route = createFileRoute("/_app/teams/$slug")({
  component: TeamDashboardRoute,
});

function TeamDashboardRoute() {
  const { slug } = Route.useParams();
  return (
    <Suspense fallback={<Skeleton lines={6} ariaLabel="Caricamento team" />}>
      <TeamDashboardPage slug={slug} />
    </Suspense>
  );
}
