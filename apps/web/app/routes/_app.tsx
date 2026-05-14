import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import type { UserId } from "@oh-writers/domain";
import type { TopBarSection } from "@oh-writers/ui";
import { AppShell } from "~/features/app-shell";
import { useProject } from "~/features/projects";
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

const PROJECT_SECTIONS: ReadonlyArray<{ segment: string; label: string }> = [
  { segment: "soggetto", label: "Soggetto" },
  { segment: "synopsis", label: "Synopsis" },
  { segment: "outline", label: "Outline" },
  { segment: "treatment", label: "Treatment" },
  { segment: "screenplay", label: "Screenplay" },
  { segment: "breakdown", label: "Breakdown" },
  { segment: "schedule", label: "Schedule" },
  { segment: "budget", label: "Budget" },
  { segment: "title-page", label: "Frontespizio" },
];

function buildSections(
  projectId: string | undefined,
  activeSegment: string,
): ReadonlyArray<TopBarSection> {
  if (!projectId) return [];
  return PROJECT_SECTIONS.map((s) => ({
    label: s.label,
    href: `/projects/${projectId}/${s.segment}`,
    isActive: s.segment === activeSegment,
  }));
}

function activeSegmentFromRouteId(routeId: string): string {
  for (const s of PROJECT_SECTIONS) {
    if (routeId.includes(s.segment)) return s.segment;
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
  const activeSegment = lastMatch
    ? activeSegmentFromRouteId(lastMatch.routeId)
    : "";

  const { data: projectResult } = useProject(projectId ?? "");
  const projectName = projectResult?.isOk
    ? projectResult.value.title
    : projectId
      ? "…"
      : "Oh Writers";

  const sections = buildSections(projectId, activeSegment);

  return (
    <AppShell
      user={user}
      projectName={projectName}
      sectionName={sectionName}
      saveState="saved"
      sections={sections.length > 0 ? sections : undefined}
    >
      <Outlet />
    </AppShell>
  );
}
