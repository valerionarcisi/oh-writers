import {
  createFileRoute,
  Outlet,
  redirect,
  useMatches,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { createServerFn } from "@tanstack/start";
import type { Locale, UserId, TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import type { TopBarSectionGroup, DropdownMenuItem } from "@oh-writers/ui";
import { ConfirmDialog } from "@oh-writers/ui";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "~/features/app-shell";
import {
  peekSearchSchema,
  CESARE_PEEK_TOKEN,
  versionsSearchSchema,
  useRoutedSurface,
} from "~/features/app-shell";
import type { CesarePage } from "~/features/predictions";
import {
  useSessions as useCesareSessions,
  useRenameSession as useRenameCesareSession,
  useDeleteSession as useDeleteCesareSession,
} from "~/features/predictions";
import { useProject, personalProjectsQueryOptions } from "~/features/projects";
import type { AppUser } from "~/server/context";
import { signOut } from "~/lib/auth-client";

type SerializableUser = {
  id: string;
  name: string;
  email: string;
  locale: Locale;
};

const fetchUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SerializableUser | null> => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    if (!user) return null;
    return {
      id: user.id as string,
      name: user.name,
      email: user.email,
      locale: user.locale,
    };
  },
);

// The shell layout carries every routed auxiliary surface as search params:
// `?peek=` (Spec 46 Cesare/page side-peek) and
// `?versions=`/`?vstate=`/`?vcur=`/`?compare=` (Spec 49 Versions SplitDrawer +
// W3 Confronta). Shape-only validation here so the params survive navigation;
// content validation (fail-closed) lives in the parsers inside AppShell.
const appSearchSchema = peekSearchSchema.merge(versionsSearchSchema);

