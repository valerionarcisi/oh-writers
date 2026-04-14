import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import type { UserId } from "@oh-writers/domain";
import { AppShell } from "~/features/app-shell";
import type { AppUser } from "~/server/context";

type SerializableUser = { id: string; name: string; email: string };

const fetchUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SerializableUser | null> => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    if (!user) return null;
    return { id: user.id as string, name: user.name, email: user.email };
  },
);

export const Route = createFileRoute("/_app")({
  loader: async (): Promise<{ user: AppUser }> => {
    const user = await fetchUser();
    if (!user) throw redirect({ to: "/login" });
    return {
      user: { id: user.id as UserId, name: user.name, email: user.email },
    };
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
