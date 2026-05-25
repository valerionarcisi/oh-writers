import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { Suspense } from "react";
import { Skeleton } from "@oh-writers/ui";
import type { UserId } from "@oh-writers/domain";
import { InviteAcceptancePage } from "~/features/teams";

const fetchUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; name: string; email: string } | null> => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    if (!user) return null;
    return { id: user.id as string, name: user.name, email: user.email };
  },
);

export const Route = createFileRoute("/invite/$token")({
  loader: async ({ params }) => {
    const user = await fetchUser();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirect: `/invite/${params.token}` },
      });
    }
    return {
      user: { id: user.id as UserId, name: user.name, email: user.email },
    };
  },
  component: InviteRoute,
});

function InviteRoute() {
  const { token } = Route.useParams();
  return (
    <Suspense fallback={<Skeleton lines={4} ariaLabel="Caricamento invito" />}>
      <InviteAcceptancePage token={token} />
    </Suspense>
  );
}