export const Route = createFileRoute("/_app")({
  validateSearch: appSearchSchema,
  loader: async (): Promise<{ user: AppUser }> => {
    const user = await fetchUser();
    if (!user) throw redirect({ to: "/login" });
    return {
      user: {
        id: user.id as UserId,
        name: user.name,
        email: user.email,
        locale: user.locale,
      },
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
  sessions: "Cesare",
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
  const { t } = useTranslation();
  const matches = useMatches();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { peek, versions, vstate, vcur, vkind } = search;

  const projectMatch = matches.find((m) => m.routeId.includes("/projects/$id"));
  const projectId = (projectMatch?.params as { id?: string } | undefined)?.id;

  // These split-surface mutators feed the unified-split reconciler's Effect 2
  // deps. `search` changes identity on EVERY navigate, so closing over it
  // directly (the previous shape) gave each callback a fresh identity every
  // render — re-running Effect 2 on every render and amplifying any residual
  // URL ↔ history disagreement into the #47 render storm. Read the live
  // `pathname` / `search` through refs instead so the callbacks stay
  // REFERENCE-STABLE; the reconciler effect then runs only on a genuine surface
  // change. (Same ref pattern `useRoutedSurface` already uses internally.)
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const searchRef = useRef(search);
  searchRef.current = search;

  // `?peek=` open/close are pure search-param mutations on the CURRENT host
  // path — we target the live `pathname` so the host page stays mounted (it
  // only compresses) and only the search param changes. Browser-back then
  // closes the peek (the param pops). Each open is a distinct history entry.
  const openCesarePeek = useCallback(() => {
    // Mutually exclusive with the Versions surface: drop `?versions` (+ its
    // companions) when promoting Cesare to the single auxiliary track, so the two
    // routed params never coexist (Spec 78 A6 — one navigable host, one track).
    const {
      versions: _v,
      vstate: _vs,
      vcur: _vc,
      vkind: _vk,
      ...rest
    } = searchRef.current;
    void navigate({
      to: pathnameRef.current,
      search: { ...rest, peek: CESARE_PEEK_TOKEN },
    });
  }, [navigate]);
  const closePeek = useCallback(() => {
    const { peek: _dropped, ...rest } = searchRef.current;
    void navigate({ to: pathnameRef.current, search: rest });
  }, [navigate]);

  // Versions SplitDrawer (Spec 49 routing + Spec 66 master→detail).
  // `useRoutedSurface` owns the URL ↔ surface mapping so this layout never
  // hand-rolls the param mutation. `vstate`/`vcur` are companions cleared
  // together with `versions` on close. `conflicts: ["peek"]` makes opening
  // Versioni drop `?peek` at the source so the two routed surfaces never coexist.
  const versionsSurface = useRoutedSurface({
    param: "versions",
    companions: ["vstate", "vcur", "vkind"],
    conflicts: ["peek"],
  });
  const closeVersions = versionsSurface.close;
  // Re-open the Versions surface when the shared split history navigates to it
  // (Spec 78 A6). One navigate sets `?versions=` (+ `vcur` / `vkind`) AND drops
  // `?peek`, so the routed params are mutually exclusive (one navigable track).
  const openVersions = useCallback(
    (documentId: string, companions: Readonly<Record<string, string>>) => {
      // Mutually exclusive with the Cesare peek: drop `?peek` so the two routed
      // params never coexist in the single auxiliary track (Spec 78 A6).
      const { peek: _peek, ...rest } = searchRef.current;
      void navigate({
        to: pathnameRef.current,
        search: { ...rest, ...companions, versions: documentId },
      });
    },
    [navigate],
  );
  // `↗` expand → real navigation to the full-screen versions route (new history
  // entry; browser-back / `↙` returns to the split). The doc + baseline + kind are
  // preserved so the full route stays deep-linkable.
  const expandVersions = useCallback(() => {
    if (versions == null) return;
    const companions: Record<string, string> = { vstate: "full" };
    if (vcur != null) companions["vcur"] = vcur;
    if (vkind != null) companions["vkind"] = vkind;
    versionsSurface.navigateState(versions, companions);
  }, [versionsSurface, versions, vcur, vkind]);
  // `↙` step-back → drop `vstate` (back to the split) as a real navigation.
  const stepBackVersions = useCallback(() => {
    if (versions == null) return;
    const companions: Record<string, string> = {};
    if (vcur != null) companions["vcur"] = vcur;
    if (vkind != null) companions["vkind"] = vkind;
    versionsSurface.navigateState(versions, companions);
  }, [versionsSurface, versions, vcur, vkind]);

  const lastMatch = matches[matches.length - 1];
  const sectionName = lastMatch
    ? deriveSectionName(lastMatch.routeId, Boolean(projectId))
    : "";
  const activeSegment = lastMatch
    ? activeSegmentFromRouteId(lastMatch.routeId)
    : "";

  const { data: projectResult } = useProject(projectId ?? "");
  // N-21 — with no project selected, leave the name empty so the shell renders
  // no project switcher row and the brand wordmark is hidden (the "O" mark
  // stands alone). Only fall back to "…" while a real project's title loads.
  const projectName = projectResult?.isOk
    ? projectResult.value.title
    : projectId
      ? "…"
      : "";

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
  // Highlight the session the user is currently viewing on the central
  // `/sessions/:sessionId` route (when on it), else fall back to most-recent.
  const activeSessionIdFromRoute = (
    matches.find((m) => m.routeId.includes("/sessions/$sessionId"))?.params as
      | { sessionId?: string }
      | undefined
  )?.sessionId;
  const cesareSessionsForRail = cesareSessionsQuery.data?.map((s, idx) => ({
    id: s.id,
    title: s.title,
    lastAt: formatSessionRelative(s.lastMessageAt, t),
    active: activeSessionIdFromRoute
      ? s.id === activeSessionIdFromRoute
      : idx === 0,
  }));

  // Spec 47-A5 — clicking a session row opens its full conversation at the
  // central, deep-linkable route (NOT a peek). The shell-level session focus
  // context (read by CesareSheet) then aligns the authoritative floating drawer.
  const handleCesareSessionSelect = (sessionId: string) => {
    if (!projectId) return;
    void navigate({
      to: "/projects/$id/sessions/$sessionId",
      params: { id: projectId, sessionId },
    });
  };

  // Spec 53 — inline rename + delete-with-modal. Rename commits through the
  // existing mutation (which invalidates the list + the open-session query so
  // the title reflects everywhere); the rail owns the in-place edit UX. Delete
  // routes through a confirmation modal (DS Dialog) before the destructive
  // mutation; if the open session is removed we navigate away.
  const renameCesareSession = useRenameCesareSession(projectId ?? "");
  const deleteCesareSession = useDeleteCesareSession(projectId ?? "");
  // The session queued for deletion (drives the confirmation modal). `null`
  // when the modal is closed.
  const [sessionPendingDelete, setSessionPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleCesareSessionRename = (sessionId: string, title: string) => {
    renameCesareSession.mutate({ id: sessionId, title });
  };

  const handleCesareSessionDeleteRequest = (sessionId: string) => {
    const target = cesareSessionsQuery.data?.find((s) => s.id === sessionId);
    if (!target) return;
    setSessionPendingDelete({ id: target.id, title: target.title });
  };

  const handleCesareSessionDeleteCancel = () => setSessionPendingDelete(null);

  const handleCesareSessionDeleteConfirm = () => {
    const target = sessionPendingDelete;
    if (!target) return;
    const wasOpen = target.id === activeSessionIdFromRoute;
    deleteCesareSession.mutate(target.id, {
      onSuccess: () => {
        // The deleted row leaves the list on invalidation. When it was the open
        // session, drop the now-dangling route back to the sessions landing.
        if (wasOpen && projectId) {
          void navigate({
            to: "/projects/$id/sessions",
            params: { id: projectId },
          });
        }
      },
    });
    setSessionPendingDelete(null);
  };

  // The rail's dedicated "Cesare" entry opens the sessions landing.
  const handleCesareSessionsOpen = () => {
    if (!projectId) return;
    void navigate({
      to: "/projects/$id/sessions",
      params: { id: projectId },
    });
  };

  // Spec 52 — "+ Nuova" / "Nuova sessione" opens the full-screen glowy landing
  // (`/sessions/new`). The session row is created only when the user sends their
  // first message there, so the rail never spawns empty throwaway sessions.
  const handleCesareSessionNew = () => {
    if (!projectId) return;
    void navigate({
      to: "/projects/$id/sessions/new",
      params: { id: projectId },
    });
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
    <>
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
        onCesareSessionRename={handleCesareSessionRename}
        onCesareSessionDelete={handleCesareSessionDeleteRequest}
        onCesareSessionNew={handleCesareSessionNew}
        peek={peek ?? null}
        onOpenCesarePeek={openCesarePeek}
        onClosePeek={closePeek}
        onCesareSessionsOpen={handleCesareSessionsOpen}
        versionsParam={versions ?? null}
        versionsStateParam={vstate ?? null}
        versionsCurrentParam={vcur ?? null}
        versionsKindParam={vkind ?? null}
        onCloseVersions={closeVersions}
        onOpenVersions={openVersions}
        onExpandVersions={expandVersions}
        onStepBackVersions={stepBackVersions}
      >
        <Outlet />
      </AppShell>
      <ConfirmDialog
        isOpen={sessionPendingDelete !== null}
        testId="session-delete-dialog"
        title="Elimina sessione"
        message={
          sessionPendingDelete
            ? `Eliminare la sessione «${sessionPendingDelete.title}»? L'azione non è reversibile.`
            : ""
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        destructive
        onConfirm={handleCesareSessionDeleteConfirm}
        onCancel={handleCesareSessionDeleteCancel}
      />
    </>
  );
}

// Relative "lastAt" formatter shared with the Cesare drawer's session selector.
// Kept simple so the rail shows recognisable buckets ("ora" / "2h" / "ieri").
function formatSessionRelative(
  iso: string,
  t: (key: TranslationKey) => string,
): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("shell.relative.now");
  if (minutes < 60)
    return t("shell.relative.minutes").replace("{n}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return t("shell.relative.hours").replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  if (days === 1) return t("shell.relative.yesterday");
  return t("shell.relative.days").replace("{n}", String(days));
}
