import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback } from "react";
import { createServerFn } from "@tanstack/start";
import type { UserId } from "@oh-writers/domain";
import type { TopBarSectionGroup, DropdownMenuItem } from "@oh-writers/ui";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "~/features/app-shell";
import { peekSearchSchema, CESARE_PEEK_TOKEN } from "~/features/app-shell";
import type { CesarePage } from "~/features/predictions";
import {
  useSessions as useCesareSessions,
  useCreateSession as useCreateCesareSession,
} from "~/features/predictions";
import { useProject, personalProjectsQueryOptions } from "~/features/projects";
import type { AppUser } from "~/server/context";
import { signOut } from "~/lib/auth-client";

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
  // `?peek=` drives the Notion-style split drawer (Spec 46). Validated at the
  // shell layout so every project page can carry it. Content validation (same-
  // project guard, fail-closed) happens in `parseCesarePeek` inside AppShell;
  // here we only validate the shape so the search param survives navigation.
  validateSearch: peekSearchSchema,
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
  schedule: "Calendarizzazione",
  "shooting-plan": "Inquadrature",
  locations: "Location",
  screenplay: "Sceneggiatura",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
  settings: "Impostazioni",
  "title-page": "Frontespizio",
  dashboard: "Progetti",
};

// The SavePill is driven entirely by editor components via
// `useSaveStatePublisher` (see `features/app-shell/save-state-context.tsx`).
// `_app.tsx` no longer hardcodes a static "saved" — an empty document, a
// read-only route, or a not-yet-edited document leaves the context value
// `undefined` and the pill stays hidden. This avoids a stale "Salvato" chip
// on routes like /outline, /treatment and /title-page before the user types.

