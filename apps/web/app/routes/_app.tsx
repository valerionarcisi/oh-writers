import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "~/features/app-shell";
import { getUser } from "~/server/context";
import type { AppUser } from "~/server/context";

export const Route = createFileRoute("/_app")({
  loader: async (): Promise<{ user: AppUser }> => {
    const user = await getUser();
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useLoaderData();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
