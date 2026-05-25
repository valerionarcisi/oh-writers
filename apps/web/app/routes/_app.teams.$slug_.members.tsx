import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Suspense } from "react";
import { Skeleton } from "@oh-writers/ui";
import { TeamMembersPage } from "~/features/teams";

const appRoute = getRouteApi("/_app");

export const Route = createFileRoute("/_app/teams/$slug_/members")({
  component: TeamMembersRoute,
});

function TeamMembersRoute() {
  const { slug } = Route.useParams();
  const { user } = appRoute.useLoaderData();
  return (
    <Suspense fallback={<Skeleton lines={6} ariaLabel="Caricamento membri" />}>
      <TeamMembersPage slug={slug} currentUserId={user.id as string} />
    </Suspense>
  );
}