function deriveSectionName(routeId: string, hasProjectId: boolean): string {
  for (const [segment, label] of Object.entries(SECTION_LABELS)) {
    if (routeId.includes(segment)) return label;
  }
  // Project home (no sub-route segment matched) — show an explicit label
  // so the TopBar doesn't render `Sezione: — cambia sezione`.
  if (hasProjectId) return "Panoramica";
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
      { segment: "synopsis", label: "Sinossi", icon: "book" },
      { segment: "outline", label: "Scaletta", icon: "clipboard" },
      { segment: "treatment", label: "Trattamento", icon: "file-text" },
      { segment: "screenplay", label: "Sceneggiatura", icon: "file-text" },
    ],
  },
  {
    label: "Pre-produzione",
    items: [
      { segment: "breakdown", label: "Breakdown", icon: "clipboard" },
      { segment: "budget", label: "Budget", icon: "file-text" },
      { segment: "shooting-plan", label: "Inquadrature", icon: "camera" },
      { segment: "schedule", label: "Calendarizzazione", icon: "clock" },
      { segment: "locations", label: "Location", icon: "map-pin" },
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

// Route segment → Cesare page. The app navigates with English slugs, but we
// also recognise the Italian deep-link aliases (e.g. /sinossi, /location): the
// Cesare context chip + prompt suggestions must reflect the page the user is
// actually on even when a localized URL was typed directly, instead of falling
// back to the default and going stale (Spec 44 context-chip reactivity).
const CESARE_PAGE_SEGMENTS: Array<{ segment: string; page: CesarePage }> = [
  { segment: "/shooting-plan", page: "shooting-plan" },
  { segment: "/inquadrature", page: "shooting-plan" },
  { segment: "/screenplay", page: "screenplay" },
  { segment: "/sceneggiatura", page: "screenplay" },
  { segment: "/breakdown", page: "breakdown" },
  { segment: "/budget", page: "budget" },
  { segment: "/schedule", page: "schedule" },
  { segment: "/calendario", page: "schedule" },
  { segment: "/treatment", page: "treatment" },
  { segment: "/trattamento", page: "treatment" },
  { segment: "/outline", page: "outline" },
  { segment: "/scaletta", page: "outline" },
  { segment: "/synopsis", page: "synopsis" },
  { segment: "/sinossi", page: "synopsis" },
  { segment: "/soggetto", page: "soggetto" },
  { segment: "/locations", page: "locations" },
  { segment: "/location", page: "locations" },
];

function deriveCesarePage(pathname: string): CesarePage {
  for (const { segment, page } of CESARE_PAGE_SEGMENTS) {
    if (pathname.includes(segment)) return page;
  }
  return "screenplay";
}

function AppLayout() {
  const { user } = Route.useLoaderData();
  const matches = useMatches();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { peek } = search;

  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));
  const projectId = (projectMatch?.params as { id?: string } | undefined)?.id;

  // `?peek=` open/close are pure search-param mutations on the CURRENT host
  // path — we target the live `pathname` so the host page stays mounted (it
  // only compresses) and only the search param changes. Browser-back then
  // closes the peek (the param pops). Each open is a distinct history entry.
  const openCesarePeek = useCallback(() => {
    void navigate({
      to: pathname,
      search: { ...search, peek: CESARE_PEEK_TOKEN },
    });
  }, [navigate, pathname, search]);
  const closePeek = useCallback(() => {
    const { peek: _dropped, ...rest } = search;
    void navigate({ to: pathname, search: rest });
  }, [navigate, pathname, search]);

  const lastMatch = matches[matches.length - 1];
  const sectionName = lastMatch
    ? deriveSectionName(lastMatch.routeId, Boolean(projectId))
    : "";
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
  const cesarePage = deriveCesarePage(pathname);

  const { data: personalProjects } = useQuery(personalProjectsQueryOptions());
  const projectsList = personalProjects?.map((p) => ({
    id: p.id,
    title: p.title,
  }));

  // Cesare sessions for the LeftRail "Sessioni Cesare" slot. Loaded only when
  // we have a project (the rail simply hides the section when sessions is
  // undefined). Active session is the most recently used one — re-deriving
  // here keeps the rail aligned with the chat surface which defaults the same
  // way.
  const cesareSessionsQuery = useCesareSessions(projectId);
  const createCesareSession = useCreateCesareSession(projectId ?? "");
  const cesareSessionsForRail = cesareSessionsQuery.data?.map((s, idx) => ({
    id: s.id,
    title: s.title,
    lastAt: formatSessionRelative(s.lastMessageAt),
    active: idx === 0,
  }));

  const handleCesareSessionSelect = (_sessionId: string) => {
    // Active-session sync between rail and chat surface lives in CesareSheet;
    // for now the rail row simply highlights and the chat-side popover handles
    // the actual switch. A future iteration can lift activeSessionId into a
    // shared context.
  };

  const handleCesareSessionNew = () => {
    void createCesareSession.mutateAsync(undefined);
  };

  const userMenuItems: DropdownMenuItem[] = [
    {
      label: "Impostazioni account",
      onClick: () => {
        window.location.href = "/settings";
      },
    },
    {
      label: "Presentazione",
      onClick: () => window.open("/market-analysis.html", "_blank"),
    },
    {
      label: "Sign out",
      onClick: async () => {
        await signOut();
        window.location.href = "/login";
      },
    },
  ];

  return (
    <AppShell
      user={user}
      projectName={projectName}
      sectionName={sectionName}
      activeSegment={activeSegment}
      sectionGroups={sectionGroups.length > 0 ? sectionGroups : undefined}
      projects={projectsList}
      currentProjectId={projectId}
      userMenuItems={userMenuItems}
      projectId={projectId}
      cesarePage={cesarePage}
      cesareSessions={cesareSessionsForRail}
      onCesareSessionSelect={handleCesareSessionSelect}
      onCesareSessionNew={handleCesareSessionNew}
      peek={peek ?? null}
      onOpenCesarePeek={openCesarePeek}
      onClosePeek={closePeek}
    >
      <Outlet />
    </AppShell>
  );
}

// Relative "lastAt" formatter shared with the Cesare drawer's session selector.
// Kept simple so the rail shows recognisable buckets ("ora" / "2h" / "ieri").
function formatSessionRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ieri";
  return `${days}g`;
}
