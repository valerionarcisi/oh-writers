import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import type { UserId } from "@oh-writers/domain";
import type { TopBarSectionGroup } from "@oh-writers/ui";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "~/features/app-shell";
import {
  useProject,
  personalProjectsQueryOptions,
} from "~/features/projects";
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

type SectionDef = { segment: string; label: string; icon: string };

const SECTION_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<SectionDef>;
}> = [
  {
    label: "Scrittura",
    items: [
      { segment: "soggetto", label: "Soggetto", icon: "file-text" },
      { segment: "synopsis", label: "Synopsis", icon: "book" },
      { segment: "outline", label: "Outline", icon: "clipboard" },
      { segment: "treatment", label: "Treatment", icon: "file-text" },
      { segment: "screenplay", label: "Screenplay", icon: "file-text" },
    ],
  },
  {
    label: "Pre-produzione",
    items: [
      { segment: "breakdown", label: "Breakdown", icon: "clipboard" },
      { segment: "budget", label: "Budget", icon: "file-text" },
      { segment: "schedule", label: "Schedule", icon: "clock" },
    ],
  },
];

// `title-page` non vive nel section dropdown: il Frontespizio si raggiunge
// solo dal menu ⋯ all'interno dell'editor Screenplay (è una proprietà di
// quella sceneggiatura, non una sezione di progetto autonoma).
const TITLE_PAGE_SEGMENT = "title-page";

const ALL_SECTIONS = SECTION_GROUPS.flatMap((g) => g.items);

function buildSectionGroups(
  projectId: string | undefined,
  activeSegment: string,
): ReadonlyArray<TopBarSectionGroup> {
  if (!projectId) return [];
  return SECTION_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((s) => ({
      label: s.label,
      icon: s.icon,
      href: `/projects/${projectId}/${s.segment}`,
      isActive: s.segment === activeSegment,
    })),
  }));
}

function activeSegmentFromRouteId(routeId: string): string {
  if (routeId.includes(TITLE_PAGE_SEGMENT)) return TITLE_PAGE_SEGMENT;
  for (const s of ALL_SECTIONS) {
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

  const sectionGroups = buildSectionGroups(projectId, activeSegment);

  const { data: personalProjects } = useQuery(personalProjectsQueryOptions());
  const projectsList = personalProjects?.map((p) => ({
    id: p.id,
    title: p.title,
  }));

  return (
    <AppShell
      user={user}
      projectName={projectName}
      sectionName={sectionName}
      saveState="saved"
      sectionGroups={sectionGroups.length > 0 ? sectionGroups : undefined}
      projects={projectsList}
      currentProjectId={projectId}
    >
      <Outlet />
    </AppShell>
  );
}
