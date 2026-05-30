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
  RailHamburger,
  useRailOverlay,
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
  RailAccountActions,
  CesareSessionItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import {
  CesareSheet,
  parseToolsExecuted,
  CesareChatStoreProvider,
} from "~/features/predictions";
import type { CesarePage, AskCesareFn } from "~/features/predictions";
import { askCesare } from "~/features/predictions/cesare.server";
import { switchToVersion } from "~/features/documents";
import type { AppUser } from "~/server/context";
import { SaveStateProvider, useSaveStateValue } from "../save-state-context";
import { TopBarSlotsProvider, useTopBarSlots } from "../top-bar-slots-context";
import { CesareProvider, type OpenCesareOptions } from "../cesare-context";
import {
  CesareSessionFocusProvider,
  useCesareSessionFocus,
} from "../cesare-session-focus-context";
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
import {
  NotificationCenterDrawerHeader,
  NotificationCenterDrawerContent,
} from "./NotificationCenterDrawer";
import {
  SplitDrawerProvider,
  useSplitDrawer,
  useBellOpener,
} from "../split-drawer-context";
import { ensurePageTraceRegistry } from "../page-trace-registry";
import { isCesarePeek } from "../cesare-peek";
import { parseVersionsPeek, parseVersionsCompare } from "../versions-peek";
import type { VersionsCompare } from "../versions-peek";
import { CesarePeekLane } from "./CesarePeekLane";
import { VersionsSplitLane } from "./VersionsSplitLane";
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
   *  hides the Sessioni section; when provided the section is always
   *  visible regardless of Cesare drawer state (Spec 44 F1). */
  cesareSessions?: ReadonlyArray<CesareSessionItem>;
  onCesareSessionSelect?: (sessionId: string) => void;
  onCesareSessionNew?: () => void;
  /** Raw `?peek` search param (Spec 46). `null` when absent. AppShell
   *  validates it (same-project guard, fail closed) before acting. */
  peek?: string | null;
  /** Open the Cesare split column (sets `?peek=cesare`). */
  onOpenCesarePeek?: () => void;
  /** Clear `?peek` (× / ESC / browser-back). */
  onClosePeek?: () => void;
  /** Spec 47-A5 — opens the full Cesare sessions landing
   *  (`/projects/:id/sessions`). Wires the rail's dedicated "Cesare" entry. */
  onCesareSessionsOpen?: () => void;
  /** Raw `?versions` search param (Spec 49). `null` when absent. AppShell
   *  validates it (UUID shape, fail closed) before mounting the lane. */
  versionsParam?: string | null;
  /** Raw `?vstate` companion — `"full"` promotes the lane to a full route. */
  versionsStateParam?: string | null;
  /** Raw `?vcur` companion — the "vs current" baseline version id. */
  versionsCurrentParam?: string | null;
  /** Raw `?compare` companion — the `<a>,<b>` 2-version compare pair (W3). */
  versionsCompareParam?: string | null;
  /** Patch `?compare` (null drops it — back to "vs current"). Replace, no
   *  history entry, so the compare toggle doesn't pollute browser history. */
  onVersionsCompareChange?: (next: VersionsCompare | null) => void;
  /** Clear `?versions` (× / ESC / browser-back). */
  onCloseVersions?: () => void;
  /** `↗` expand the Versions lane to the full-screen route. */
  onExpandVersions?: () => void;
  /** `↙` step the full-screen Versions route back to the split. */
  onStepBackVersions?: () => void;
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
      <TopBarSlotsProvider>
        <ActiveSceneProvider>
          <CesareNotificationProvider>
            <SplitDrawerProvider>
              <CesareSessionFocusProvider>
                {/* Spec 47b FIX 2 — the shared chat store wraps both the
                    floating sheet and the full-page session route so they
                    render the SAME threads (single chat container). */}
                <CesareChatStoreProvider>
                  <AppShellInner {...props} />
                </CesareChatStoreProvider>
              </CesareSessionFocusProvider>
            </SplitDrawerProvider>
          </CesareNotificationProvider>
        </ActiveSceneProvider>
      </TopBarSlotsProvider>
    </SaveStateProvider>
  );
}

