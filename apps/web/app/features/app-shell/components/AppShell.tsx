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
import {
  TopBar,
  SkipLink,
  CommandPalette,
  LeftRail,
  BottomDock,
  SplitDrawer,
  TargetPagePreview,
  useToast,
} from "@oh-writers/ui";
import type {
  SaveState,
  TopBarSection,
  TopBarSectionGroup,
  CommandPaletteItem,
  ProjectSwitcherItem,
  DropdownMenuItem,
  RailToolItem,
  CesareSessionItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import { CesareSheet, parseToolsExecuted } from "~/features/predictions";
import type { CesarePage, AskCesareFn } from "~/features/predictions";
import { askCesare } from "~/features/predictions/cesare.server";
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
import { buildRailNav } from "../nav";
import { NotificationCenterDrawer } from "./NotificationCenterDrawer";
import {
  SplitDrawerProvider,
  useSplitDrawer,
} from "../split-drawer-context";
import { ensurePageTraceRegistry } from "../page-trace-registry";
import styles from "./AppShell.module.css";

ensurePageTraceRegistry();

// ─── Shell state model ────────────────────────────────────────
// Three shell modes drive the body[data-shell] flag (read by CSS in the
// LeftRail, BottomDock and AppShell modules). Persisted in localStorage so
// the user's preferred density survives page reloads.
type ShellState = "full" | "collapsed" | "focus";
// Four Cesare states map onto the body[data-cesare] flag. WP-B owns the
// actual sub-window; AppShell just toggles the flag and persists the user's
// choice between "closed" and "expanded" — never starts the user in peek
// or full because those are transient states the user opted into.
type CesareState = "closed" | "expanded" | "peek" | "full";

const SHELL_STORAGE_KEY = "ohw.shell.state";
const CESARE_STORAGE_KEY = "ohw.cesare.state";

function readPersistedShell(): ShellState {
  if (typeof window === "undefined") return "full";
  const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
  return raw === "collapsed" || raw === "focus" || raw === "full"
    ? raw
    : "full";
}
function readPersistedCesare(): CesareState {
  if (typeof window === "undefined") return "closed";
  const raw = window.localStorage.getItem(CESARE_STORAGE_KEY);
  // Restore only stable states. Peek/full are transient.
  return raw === "expanded" ? "expanded" : "closed";
}

interface AppShellProps {
  user: AppUser;
  projectName?: string;
  sectionName?: string;
  /** Active route segment under /projects/$id (e.g. "breakdown"). Drives
   *  the rail's active highlight and the body[data-view] flag. */
  activeSegment?: string;
  saveState?: SaveState;
  saveSecondsAgo?: number;
  cesareNoteCount?: number;
  /** @deprecated Section nav now lives in the rail; kept for compat with
   *  legacy callers that still pass it. */
  sections?: ReadonlyArray<TopBarSection>;
  /** @deprecated Section nav now lives in the rail. */
  sectionGroups?: ReadonlyArray<TopBarSectionGroup>;
  /** @deprecated Project switching now lives in the rail header. */
  projects?: ReadonlyArray<ProjectSwitcherItem>;
  currentProjectId?: string;
  onProjectSelect?: (id: string) => void;
  userMenuItems?: DropdownMenuItem[];
  projectId?: string;
  cesarePage?: CesarePage;
  /** Optional Cesare sessions list for the rail. When omitted the rail
   *  hides the Sessioni section even if Cesare is expanded. */
  cesareSessions?: ReadonlyArray<CesareSessionItem>;
  onCesareSessionSelect?: (sessionId: string) => void;
  onCesareSessionNew?: () => void;
  children: ReactNode;
}

const deriveInitials = (name: string): string =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

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
          <SplitDrawerProvider>
            <AppShellInner {...props} />
          </SplitDrawerProvider>
        </CesareNotificationProvider>
      </ActiveSceneProvider>
    </SaveStateProvider>
  );
}

