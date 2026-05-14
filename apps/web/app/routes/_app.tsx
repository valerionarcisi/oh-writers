import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
} from "@tanstack/react-router";
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

const SECTION_LABELS: Record<string, string> = {
  breakdown: "Breakdown",
  budget: "Budget",
  schedule: "Schedule",
  screenplay: "Screenplay",
  soggetto: "Soggetto",
  synopsis: "Synopsis",
  outline: "Outline",
  treatment: "Treatment",
  settings: "Impostazioni",
  "title-page": "Frontespizio",
  dashboard: "Projects",
};

function deriveSectionName(routeId: string): string {
  for (const [segment, label] of Object.entries(SECTION_LABELS)) {
    if (routeId.includes(segment)) return label;
  }
  return "";
}

function AppLayout() {
  const { user } = Route.useLoaderData();
  const matches = useMatches();

  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));
  const projectId = (projectMatch?.params as { id?: string } | undefined)?.id;

  const lastMatch = matches[matches.length - 1];
  const sectionName = lastMatch ? deriveSectionName(lastMatch.routeId) : "";

  return (
    <AppShell
      user={user}
      projectName={projectId ? "" : "Oh Writers"}
      sectionName={sectionName}
      saveState="saved"
    >
      <Outlet />
    </AppShell>
  );
}