function AppShellInner({
  user,
  projectName = "",
  sectionName = "",
  activeSegment = "",
  projects,
  projectId,
  cesarePage,
  cesareSessions,
  onCesareSessionSelect,
  onCesareSessionNew,
  peek = null,
  onOpenCesarePeek,
  onClosePeek,
  onCesareSessionsOpen,
  versionsParam = null,
  versionsStateParam = null,
  versionsCurrentParam = null,
  versionsCompareParam = null,
  onVersionsCompareChange,
  onCloseVersions,
  onExpandVersions,
  onStepBackVersions,
  children,
}: AppShellProps) {
  // Save-state is published by the page editors via `useSaveStateValue` and
  // consumed by the per-page SavePill (the slim TopBar no longer hosts it).
  // Keep the call so the provider stays mounted and other consumers continue
  // to read the live state.
  useSaveStateValue();
  // Per-page TopBar slots — currently only the Sceneggiatura element legend.
  const topBarSlots = useTopBarSlots();
  const activeScene = useActiveScene();
  const activeRequirementId = useActiveRequirementId();
  const activeDocument = useActiveDocument();
  const activeShootingDay = useActiveShootingDay();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [cesareOpen, setCesareOpen] = useState(false);
  const [shellState, setShellState] = useState<ShellState>("full");
  const [cesareState, setCesareState] = useState<CesareState>("closed");
  const [cesareRequirementId, setCesareRequirementId] = useState<string | null>(
    null,
  );
  const splitDrawer = useSplitDrawer();
  const openBellDrawer = useBellOpener();
  const { focusedSessionId, setFocusedSessionId } = useCesareSessionFocus();
  const [splitDrawerWidth, setSplitDrawerWidth] = useState<number>(480);
  // Notion-style rail overlay: when shell is `collapsed` the rail is hidden
  // by default and a top-left hamburger toggles it as a sliding overlay.
  // No hover-reveal sentinel — outside-click / ESC / hamburger again close
  // it. The hook is a no-op outside `collapsed`.
  const railOverlay = useRailOverlay({ shellState });
  const lockRailOpen = useCallback(() => {
    railOverlay.close();
    setShellState("full");
  }, [railOverlay]);
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

  // Cesare split column (Spec 46 ?peek=, Spec 47 A4). The raw `?peek` param is
  // validated against the current project (fail closed). When it resolves to
  // the Cesare token we collapse the page: `body[data-cesare-split]` switches
  // the shell grid to add the peek lane column and the main lane reflows. The
  // floating Cesare sheet is unmounted while the lane is open so the chat never
  // duplicates.
  const isCesareSplitActive = isCesarePeek(peek, projectId ?? null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isCesareSplitActive) {
      document.body.setAttribute("data-cesare-split", "open");
    } else {
      document.body.removeAttribute("data-cesare-split");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-cesare-split");
      }
    };
  }, [isCesareSplitActive]);

  // Versions SplitDrawer (Spec 49). The raw `?versions` param is validated to a
  // UUID (fail closed); a malformed / foreign id renders the host alone. When
  // valid AND in the split state, `body[data-versions-split]` grows the third
  // grid track so the page COMPRESSES beside the lane (same grid mechanism as
  // the Cesare split). In `full` the lane escalates to its own overlay, so no
  // grid track is reserved.
  const versionsPeekResult = parseVersionsPeek(
    versionsParam,
    versionsStateParam,
    versionsCurrentParam,
  );
  const versionsPeek = versionsPeekResult.isOk()
    ? versionsPeekResult.value
    : null;
  // The `?compare=` pair (Spec 49 W3). Validated to a distinct UUID pair (fail
  // closed — a malformed pair falls back to "vs current"); the same-document
  // guard is applied inside VersionsSplitDrawer against the loaded list.
  const versionsCompareResult = parseVersionsCompare(versionsCompareParam);
  const versionsCompare = versionsCompareResult.isOk()
    ? versionsCompareResult.value
    : null;
  const isVersionsSplitActive =
    versionsPeek !== null && versionsPeek.state === "split";
  const [versionsLaneWidth, setVersionsLaneWidth] = useState<number>(480);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isVersionsSplitActive) {
      document.body.setAttribute("data-versions-split", "open");
    } else {
      document.body.removeAttribute("data-versions-split");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-versions-split");
      }
    };
  }, [isVersionsSplitActive]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.setProperty(
      "--versions-split-size",
      `${versionsLaneWidth}px`,
    );
  }, [versionsLaneWidth]);

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
        return;
      }
      // Notion-style sidebar toggle: Cmd/Ctrl + \\ — cycles full ↔ collapsed.
      // Leaves focus alone (user exits focus via ⌃⌥F).
      if (isMod && e.key === "\\") {
        e.preventDefault();
        setShellState((prev) => {
          if (prev === "focus") return prev;
          return prev === "full" ? "collapsed" : "full";
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Cesare live-doc "↩ Annulla" (Spec 44): when Cesare applies generated
  // content live to a document, the inline trace offers an undo that reverts
  // the document's active version to the one current before the apply. The chat
  // surface emits a DOM event so it stays decoupled from the documents feature;
  // AppShell owns the server call + query invalidation so the open editor
  // refreshes immediately.
  useEffect(() => {
    const onUndo = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { previousVersionId?: string }
        | undefined;
      const previousVersionId = detail?.previousVersionId;
      if (!previousVersionId) return;
      void (async () => {
        const result = await switchToVersion({
          data: { versionId: previousVersionId },
        });
        if (!result.isOk) {
          showToast({
            message: "Impossibile annullare la modifica.",
            variant: "error",
          });
          return;
        }
        if (projectId) {
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
          void queryClient.invalidateQueries({
            queryKey: ["document-versions"],
          });
        }
        showToast({
          message: "✦ Modifica annullata — documento ripristinato.",
          variant: "success",
        });
      })();
    };
    window.addEventListener("ohw:cesare:undo-doc-apply", onUndo);
    return () =>
      window.removeEventListener("ohw:cesare:undo-doc-apply", onUndo);
  }, [projectId, queryClient, showToast]);

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
        // Cesare now applies generation + edits LIVE to the document (Spec 44),
        // so any of these action verbs means the open editor has changed.
        if (
          lc.includes("aggiornato") ||
          lc.includes("espanso") ||
          lc.includes("compresso") ||
          lc.includes("riscritto") ||
          lc.includes("modificato") ||
          lc.includes("sostituito") ||
          lc.includes("generato") ||
          lc.includes("applicat")
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

  // Promote the floating chat into the split column. The split lane is the
  // authoritative surface for `?peek=cesare`, so we close the floating sheet
  // (it unmounts) before opening the peek — the chat is never duplicated, and
  // the BottomDock returns when the lane closes.
  const handleOpenAsSplit = useCallback(() => {
    setCesareState("closed");
    setCesareOpen(false);
    onOpenCesarePeek?.();
  }, [onOpenCesarePeek]);

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

  // ── Rail account row (bell / avatar / gear) ──────────────────
  // Spec 47b FIX 1: the account actions live ONLY in the rail footer. The
  // BottomDock and the Cesare header no longer render them.
  const railAccount = useMemo<RailAccountActions>(
    () => ({
      onBell: openBellDrawer,
      onAvatar: handleSettings,
      onGear: handleSettings,
      hasUnreadNotifications: hasUnseen,
      avatarLabel: deriveInitials(user.name),
    }),
    [openBellDrawer, handleSettings, hasUnseen, user.name],
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

  // Shared Cesare chat props. Rendered as EITHER the floating sheet (default)
  // OR the split-lane sheet (when `?peek=cesare`) — never both, so the chat is
  // a single container (no duplication). The split lane's close clears `?peek`;
  // the floating sheet's close just toggles the drawer off.
  const renderCesareSheet = useCallback(
    (surface: "floating" | "split") => {
      if (!projectId) return null;
      const isSplit = surface === "split";
      return (
        <CesareSheet
          projectId={projectId}
          page={cesarePage ?? "screenplay"}
          sceneId={activeScene?.sceneId ?? null}
          sceneNumber={activeScene?.sceneNumber ?? null}
          requirementId={cesareRequirementId ?? activeRequirementId}
          documentId={activeDocument?.id ?? null}
          shootingDayId={activeShootingDay?.dayId ?? null}
          shootingDayNumber={activeShootingDay?.dayNumber ?? null}
          isOpen={isSplit ? true : cesareOpen}
          surface={surface}
          onOpenAsSplit={isSplit ? undefined : handleOpenAsSplit}
          onClose={() => {
            if (isSplit) {
              onClosePeek?.();
            } else {
              setCesareOpen(false);
            }
          }}
          onOpenFullPage={() => {
            // Drawer manages full-page state itself; AppShell mirrors via
            // onCesareStateChange below.
          }}
          onCesareStateChange={(next) => {
            // Mirror the drawer's state into AppShell's body[data-cesare]
            // driver. The drawer's `expanded-split` collapses to `expanded`
            // for persistence. `peek` and `full` are transient. The split
            // surface stays `expanded` internally, so this is a no-op there.
            if (isSplit) return;
            const normalised: CesareState =
              next === "expanded-split" ? "expanded" : next;
            setCesareState(normalised);
            setCesareOpen(next !== "closed");
          }}
          askCesare={wrappedAskCesare}
          onAssistantResponse={handleCesareAssistantResponse}
          focusedSessionId={focusedSessionId}
          onActiveSessionChange={setFocusedSessionId}
        />
      );
    },
    [
      projectId,
      cesarePage,
      activeScene,
      cesareRequirementId,
      activeRequirementId,
      activeDocument,
      activeShootingDay,
      cesareOpen,
      handleOpenAsSplit,
      onClosePeek,
      wrappedAskCesare,
      handleCesareAssistantResponse,
      focusedSessionId,
      setFocusedSessionId,
    ],
  );

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
              onSessionsOpen={onCesareSessionsOpen}
              account={railAccount}
              tools={railTools}
              onNavigate={handleNavigate}
              onCollapse={
                shellState === "full"
                  ? () => setShellState("collapsed")
                  : undefined
              }
              overlay={
                shellState === "collapsed"
                  ? {
                      isOpen: railOverlay.isOpen,
                      onDismiss: railOverlay.close,
                      onLockOpen: lockRailOpen,
                      onHoverEnter: railOverlay.cancelScheduledClose,
                      onHoverLeave: railOverlay.scheduleClose,
                    }
                  : undefined
              }
            />
          </div>

          <main id="main-content" className={styles.main}>
            <TopBar
              start={
                <RailHamburger
                  onPress={railOverlay.toggle}
                  onHoverStart={railOverlay.open}
                  onHoverEnd={railOverlay.scheduleClose}
                  isOverlayOpen={railOverlay.isOpen}
                />
              }
              sectionName={sectionName}
              center={topBarSlots.center ?? undefined}
              actions={topBarSlots.actions ?? undefined}
              onSearch={openPalette}
              elementLegend={topBarSlots.elementLegend ?? undefined}
            />
            {children}
          </main>

          {/* Cesare split column (Spec 46 ?peek=, Spec 47 A4). A REAL third
              grid column — the main lane reflows narrower beside it (the page
              collapses). Hosts the single split CesareSheet; closing it clears
              `?peek`. */}
          {isCesareSplitActive && (
            <CesarePeekLane onClose={() => onClosePeek?.()}>
              {renderCesareSheet("split")}
            </CesarePeekLane>
          )}

          {/* Versions split column (Spec 49 W1 + W2). A REAL third grid column
              for the split state — the main lane reflows narrower beside it. In
              `full` the lane renders its own overlay (the `↗` expanded route),
              so no grid track is reserved. The single source of truth is the
              `?versions` URL param; the lane's controls dispatch URL navs. */}
          {versionsPeek !== null && (
            <VersionsSplitLane
              peek={versionsPeek}
              compare={versionsCompare}
              onCompareChange={(next) => onVersionsCompareChange?.(next)}
              width={versionsLaneWidth}
              onWidthChange={setVersionsLaneWidth}
              onExpand={() => onExpandVersions?.()}
              onStepBack={() => onStepBackVersions?.()}
              onClose={() => onCloseVersions?.()}
            />
          )}

          {/* Collapse affordance now lives inside the LeftRail brand row
              (hover-revealed `«`). ⌘\ still drives the full↔collapsed cycle
              from the keydown handler above. */}

          {/* Spec 47d — the "Mostra modifiche" diff is no longer a shell-level
              floating overlay; it is painted INSIDE each touched document's
              prose by a per-document <CesareLiveDiff/> (mounted in the document
              bodies). The shell only relays the broadcast. */}

          <BottomDock onCesareToggle={toggleCesare} />

          <VersionsDrawer />
          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={closePalette}
            items={paletteItems}
          />
          {/* Floating Cesare sheet — the default surface. Unmounted while the
              split lane is open so the chat never duplicates. The helper
              carries the session-focus props (Spec 47-A5). */}
          {!isCesareSplitActive && renderCesareSheet("floating")}
          <SplitDrawerHost
            splitDrawer={splitDrawer}
            splitDrawerWidth={splitDrawerWidth}
            setSplitDrawerWidth={setSplitDrawerWidth}
            onNotificationActivate={(notification) => {
              handleActivateNotification(notification);
              splitDrawer.close();
            }}
          />
        </div>
      </CesareProvider>
    </VersionsDrawerProvider>
  );
}

// ─── SplitDrawerHost ─────────────────────────────────────────────────────
// Owns the rendering decision for the shared SplitDrawer: branches on
// `payload.kind` to render either the Cesare trace flow or the bell
// notification centre. Kept here (rather than inlined) so each branch can
// declare its own header / footer / body without bloating AppShellInner.

interface SplitDrawerHostProps {
  splitDrawer: ReturnType<typeof useSplitDrawer>;
  splitDrawerWidth: number;
  setSplitDrawerWidth: (next: number) => void;
  onNotificationActivate: (notification: CesareNotification) => void;
}

function SplitDrawerHost({
  splitDrawer,
  splitDrawerWidth,
  setSplitDrawerWidth,
  onNotificationActivate,
}: SplitDrawerHostProps) {
  if (!splitDrawer.payload) return null;

  const payload = splitDrawer.payload;

  const onCycle = () => {
    if (splitDrawer.state === "open") {
      splitDrawer.setState("full");
    } else if (splitDrawer.state === "full") {
      splitDrawer.setState("open");
    }
  };
  const onStepBack = () => {
    if (splitDrawer.state === "full") {
      splitDrawer.setState("open");
    } else if (splitDrawer.state === "open") {
      splitDrawer.close();
    }
  };

  if (payload.kind === "notifications") {
    return (
      <SplitDrawer
        state={splitDrawer.state}
        onStateChange={splitDrawer.setState}
        onCycle={onCycle}
        onStepBack={onStepBack}
        onClose={splitDrawer.close}
        header={<NotificationCenterDrawerHeader />}
        size={{ width: splitDrawerWidth }}
        onSizeChange={({ width }) => setSplitDrawerWidth(width)}
        ariaLabel="Centro notifiche"
        testId="notification-center-drawer"
      >
        <NotificationCenterDrawerContent onActivate={onNotificationActivate} />
      </SplitDrawer>
    );
  }

  // payload.kind === "trace"
  return (
    <SplitDrawer
      state={splitDrawer.state}
      onStateChange={splitDrawer.setState}
      onCycle={onCycle}
      onStepBack={onStepBack}
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
          {payload.title ?? payload.pageRef.title ?? "Anteprima"}
        </h2>
      }
      footer={
        <>
          <button
            type="button"
            onClick={payload.onAcceptAll}
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
            onClick={payload.onRejectAll}
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
            {payload.traceMarkers.length} modifich
            {payload.traceMarkers.length === 1 ? "a" : "e"} in sospeso
          </span>
        </>
      }
      size={{ width: splitDrawerWidth }}
      onSizeChange={({ width }) => setSplitDrawerWidth(width)}
    >
      <TargetPagePreview
        pageRef={payload.pageRef}
        traceMarkers={payload.traceMarkers}
        onAccept={payload.onAccept}
        onReject={payload.onReject}
        onAcceptAll={payload.onAcceptAll}
        onRejectAll={payload.onRejectAll}
      />
    </SplitDrawer>
  );
}