function AppShellInner({
  user,
  projectName = "",
  sectionName = "",
  activeSegment = "",
  projects,
  userMenuItems,
  projectId,
  cesarePage,
  cesareSessions,
  onCesareSessionSelect,
  onCesareSessionNew,
  children,
}: AppShellProps) {
  // Save-state is published by the page editors via `useSaveStateValue` and
  // consumed by the per-page SavePill (the slim TopBar no longer hosts it).
  // Keep the call so the provider stays mounted and other consumers continue
  // to read the live state.
  useSaveStateValue();
  const activeScene = useActiveScene();
  const activeRequirementId = useActiveRequirementId();
  const activeDocument = useActiveDocument();
  const activeShootingDay = useActiveShootingDay();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [cesareOpen, setCesareOpen] = useState(false);
  const [isNotifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [shellState, setShellState] = useState<ShellState>("full");
  const [cesareState, setCesareState] = useState<CesareState>("closed");
  const [cesareRequirementId, setCesareRequirementId] = useState<string | null>(
    null,
  );
  const splitDrawer = useSplitDrawer();
  const [splitDrawerWidth, setSplitDrawerWidth] = useState<number>(480);
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

  // ── Hydrate persisted UI state on mount ──────────────────────
  useEffect(() => {
    setShellState(readPersistedShell());
    const cesarePersist = readPersistedCesare();
    setCesareState(cesarePersist);
    setCesareOpen(cesarePersist === "expanded");
  }, []);

  // Broadcast UI state to <body> so the rail/dock/cesare CSS modules can
  // react via :global([data-*]) selectors without prop-drilling.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-shell", shellState);
    if (shellState !== "focus") {
      // Don't persist focus — it's a transient "single-shot" mode the user
      // opts into. Survive only "full" and "collapsed".
      window.localStorage.setItem(SHELL_STORAGE_KEY, shellState);
    } else {
      // Persist the previous non-focus choice so leaving focus restores it.
      // Read what's in storage and keep it.
    }
  }, [shellState]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-cesare", cesareState);
    // Persist only stable on/off states (no peek/full).
    if (cesareState === "closed" || cesareState === "expanded") {
      window.localStorage.setItem(CESARE_STORAGE_KEY, cesareState);
    }
  }, [cesareState]);

  // Broadcast SplitDrawer state and live width on <body> so the Cesare drawer
  // (and any other consumer) can react via CSS without prop-drilling.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (splitDrawer.state === "closed") {
      document.body.removeAttribute("data-split-drawer");
    } else {
      document.body.setAttribute("data-split-drawer", splitDrawer.state);
    }
  }, [splitDrawer.state]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.setProperty("--split-width", `${splitDrawerWidth}px`);
  }, [splitDrawerWidth]);

  // When the SplitDrawer becomes `full`, Cesare retreats to peek so the
  // user keeps a single command surface visible. When the SplitDrawer is
  // open alongside Cesare full-page, we leave Cesare in full and let the
  // CSS rule narrow its width via --split-width.
  useEffect(() => {
    if (splitDrawer.state === "full" && cesareState === "full") {
      setCesareState("peek");
    }
  }, [splitDrawer.state, cesareState]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (activeSegment) {
      document.body.setAttribute("data-view", activeSegment);
    } else {
      document.body.removeAttribute("data-view");
    }
  }, [activeSegment]);

  // Existing "Cesare is thinking" signal — drives the dock spark halo.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isCesareThinking) {
      document.body.setAttribute("data-cesare-thinking", "true");
    } else {
      document.body.removeAttribute("data-cesare-thinking");
    }
  }, [isCesareThinking]);

  // Reconcile cesareOpen <-> cesareState so legacy code paths that flip
  // `cesareOpen` (CesareSheet onClose, openCesare context) stay in sync.
  useEffect(() => {
    if (cesareOpen && cesareState === "closed") {
      setCesareState("expanded");
    } else if (!cesareOpen && cesareState === "expanded") {
      setCesareState("closed");
    }
  }, [cesareOpen, cesareState]);

  // Auto-clear the unread badge while the user is actively reading.
  useEffect(() => {
    if (!cesareOpen) return;
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    if (unseenCount === 0) return;
    markAllSeen();
  }, [cesareOpen, unseenCount, markAllSeen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible" && cesareOpen) {
        markAllSeen();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [cesareOpen, markAllSeen]);

  // Focus mode keyboard shortcut: Control + Option + F (Mac) /
  // Ctrl + Alt + F. Cycles between the previous mode and focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      // Command palette
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // Focus toggle: needs Ctrl + Alt (no Meta) + F. We intentionally don't
      // use Meta so it doesn't fight with browser shortcuts on Mac.
      if (e.ctrlKey && e.altKey && !e.metaKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShellState((prev) => (prev === "focus" ? "full" : "focus"));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // useWebPush exposes `permission` + `requestPermission` for callers that
  // want to gate UI on the push state; AppShell only needs to fire the
  // notification when the tab is hidden, so we ignore the rest.
  const { fire: firePush } = useWebPush();
  const pendingNotificationId = useRef<string | null>(null);
  const pendingPulseEntities = useRef<CesareNotification | null>(null);

  const wrappedAskCesare = useCallback<AskCesareFn>(
    async (params) => {
      const page = params.data.pageContext.page as CesarePage;
      const pid = params.data.projectId;
      const agentic = isAgenticPage(page);

      markAllSeen();

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
          const toolsRan = parseToolsExecuted(reply);
          if (toolsRan > 0) {
            const resultLabel = deriveResultLabel(page, reply);
            completeNotification(id, { resultLabel });
            firePush({
              title: "Cesare",
              body: resultLabel,
              onClick: () => {
                setCesareOpen(true);
                markAllSeen();
              },
            });
          } else {
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
      dismissNotification,
    ],
  );

  const handleCesareAssistantResponse = useCallback(
    (reply: string) => {
      if (cesarePage === "locations" && projectId) {
        void queryClient.invalidateQueries({
          queryKey: ["locations", projectId],
        });
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

      const isDocPage =
        cesarePage === "soggetto" ||
        cesarePage === "synopsis" ||
        cesarePage === "outline" ||
        cesarePage === "treatment";
      if (isDocPage && projectId) {
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

      if (cesarePage === "budget" && projectId) {
        void queryClient.invalidateQueries({ queryKey: ["budget", projectId] });
        void queryClient.invalidateQueries({
          queryKey: ["budget-caps", projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["budget-overview", projectId],
        });
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

      if (cesarePage === "screenplay") {
        void queryClient.invalidateQueries({
          queryKey: ["screenplay-proposals"],
        });
        void queryClient.invalidateQueries({ queryKey: ["versions"] });
      }
    },
    [cesarePage, projectId, queryClient, showToast, activeDocument],
  );

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const openCesare = useCallback(
    (opts?: OpenCesareOptions) => {
      setCesareRequirementId(opts?.requirementId ?? null);
      setCesareState("expanded");
      setCesareOpen(true);
      markAllSeen();
    },
    [markAllSeen],
  );

  const toggleCesare = useCallback(() => {
    if (cesareState === "closed") {
      setCesareState("expanded");
      setCesareOpen(true);
      markAllSeen();
    } else {
      setCesareState("closed");
      setCesareOpen(false);
    }
  }, [cesareState, markAllSeen]);

  const handleActivateNotification = useCallback(
    (notification: CesareNotification) => {
      pendingPulseEntities.current = notification;
      markAllSeen();

      const pageSegment = PAGE_TO_ROUTE_SEGMENT[notification.page];
      if (notification.projectId && pageSegment) {
        void router.navigate({
          to: `/projects/${notification.projectId}/${pageSegment}`,
        });
      }

      setCesareState("expanded");
      setCesareOpen(true);

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

  const handleBrandClick = useCallback(() => {
    void router.navigate({ to: "/dashboard" });
  }, [router]);

  const handleNavigate = useCallback(
    (href: string) => {
      void router.navigate({ to: href });
    },
    [router],
  );

  const handleProjectHeaderClick = useCallback(() => {
    if (projectId) {
      void router.navigate({
        to: "/projects/$id",
        params: { id: projectId },
      });
    }
  }, [projectId, router]);

  const handleSettings = useCallback(() => {
    window.location.href = "/settings";
  }, []);

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

  // ── Rail tools (search + new + switch + more) ────────────────
  const railTools = useMemo<RailToolItem[]>(
    () => [
      {
        id: "search",
        label: "Cerca",
        icon: "search",
        onPress: openPalette,
      },
      {
        id: "new",
        label: "Nuovo",
        icon: "plus",
        onPress: () => router.navigate({ to: "/projects/new" }),
      },
      {
        id: "switch",
        label: "Cambia progetto",
        icon: "arrows-lr",
        onPress: handleBrandClick,
      },
      {
        id: "more",
        label: "Altro",
        icon: "help",
        onPress: openPalette,
      },
    ],
    [openPalette, router, handleBrandClick],
  );

  // ── Rail sections (Sviluppo / Produzione / Recenti) ──────────
  const railSections = useMemo(() => {
    if (!projectId) {
      // Outside a project context — rail still renders with empty sections
      // so the chrome is consistent. Recents come from the project list.
      return [];
    }
    const nav = buildRailNav({ projectId, currentSegment: activeSegment });
    return [nav.sviluppo, nav.produzione];
  }, [projectId, activeSegment]);

  const recentsSection = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    const items = projects.slice(0, 3).map((p) => ({
      id: p.id,
      label: p.title,
      icon: "◉",
      href: `/projects/${p.id}`,
      isActive: p.id === projectId,
    }));
    return { label: "Recenti", items };
  }, [projects, projectId]);

  const fullSections = useMemo(
    () => (recentsSection ? [...railSections, recentsSection] : railSections),
    [railSections, recentsSection],
  );

  const focusToggleLabel =
    shellState === "focus" ? "Esci da Focus (⌃⌥F)" : "Focus mode (⌃⌥F)";
  const focusToggleGlyph =
    shellState === "collapsed" ? "»" : shellState === "focus" ? "»" : "«";

  return (
    <VersionsDrawerProvider>
      <CesareProvider openCesare={openCesare}>
        <div className={styles.shell}>
          <SkipLink targetId="main-content" />
          <div className={styles.rail}>
            <LeftRail
              brand={{ label: "Oh Writers", onPress: handleBrandClick }}
              project={
                projectName
                  ? {
                      title: projectName,
                      onPress: handleProjectHeaderClick,
                    }
                  : undefined
              }
              sections={fullSections}
              sessions={cesareSessions}
              onSessionSelect={onCesareSessionSelect}
              onSessionNew={onCesareSessionNew}
              tools={railTools}
              onNavigate={handleNavigate}
            />
          </div>

          <main id="main-content" className={styles.main}>
            <TopBar sectionName={sectionName} onSearch={openPalette} />
            {children}
          </main>

          {/* Focus toggle — sits at the rail boundary; ⌃⌥F also fires it. */}
          <button
            type="button"
            className={styles.focusToggle}
            aria-label={focusToggleLabel}
            title={focusToggleLabel}
            onClick={() =>
              setShellState((prev) =>
                prev === "focus"
                  ? "full"
                  : prev === "collapsed"
                    ? "full"
                    : "collapsed",
              )
            }
            data-testid="shell-focus-toggle"
          >
            {focusToggleGlyph}
          </button>

          <BottomDock
            user={{ initials: deriveInitials(user.name) }}
            hasUnseen={hasUnseen}
            onBell={() => setNotifDrawerOpen(true)}
            onSettings={handleSettings}
            onCesareToggle={toggleCesare}
            userMenuItems={userMenuItems}
          />

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
          {splitDrawer.payload && (
            <SplitDrawer
              state={splitDrawer.state}
              onStateChange={splitDrawer.setState}
              onCycle={() => {
                if (splitDrawer.state === "open") {
                  splitDrawer.setState("full");
                } else if (splitDrawer.state === "full") {
                  splitDrawer.setState("open");
                }
              }}
              onStepBack={() => {
                if (splitDrawer.state === "full") {
                  splitDrawer.setState("open");
                } else if (splitDrawer.state === "open") {
                  splitDrawer.close();
                }
              }}
              onClose={splitDrawer.close}
              header={
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--ds-font-display)",
                    fontSize: 14,
                    color: "var(--ds-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {splitDrawer.payload.title ??
                    splitDrawer.payload.pageRef.title ??
                    "Anteprima"}
                </h2>
              }
              footer={
                <>
                  <button
                    type="button"
                    onClick={splitDrawer.payload.onAcceptAll}
                    style={{
                      border: "1px solid var(--ds-diff-add-fg)",
                      background: "transparent",
                      color: "var(--ds-agent)",
                      padding: "5px 12px",
                      borderRadius: "var(--ds-radius-sm)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Accetta tutto
                  </button>
                  <button
                    type="button"
                    onClick={splitDrawer.payload.onRejectAll}
                    style={{
                      border: "1px solid var(--ds-line)",
                      background: "transparent",
                      color: "var(--ds-text-2)",
                      padding: "5px 12px",
                      borderRadius: "var(--ds-radius-sm)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Rifiuta tutto
                  </button>
                  <span
                    style={{
                      marginInlineStart: "auto",
                      color: "var(--ds-text-faint)",
                      fontSize: 11.5,
                    }}
                  >
                    {splitDrawer.payload.traceMarkers.length} modifich
                    {splitDrawer.payload.traceMarkers.length === 1 ? "a" : "e"}{" "}
                    in sospeso
                  </span>
                </>
              }
              size={{ width: splitDrawerWidth }}
              onSizeChange={({ width }) => setSplitDrawerWidth(width)}
            >
              <TargetPagePreview
                pageRef={splitDrawer.payload.pageRef}
                traceMarkers={splitDrawer.payload.traceMarkers}
                onAccept={splitDrawer.payload.onAccept}
                onReject={splitDrawer.payload.onReject}
                onAcceptAll={splitDrawer.payload.onAcceptAll}
                onRejectAll={splitDrawer.payload.onRejectAll}
              />
            </SplitDrawer>
          )}
        </div>
      </CesareProvider>
    </VersionsDrawerProvider>
  );
}
