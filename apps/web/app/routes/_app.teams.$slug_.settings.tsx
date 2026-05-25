import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Suspense } from "react";
import { Skeleton } from "@oh-writers/ui";
import { TeamSettingsPage } from "~/features/teams";

const appRoute = getRouteApi("/_app");

export const Route = createFileRoute("/_app/teams/$slug_/settings")({
  component: TeamSettingsRoute,
});

function TeamSettingsRoute() {
  const { slug } = Route.useParams();
  const { user } = appRoute.useLoaderData();
  return (
    <Suspense
      fallback={<Skeleton lines={4} ariaLabel="Caricamento impostazioni" />}
    >
      <TeamSettingsPage slug={slug} currentUserId={user.id as string} />
    </Suspense>
  );
}
