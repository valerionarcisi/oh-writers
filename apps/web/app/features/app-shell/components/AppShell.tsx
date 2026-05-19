import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { TopBar, SkipLink, CommandPalette, useToast } from "@oh-writers/ui";
import type {
  SaveState,
  TopBarSection,
  TopBarSectionGroup,
  CommandPaletteItem,
  ProjectSwitcherItem,
  DropdownMenuItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import { CesareSheet, parseToolsExecuted } from "~/features/predictions";
import { askCesare } from "~/features/predictions";
import type { CesarePage, AskCesareFn } from "~/features/predictions";
import type { AppUser } from "~/server/context";
import { SaveStateProvider, useSaveStateValue } from "../save-state-context";
import { CesareProvider, type OpenCesareOptions } from "../cesare-context";
import {
  ActiveSceneProvider,
  useActiveScene,
  useActiveRequirementId,
  useActiveDocument,
  useActiveShootingDay,
} from "../active-scene-context";
import {
  CesareNotificationProvider,
  useCesareNotifications,
  type CesareNotification,
} from "../cesare-notification-context";
import {
  ACTION_LABEL_BY_PAGE,
  deriveResultLabel,
  isAgenticPage,
} from "../cesare-notification-labels";
import { useWebPush } from "../hooks/useWebPush";
import { pulseAffectedEntities } from "../cesare-pulse";
import { NotificationCenterDrawer } from "./NotificationCenterDrawer";
import styles from "./AppShell.module.css";

interface AppShellProps {
  user: AppUser;
  projectName?: string;
  sectionName?: string;
  saveState?: SaveState;
  saveSecondsAgo?: number;
  cesareNoteCount?: number;
  sections?: ReadonlyArray<TopBarSection>;
  sectionGroups?: ReadonlyArray<TopBarSectionGroup>;
  projects?: ReadonlyArray<ProjectSwitcherItem>;
  currentProjectId?: string;
  onProjectSelect?: (id: string) => void;
  userMenuItems?: DropdownMenuItem[];
  projectId?: string;
  cesarePage?: CesarePage;
  children: ReactNode;
}

const deriveInitials = (name: string): string =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

// Map Cesare's CesarePage identifier to the URL segment under `/projects/:id`
// — used by the notification activation handler to navigate the user to
// where the action happened.
const PAGE_TO_ROUTE_SEGMENT: Partial<Record<CesarePage, string>> = {
  screenplay: "screenplay",
  soggetto: "soggetto",
  synopsis: "synopsis",
  outline: "outline",
  treatment: "treatment",
  breakdown: "breakdown",
  budget: "budget",
  schedule: "schedule",
  locations: "locations",
  "shooting-plan": "shooting-plan",
};

export function AppShell(props: AppShellProps) {
  return (
    <SaveStateProvider>
      <ActiveSceneProvider>
        <CesareNotificationProvider>
          <AppShellInner {...props} />
        </CesareNotificationProvider>
      </ActiveSceneProvider>
    </SaveStateProvider>
  );
}

function AppShellInner({
  user,
  projectName = "",
  sectionName = "",
  saveState: saveStateProp,
  saveSecondsAgo: saveSecondsAgoProp,
  cesareNoteCount = 0,
  sections,
  sectionGroups,
  projects,
  currentProjectId,
  onProjectSelect,
  userMenuItems,
  projectId,
  cesarePage,
  children,
}: AppShellProps) {
  const ctxSave = useSaveStateValue();
  const saveState = ctxSave.state ?? saveStateProp;
  const saveSecondsAgo = ctxSave.secondsAgo ?? saveSecondsAgoProp;
  const activeScene = useActiveScene();
  const activeRequirementId = useActiveRequirementId();
  const activeDocument = useActiveDocument();
  const activeShootingDay = useActiveShootingDay();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [cesareOpen, setCesareOpen] = useState(false);
  const [isNotifDrawerOpen, setNotifDrawerOpen] = useState(false);
  // unseenCount is computed from notifications below (after the context hook)
  // and is referenced in the TopBar JSX further down.
  const [cesareRequirementId, setCesareRequirementId] = useState<string | null>(
    null,
  );
  const {
    notifications,
    startNotification,
    completeNotification,
    failNotification,
    dismissNotification,
    markAllSeen,
    hasUnseen,
  } = useCesareNotifications();
  const unseenCount = notifications.filter(
    (n) => !n.seen && (n.status === "completed" || n.status === "failed"),
  ).length;
  const isCesareThinking = notifications.some(
    (n) => n.status === "in-progress",
  );

  // Broadcast the "Cesare is thinking" signal as a document body attribute so
  // the FloatingDock pill (in `packages/ui`, no access to app context) can
  // light up its CSS glow without prop-drilling through every caller.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isCesareThinking) {
      document.body.setAttribute("data-cesare-thinking", "true");
    } else {
      document.body.removeAttribute("data-cesare-thinking");
    }
  }, [isCesareThinking]);
  const {
    permission: pushPermission,
    requestPermission,
    fire: firePush,
  } = useWebPush();
  // The id of the notification currently in-progress for the active page —
  // bridges the gap between askCesare invocation and the response handler.
  const pendingNotificationId = useRef<string | null>(null);
  // Latest completed notification — used to pulse entities after the sheet
  // is opened from any of the three channels.
  const pendingPulseEntities = useRef<CesareNotification | null>(null);

  // Wrap askCesare so we can fire start/complete notifications around it.
  // Only agentic pages produce persistent notifications — chat-only pages
  // (screenplay, shooting-plan) skip this layer entirely.
  const wrappedAskCesare = useCallback<AskCesareFn>(
    async (params) => {
      const page = params.data.pageContext.page as CesarePage;
      const pid = params.data.projectId;
      const agentic = isAgenticPage(page);

      if (agentic) {
        const id = startNotification({
          actionLabel: ACTION_LABEL_BY_PAGE[page],
          page,
          projectId: pid,
        });
        pendingNotificationId.current = id;
      }

      const result = await askCesare(params);

      if (agentic && pendingNotificationId.current) {
        const id = pendingNotificationId.current;
        if (result.isOk) {
          const reply = result.value;
          // Only fire the "completed" notification when Cesare actually
          // executed a tool — text-only replies are normal conversation,
          // not a side effect worth surfacing as a persistent pill.
          const toolsRan = parseToolsExecuted(reply);
          if (toolsRan > 0) {
            const resultLabel = deriveResultLabel(page, reply);
            completeNotification(id, { resultLabel });

            // Web push when the tab is not visible.
            firePush({
              title: "Cesare",
              body: resultLabel,
              onClick: () => {
                setCesareOpen(true);
                markAllSeen();
              },
            });
          } else {
            // Silent dismiss — nothing happened on the backend.
            dismissNotification(id);
          }
        } else {
          failNotification(id, "Cesare ha avuto un problema");
        }
        pendingNotificationId.current = null;
      }

      return result;
    },
    [
      startNotification,
      completeNotification,
      failNotification,
      firePush,
      markAllSeen,
    ],
  );

  const handleCesareAssistantResponse = useCallback(
    (reply: string) => {
      if (cesarePage === "locations" && projectId) {
        void queryClient.invalidateQueries({
          queryKey: ["locations", projectId],
        });
        // Show a toast when Cesare adds candidates or performs a scouting action
        const lc = reply.toLowerCase();
        if (
          lc.includes("aggiunto") ||
          lc.includes("candidato") ||
          lc.includes("trovato")
        ) {
          showToast({
            message: "✦ Cesare ha aggiornato le location",
            variant: "success",
          });
        }
        return;
      }

      // Document pages — Cesare may have applied an edit via tools. Invalidate
      // the active document query so the editor refetches the new content, and
      // surface a toast when the reply hints at a successful tool call.
      const isDocPage =
        cesarePage === "soggetto" ||
        cesarePage === "synopsis" ||
        cesarePage === "outline" ||
        cesarePage === "treatment";
      if (isDocPage && projectId) {
        // propose_* tools may produce drafts on ANY narrative document, not just
        // the one currently open. Invalidate every doc type's content + the
        // draft list so the banner appears on whichever page the user navigates
        // to (e.g. user is on soggetto, asks "genera logline" → logline draft
        // banner must render the next time they open the logline editor).
        const docTypes = [
          "logline",
          "soggetto",
          "synopsis",
          "outline",
          "treatment",
        ] as const;
        for (const t of docTypes) {
          void queryClient.invalidateQueries({
            queryKey: ["documents", projectId, t],
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["document-drafts"] });
      }
      if (isDocPage && projectId && activeDocument) {
        void queryClient.invalidateQueries({
          queryKey: ["document-versions", activeDocument.id],
        });
        const lc = reply.toLowerCase();
        if (
          lc.includes("aggiornato") ||
          lc.includes("espanso") ||
          lc.includes("compresso") ||
          lc.includes("riscritto") ||
          lc.includes("modificato") ||
          lc.includes("sostituito")
        ) {
          const labels: Record<string, string> = {
            soggetto: "il soggetto",
            synopsis: "la sinossi",
            outline: "la scaletta",
            treatment: "il trattamento",
          };
          showToast({
            message: `✦ Cesare ha aggiornato ${labels[cesarePage] ?? "il documento"}`,
            variant: "success",
          });
        }
        if (
          lc.includes("draft") ||
          lc.includes("bozza") ||
          lc.includes("generato") ||
          lc.includes("ho proposto")
        ) {
          const labels: Record<string, string> = {
            soggetto: "soggetto",
            synopsis: "sinossi",
            outline: "scaletta",
            treatment: "trattamento",
            logline: "logline",
          };
          showToast({
            message: `✦ Cesare ha proposto una bozza di ${labels[cesarePage] ?? "documento"}`,
            variant: "success",
          });
        }
      }

      // Budget page — Cesare acts as a Line Producer via budget tools.
      if (cesarePage === "budget" && projectId) {
        void queryClient.invalidateQueries({ queryKey: ["budget", projectId] });
        const lc = reply.toLowerCase();
        if (
          lc.includes("aggiornato") ||
          lc.includes("aggiunto") ||
          lc.includes("ridistribuito") ||
          lc.includes("modificato") ||
          lc.includes("spostato")
        ) {
          showToast({
            message: "✦ Cesare ha aggiornato il budget",
            variant: "success",
          });
        }
      }

      // Shooting plan page — Cesare acts as a Director of Photography via
      // shot-plan tools. Invalidate both the per-scene shot-plan view and the
      // top-level scene-with-plan summary so the parallel plans editor and the
      // scene list both refresh.
      if (cesarePage === "shooting-plan" && projectId) {
        void queryClient.invalidateQueries({
          queryKey: ["shooting-plan", "scenes", projectId],
        });
        void queryClient.invalidateQueries({ queryKey: ["shot-plan"] });
        const lc = reply.toLowerCase();
        if (
          lc.includes("creato") ||
          lc.includes("aggiunto") ||
          lc.includes("salvato") ||
          lc.includes("aggiornato") ||
          lc.includes("rimosso") ||
          lc.includes("attivato")
        ) {
          showToast({
            message: "✦ Cesare ha aggiornato il piano inquadrature",
            variant: "success",
          });
        }
      }
    },
    [cesarePage, projectId, queryClient, showToast, activeDocument],
  );

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;

    const onScroll = () => setIsScrolled(main.scrollTop > 0);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openCesare = useCallback(
    (opts?: OpenCesareOptions) => {
      setCesareRequirementId(opts?.requirementId ?? null);
      setCesareOpen(true);
      markAllSeen();
    },
    [markAllSeen],
  );

  const handleActivateNotification = useCallback(
    (notification: CesareNotification) => {
      pendingPulseEntities.current = notification;
      markAllSeen();

      // 1. Always navigate to the page where the action happened. If the
      //    user is somewhere else (or on a different project) the click
      //    must put them in front of the thing the notification is about.
      const pageSegment = PAGE_TO_ROUTE_SEGMENT[notification.page];
      if (notification.projectId && pageSegment) {
        void router.navigate({
          to: `/projects/${notification.projectId}/${pageSegment}`,
        });
      }

      // 2. Open Cesare panel after the route mounts so the user sees the
      //    related context. The sheet hosts the pulse animation for
      //    affected entities (handled below).
      setCesareOpen(true);

      // 3. Pulse the affected entities after the page settles (route
      //    transition + sheet mount ~ 250ms). Skip when no entities — a
      //    chat-only reply has nothing to highlight.
      if (
        notification.affectedEntities &&
        notification.affectedEntities.length > 0
      ) {
        window.setTimeout(() => {
          pulseAffectedEntities(notification.affectedEntities!);
        }, 250);
      }
    },
    [markAllSeen, router],
  );

  const handleRequestPush = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleBrandClick = () => {
    void router.navigate({ to: "/dashboard" });
  };

  const handleNavigate = (href: string) => {
    void router.navigate({ to: href });
  };

  const handleProjectSelect = (id: string) => {
    if (onProjectSelect) {
      onProjectSelect(id);
      return;
    }
    void router.navigate({ to: "/projects/$id", params: { id } });
  };

  const handleAllProjects = () => {
    void router.navigate({ to: "/dashboard" });
  };

  const paletteItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: "nav:dashboard",
        label: "Vai alla Dashboard",
        group: "Navigazione",
        icon: "compass",
        keywords: ["home", "progetti", "start"],
        onSelect: () => void router.navigate({ to: "/dashboard" }),
      },
    ],
    [router],
  );

  return (
    <VersionsDrawerProvider>
      <CesareProvider openCesare={openCesare}>
        <div className={styles.shell}>
          <SkipLink targetId="main-content" />
          <TopBar
            projectName={projectName}
            sectionName={sectionName}
            saveState={saveState}
            saveSecondsAgo={saveSecondsAgo}
            cesareNoteCount={cesareNoteCount}
            cesareHasUnseen={hasUnseen}
            userInitials={deriveInitials(user.name)}
            presenceUsers={[]}
            isScrolled={isScrolled}
            sections={sections}
            sectionGroups={sectionGroups}
            projects={projects}
            currentProjectId={currentProjectId}
            onProjectSelect={handleProjectSelect}
            onAllProjects={handleAllProjects}
            onNavigate={handleNavigate}
            onBrandClick={handleBrandClick}
            onProjectClick={handleBrandClick}
            onSectionClick={undefined}
            onSearch={openPalette}
            onBell={undefined}
            onAskCesare={undefined}
            onAvatarClick={() => setNotifDrawerOpen(true)}
            userMenuItems={userMenuItems}
            notificationCount={unseenCount}
          />
          <main id="main-content" className={styles.main}>
            {children}
          </main>
          <VersionsDrawer />
          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={closePalette}
            items={paletteItems}
          />
          {projectId && (
            <CesareSheet
              projectId={projectId}
              page={cesarePage ?? "screenplay"}
              sceneId={activeScene?.sceneId ?? null}
              sceneNumber={activeScene?.sceneNumber ?? null}
              requirementId={cesareRequirementId ?? activeRequirementId}
              documentId={activeDocument?.id ?? null}
              shootingDayId={activeShootingDay?.dayId ?? null}
              shootingDayNumber={activeShootingDay?.dayNumber ?? null}
              isOpen={cesareOpen}
              onClose={() => setCesareOpen(false)}
              onOpenFullPage={() => {
                setCesareOpen(false);
                // TODO: navigate to full Cesare page (future)
              }}
              askCesare={wrappedAskCesare}
              onAssistantResponse={handleCesareAssistantResponse}
            />
          )}
          <NotificationCenterDrawer
            isOpen={isNotifDrawerOpen}
            onClose={() => setNotifDrawerOpen(false)}
            onActivate={handleActivateNotification}
          />
          {/* The legacy floating pill stack is gone: the dock pill's pulsing
              glow now signals in-progress work, the avatar badge counts
              unseen results, and the drawer above is the cronologia. */}
        </div>
      </CesareProvider>
    </VersionsDrawerProvider>
  );
}
