import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  TopBar,
  TopBarAccount,
  SkipLink,
  CommandPalette,
  LeftRail,
  RailHamburger,
  useRailOverlay,
  BottomDock,
  SplitDrawer,
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
  TopBarAccountActions,
  CesareSessionItem,
} from "@oh-writers/ui";
import { VersionsDrawerProvider, VersionsDrawer } from "~/features/versions";
import {
  CesareSheet,
  parseToolsExecuted,
  appliedEntityDomains,
  parseLiveDiffMarkers,
  parseDocAppliedMarker,
  extractChangeSummary,
  CesareChatStoreProvider,
} from "~/features/predictions";
import type { CesarePage, AskCesareFn } from "~/features/predictions";
import { askCesare } from "~/features/predictions/cesare.server";
import { narrativeProgressQueryKey } from "~/features/documents";
import type { AppUser } from "~/server/context";
import { SaveStateProvider, useSaveStateValue } from "../save-state-context";
import { TopBarSlotsProvider, useTopBarSlots } from "../top-bar-slots-context";
import { CesareProvider, type OpenCesareOptions } from "../cesare-context";
import {
  CesareSessionFocusProvider,
  useCesareSessionFocus,
} from "../cesare-session-focus-context";
import {
  ShellFocusRequestProvider,
  useShellFocusRequest,
} from "../shell-focus-request-context";
import {
  CesareSurfaceProvider,
  useCesareSurface,
} from "../cesare-surface-context";
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
  ACTION_LABEL_KEY_BY_PAGE,
  deriveResultLabel,
} from "../cesare-notification-labels";
import { useWebPush } from "../hooks/useWebPush";
import { pulseAffectedEntities } from "../cesare-pulse";
import { buildRailNav } from "../nav";
import { useTranslation } from "~/features/i18n";
import {
  NotificationCenterDrawerHeader,
  NotificationCenterDrawerContent,
} from "./NotificationCenterDrawer";
import {
  SplitDrawerProvider,
  useSplitDrawer,
  useBellOpener,
} from "../split-drawer-context";
import { SplitToggleProvider, useSplitToggle } from "../split-toggle-context";
import { publishLiveEdits } from "../cesare-live-edit-store";
import { isCesarePeek } from "../cesare-peek";
import { parseVersionsPeek } from "../versions-peek";
import { CesarePeekLane } from "./CesarePeekLane";
import { SplitDrawerPreviewBody } from "./SplitDrawerPreviewBody";
import { VersionsSplitLane } from "./VersionsSplitLane";
import styles from "./AppShell.module.css";

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

// Cesare success toasts auto-dismiss after the default 4s in production. Under
// MOCK_AI (E2E) we hold them far longer: a Cesare turn on a slow CI runner can
// take several seconds, so the toast could appear AND expire before the test's
// visibility assertion runs — the root cause of the agentic suite's toast
// flakiness. Extending the duration in test mode only (never in production)
// makes those assertions race-free without weakening them.
const CESARE_TOAST_DURATION_MS = import.meta.env.MOCK_AI ? 60_000 : undefined;

function readPersistedShell(): ShellState {
  if (typeof window === "undefined") return "full";
  const raw = window.localStorage.getItem(SHELL_STORAGE_KEY);
  return raw === "collapsed" || raw === "focus" || raw === "full"
    ? raw
    : "full";
}
// Spec 55 / BUGS N-05 — Cesare ALWAYS starts closed on first load. It must
// never auto-open: previously a persisted "expanded" reopened the floating chat
// on every reload, covering the document. We keep persisting the user's last
// state (for any future "reopen where I left off" affordance) but never act on
// it at mount — the user opens Cesare explicitly via the BottomDock pill.
function readPersistedCesare(): CesareState {
  return "closed";
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
  /** Commit an inline rename for a session (Spec 53). */
  onCesareSessionRename?: (sessionId: string, title: string) => void;
  /** Request deletion of a session (Spec 53) — opens the confirmation modal. */
  onCesareSessionDelete?: (sessionId: string) => void;
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
  /** Raw `?vcur` companion — the current (active) baseline version id. */
  versionsCurrentParam?: string | null;
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
              <SplitToggleProvider>
                <CesareSessionFocusProvider>
                  {/* Spec 47b FIX 2 — the shared chat store wraps both the
                    floating sheet and the full-page session route so they
                    render the SAME threads (single chat container). Spec 52 —
                    the focus-request provider lets the full-screen new-session
                    landing ask the shell to recede the rail + topstrip. */}
                  <ShellFocusRequestProvider>
                    <CesareSurfaceProvider>
                      <CesareChatStoreProvider>
                        <AppShellInner {...props} />
                      </CesareChatStoreProvider>
                    </CesareSurfaceProvider>
                  </ShellFocusRequestProvider>
                </CesareSessionFocusProvider>
              </SplitToggleProvider>
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
  onCesareSessionRename,
  onCesareSessionDelete,
  onCesareSessionNew,
  peek = null,
  onOpenCesarePeek,
  onClosePeek,
  onCesareSessionsOpen,
  versionsParam = null,
  versionsStateParam = null,
  versionsCurrentParam = null,
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
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [cesareOpen, setCesareOpen] = useState(false);
  const [shellState, setShellState] = useState<ShellState>("full");
  const [cesareState, setCesareState] = useState<CesareState>("closed");
  const [cesareRequirementId, setCesareRequirementId] = useState<string | null>(
    null,
  );
  // A prompt to auto-send when the floating chat opens (margin "start a session"
  // affordance). Carries a nonce so re-opening with the SAME text still fires.
  const [cesareSeedPrompt, setCesareSeedPrompt] = useState<{
    text: string;
    nonce: number;
  } | null>(null);
  const splitDrawer = useSplitDrawer();
  const openBellDrawer = useBellOpener();
  const { focusedSessionId, setFocusedSessionId } = useCesareSessionFocus();
  const { isFocusRequested } = useShellFocusRequest();
  // A central Cesare surface (full-screen session page / new-session landing) is
  // itself the chat, so the floating drawer + launcher pill must be suppressed
  // to avoid a duplicate chat container.
  const { isCesareSurfaceActive } = useCesareSurface();
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

  // Spec 52 — a routed surface (the full-screen new-session landing) can force
  // focus mode for its lifetime. The user's persisted density (`shellState`) is
  // never overwritten while the request is active; releasing it restores their
  // prior layout automatically because we broadcast `shellState` again.
  const effectiveShellState: ShellState = isFocusRequested
    ? "focus"
    : shellState;

  // Broadcast UI state to <body> so the rail/dock/cesare CSS modules can
  // react via :global([data-*]) selectors without prop-drilling.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-shell", effectiveShellState);
    if (shellState !== "focus") {
      // Don't persist focus — it's a transient "single-shot" mode the user
      // opts into. Survive only "full" and "collapsed". (The route-driven focus
      // request never touches `shellState`, so it is never persisted either.)
      window.localStorage.setItem(SHELL_STORAGE_KEY, shellState);
    }
  }, [effectiveShellState, shellState]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-cesare", cesareState);
    // Persist only stable on/off states (no peek/full).
    if (cesareState === "closed" || cesareState === "expanded") {
      window.localStorage.setItem(CESARE_STORAGE_KEY, cesareState);
    }
  }, [cesareState]);

  // A full-screen chat surface (the session conversation route) is a fixed-height
  // app layout: its thread scrolls internally and its composer stays docked at
  // the bottom. Flag the body so `.main` is capped to the viewport (not allowed
  // to grow with the thread) ONLY for that surface — editor routes still scroll
  // the page normally.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isCesareSurfaceActive) {
      document.body.setAttribute("data-cesare-surface", "active");
    } else {
      document.body.removeAttribute("data-cesare-surface");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-cesare-surface");
      }
    };
  }, [isCesareSurfaceActive]);

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

  // When the split lane opens, collapse the rail ONCE to give the lane room.
  // We only act on the false→true edge so the user can re-open the rail
  // manually (hamburger) and it stays open while the split is still active.
  const wasSplitActiveRef = useRef(false);
  useEffect(() => {
    if (isCesareSplitActive && !wasSplitActiveRef.current) {
      setShellState("collapsed");
    }
    wasSplitActiveRef.current = isCesareSplitActive;
  }, [isCesareSplitActive]);

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

  // Shell SplitDrawer (Cesare preview + notifications) is ALWAYS an in-flow
  // collapsing lane (CONTEXT.md / ADR-0002), never a fixed overlay. While it has
  // content open in the `open` state, grow the third grid track so the page
  // compresses beside it. `full` escalates to its own overlay route, so no track
  // is reserved then.
  const isPreviewSplitActive =
    splitDrawer.payload !== null && splitDrawer.state === "open";
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isPreviewSplitActive) {
      document.body.setAttribute("data-preview-split", "open");
    } else {
      document.body.removeAttribute("data-preview-split");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-preview-split");
      }
    };
  }, [isPreviewSplitActive]);

  // Destroy the shell SplitDrawer on any route change: its content is tied to the
  // page it was opened from (e.g. a Logline preview), so navigating away (e.g.
  // "Apri Soggetto") must close it — a stale preview beside a different page is
  // wrong (CONTEXT.md: one collapsing surface, tied to where it was opened).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const closeSplitDrawer = splitDrawer.close;
  const didMountSplitRef = useRef(false);
  useEffect(() => {
    if (!didMountSplitRef.current) {
      didMountSplitRef.current = true;
      return;
    }
    closeSplitDrawer();
  }, [pathname, closeSplitDrawer]);

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

  // Spec 47e removed the inline "↩ Annulla" affordance: every Cesare edit is
  // always applied and "Mostra / Nascondi modifiche" is a transient flash, not
  // a revert. True rollback now lives exclusively in the Versions SplitDrawer
  // (Spec 49) via `switchToVersion`, so the old `ohw:cesare:undo-doc-apply`
  // shell listener is gone.

  // useWebPush exposes `permission` + `requestPermission` for callers that
  // want to gate UI on the push state; AppShell only needs to fire the
  // notification when the tab is hidden, so we ignore the rest.
  const { fire: firePush } = useWebPush();
  const pendingPulseEntities = useRef<CesareNotification | null>(null);

  const wrappedAskCesare = useCallback<AskCesareFn>(
    async (params) => {
      // Notifications are now emitted in `handleCesareAssistantResponse`, which
      // runs on EVERY completed turn (streaming-primary or this fallback). This
      // wrapper only marks existing notifications seen on a new request so the
      // bell's unread dot clears when the user starts a turn.
      markAllSeen();
      return askCesare(params);
    },
    [markAllSeen],
  );

  const handleCesareAssistantResponse = useCallback(
    (reply: string) => {
      // Spec 50 — any assistant turn can change which narrative docs exist
      // (generations are cross-domain), so refresh the next-step suggestion
      // unconditionally before the per-page branches (some of which return early).
      if (projectId) {
        void queryClient.invalidateQueries({
          queryKey: narrativeProgressQueryKey(projectId),
        });
      }

      // F-A3 — the success TOAST, like the result card, must announce a change
      // ONLY when one actually happened. We read the real apply markers, never
      // the chat text: a failed/no-op tool whose reply merely SAYS "aggiornato"
      // must not pop a "✦ Cesare ha aggiornato …" toast.
      const applied = appliedEntityDomains(reply);

      // N-33 — drop a Notification Center entry on EVERY completed agentic turn.
      // The legacy start/complete pair lived only in `wrappedAskCesare` (the
      // non-streaming path); the streaming path — now primary — never fired it,
      // so completed runs went unnotified. Emit here, which runs on every
      // successful turn (streaming or fallback), when the turn actually applied a
      // change (tools ran).
      // Publish the live edit(s) so the entity-page banner can surface "Cesare ha
      // aggiornato il <Entity>" with the change + the pre-edit version for ↩ Annulla
      // (Spec 63). One entry per touched document; live-only (not persisted).
      const liveDiffMarkers = parseLiveDiffMarkers(reply);
      if (liveDiffMarkers.length > 0) {
        const previousVersionId =
          parseDocAppliedMarker(reply)?.previousVersionId ?? null;
        const summary = extractChangeSummary(reply);
        publishLiveEdits(
          liveDiffMarkers
            .filter((m) => m.documentType)
            .map((m) => ({
              documentType: m.documentType,
              label: m.label,
              segments: m.segments,
              summary,
              previousVersionId,
            })),
        );
      }

      if (cesarePage && projectId && parseToolsExecuted(reply) > 0) {
        const resultLabel = deriveResultLabel(cesarePage, reply, t);
        const nid = startNotification({
          actionLabel: t(ACTION_LABEL_KEY_BY_PAGE[cesarePage]),
          page: cesarePage,
          projectId,
        });
        completeNotification(nid, { resultLabel });
        firePush({
          title: "Cesare",
          body: resultLabel,
          onClick: () => {
            setCesareOpen(true);
            markAllSeen();
          },
        });
      }

      if (cesarePage === "locations" && projectId) {
        void queryClient.invalidateQueries({
          queryKey: ["locations", projectId],
        });
        if (applied.has("locations")) {
          showToast({
            message: t("shell.toast.locations"),
            variant: "success",
            durationMs: CESARE_TOAST_DURATION_MS,
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
        for (const docType of docTypes) {
          void queryClient.invalidateQueries({
            queryKey: ["documents", projectId, docType],
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["document-drafts"] });
      }
      if (isDocPage && projectId && activeDocument) {
        void queryClient.invalidateQueries({
          queryKey: ["document-versions", activeDocument.id],
        });
        // Cesare applies generation + edits LIVE to the document (Spec 44). The
        // toast names the entity the marker says was ACTUALLY edited — which may
        // differ from the open page (a logline edit from the soggetto page is
        // "la logline", not "il documento") — and pops only on a real apply.
        const docLabelKeys = {
          logline: "shell.toast.doc.logline",
          soggetto: "shell.toast.doc.soggetto",
          synopsis: "shell.toast.doc.synopsis",
          outline: "shell.toast.doc.outline",
          treatment: "shell.toast.doc.treatment",
        } as const;
        const appliedDoc = (
          Object.keys(docLabelKeys) as Array<keyof typeof docLabelKeys>
        ).find((d) => applied.has(d));
        if (appliedDoc) {
          showToast({
            message: `${t("shell.toast.docPrefix")} ${t(docLabelKeys[appliedDoc])}`,
            variant: "success",
            durationMs: CESARE_TOAST_DURATION_MS,
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
        if (applied.has("budget")) {
          showToast({
            message: t("shell.toast.budget"),
            variant: "success",
            durationMs: CESARE_TOAST_DURATION_MS,
          });
        }
      }

      if (cesarePage === "shooting-plan" && projectId) {
        void queryClient.invalidateQueries({
          queryKey: ["shooting-plan", "scenes", projectId],
        });
        void queryClient.invalidateQueries({ queryKey: ["shot-plan"] });
        if (applied.has("shooting-plan")) {
          showToast({
            message: t("shell.toast.shootingPlan"),
            variant: "success",
            durationMs: CESARE_TOAST_DURATION_MS,
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
    [
      cesarePage,
      projectId,
      queryClient,
      showToast,
      activeDocument,
      t,
      startNotification,
      completeNotification,
      firePush,
      markAllSeen,
      setCesareOpen,
    ],
  );

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const openCesare = useCallback(
    (opts?: OpenCesareOptions) => {
      setCesareRequirementId(opts?.requirementId ?? null);
      if (opts?.prompt) {
        setCesareSeedPrompt({ text: opts.prompt, nonce: Date.now() });
      }
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

  // N-22 — avatar and gear are DISTINCT destinations: avatar → user settings,
  // gear → project settings (falls back to user settings outside a project).
  const handleUserSettings = useCallback(() => {
    void router.navigate({ to: "/settings" });
  }, [router]);

  const handleProjectSettings = useCallback(() => {
    if (projectId) {
      void router.navigate({
        to: "/projects/$id/settings",
        params: { id: projectId },
      });
    } else {
      void router.navigate({ to: "/settings" });
    }
  }, [projectId, router]);

  // N-24 — the rail project header carries a chevron-down (the universal
  // "opens a menu" affordance), so it opens a project menu rather than a bare
  // link. Open project / project settings / switch project — each a clear
  // destination. Built only inside a project context (the header itself only
  // renders when `projectName` is set).
  const projectMenuItems = useMemo<DropdownMenuItem[]>(
    () => [
      {
        label: t("shell.projectMenu.open"),
        icon: "📄",
        onClick: handleProjectHeaderClick,
        testId: "project-menu-open",
      },
      {
        label: t("shell.projectMenu.settings"),
        icon: "⚙",
        onClick: handleProjectSettings,
        testId: "project-menu-settings",
      },
      {
        label: t("shell.projectMenu.switch"),
        icon: "⇄",
        onClick: handleBrandClick,
        testId: "project-menu-switch",
      },
    ],
    [t, handleProjectHeaderClick, handleProjectSettings, handleBrandClick],
  );

  const paletteItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      {
        id: "nav:dashboard",
        label: t("shell.palette.dashboard"),
        group: t("shell.palette.groupNav"),
        icon: "compass",
        keywords: ["home", "progetti", "start"],
        onSelect: () => void router.navigate({ to: "/dashboard" }),
      },
    ];

    // Section jumps are derived from the same nav source the rail renders,
    // so the palette can never drift from the rail's section list.
    if (projectId) {
      const nav = buildRailNav({ projectId, currentSegment: activeSegment, t });
      for (const section of [nav.sviluppo, nav.produzione]) {
        for (const entry of section.items) {
          items.push({
            id: `nav:${entry.id}`,
            label: `${t("shell.palette.goToPrefix")} ${entry.label}`,
            group: t("shell.palette.groupSections"),
            icon: "file-text",
            keywords: [entry.label.toLowerCase(), section.label.toLowerCase()],
            onSelect: () => void router.navigate({ to: entry.href }),
          });
        }
      }

      items.push(
        {
          id: "cesare:open",
          label: t("shell.palette.openCesare"),
          group: t("shell.palette.groupCesare"),
          icon: "comment",
          keywords: ["assistente", "chat", "ai"],
          onSelect: () => openCesare(),
        },
        {
          id: "cesare:new-session",
          label: t("shell.palette.newCesareSession"),
          group: t("shell.palette.groupCesare"),
          icon: "plus",
          keywords: ["sessione", "session", "nuova", "chat"],
          onSelect: () => onCesareSessionNew?.(),
        },
      );
    }

    return items;
  }, [router, projectId, activeSegment, openCesare, onCesareSessionNew, t]);

  // ── Rail tools (search + new + switch + more) ────────────────
  const railTools = useMemo<RailToolItem[]>(
    () => [
      {
        id: "search",
        label: t("shell.rail.search"),
        icon: "search",
        onPress: openPalette,
      },
      {
        id: "new",
        label: t("shell.rail.new"),
        icon: "plus",
        onPress: () => router.navigate({ to: "/projects/new" }),
      },
      {
        id: "switch",
        label: t("shell.rail.switchProject"),
        icon: "arrows-lr",
        onPress: handleBrandClick,
      },
      {
        id: "more",
        label: t("shell.rail.more"),
        icon: "help",
        onPress: openPalette,
      },
    ],
    [openPalette, router, handleBrandClick, t],
  );

  // ── TopBar account zone (bell / avatar / gear) ───────────────
  // Spec 55: the account actions live in the TopBar right zone (the single
  // home), superseding the LeftRail footer AccountRow (Spec 47b). Avatar →
  // user settings, gear → project settings (N-22, distinct destinations).
  // ⊟ SplitDrawer toggle (Claude-style):
  //   - open            → hide (keep history)
  //   - hidden w/history → re-open the last content
  //   - nothing yet but the active surface has a "latest edit" opener → open it
  // Disabled only when there is genuinely nothing to show.
  const { openLatest } = useSplitToggle();
  const isSplitOpen = splitDrawer.payload !== null;
  const handleToggleSplit = useCallback(() => {
    if (isSplitOpen) {
      splitDrawer.hide();
      return;
    }
    if (splitDrawer.hasContent) {
      splitDrawer.reopen();
      return;
    }
    openLatest?.();
  }, [isSplitOpen, splitDrawer, openLatest]);
  const canToggleSplit =
    isSplitOpen || splitDrawer.hasContent || openLatest !== null;

  const topBarAccount = useMemo<TopBarAccountActions>(
    () => ({
      onBell: openBellDrawer,
      onAvatar: handleUserSettings,
      onGear: handleProjectSettings,
      hasUnreadNotifications: hasUnseen,
      avatarLabel: deriveInitials(user.name),
      // The ⊟ split toggle belongs to the chat surface only (the session
      // conversation) — on an editor page the diff lives inline, so the toggle
      // is omitted there (no button rendered).
      ...(isCesareSurfaceActive
        ? {
            onToggleSplit: handleToggleSplit,
            splitOpen: isSplitOpen,
            canToggleSplit,
          }
        : {}),
    }),
    [
      openBellDrawer,
      handleUserSettings,
      handleProjectSettings,
      hasUnseen,
      user.name,
      isCesareSurfaceActive,
      handleToggleSplit,
      isSplitOpen,
      canToggleSplit,
    ],
  );

  // ── Rail sections (Sviluppo / Produzione / Recenti) ──────────
  const railSections = useMemo(() => {
    if (!projectId) {
      // Outside a project context — rail still renders with empty sections
      // so the chrome is consistent. Recents come from the project list.
      return [];
    }
    const nav = buildRailNav({ projectId, currentSegment: activeSegment, t });
    return [nav.sviluppo, nav.produzione];
  }, [projectId, activeSegment, t]);

  const recentsSection = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    const items = projects.slice(0, 3).map((p) => ({
      id: p.id,
      label: p.title,
      icon: "◉",
      href: `/projects/${p.id}`,
      isActive: p.id === projectId,
    }));
    return { label: t("shell.rail.recents"), items };
  }, [projects, projectId, t]);

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
          {...(!isSplit && cesareSeedPrompt
            ? { seedPrompt: cesareSeedPrompt }
            : {})}
          onOpenAsSplit={isSplit ? undefined : handleOpenAsSplit}
          onShrinkToFloat={
            isSplit
              ? () => {
                  onClosePeek?.();
                  setCesareOpen(true);
                  setCesareState("expanded");
                }
              : undefined
          }
          onClose={() => {
            if (isSplit) {
              onClosePeek?.();
            } else {
              setCesareOpen(false);
            }
          }}
          onOpenFullPage={(sessionId) => {
            // ↗ navigates to the full-screen session detail page from BOTH the
            // split lane and the floating drawer. Prefer the session id passed
            // by the sheet (it may have flushed before the focused-session
            // mirror), falling back to the mirror. Clear the peek lane and close
            // the floating drawer first so the chat is not duplicated.
            const targetSessionId = sessionId ?? focusedSessionId;
            if (projectId && targetSessionId) {
              if (isSplit) {
                onClosePeek?.();
              } else {
                setCesareOpen(false);
              }
              void router.navigate({
                to: "/projects/$id/sessions/$sessionId",
                params: { id: projectId, sessionId: targetSessionId },
              });
            }
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
      cesareSeedPrompt,
      handleOpenAsSplit,
      onClosePeek,
      wrappedAskCesare,
      handleCesareAssistantResponse,
      focusedSessionId,
      setFocusedSessionId,
      router,
    ],
  );

  return (
    <VersionsDrawerProvider>
      <CesareProvider openCesare={openCesare}>
        <div className={styles.shell}>
          <SkipLink targetId="main-content" label={t("shell.skipLink")} />
          <div className={styles.rail}>
            <LeftRail
              brand={{
                label: "Oh Writers",
                onPress: handleBrandClick,
                // N-21 — hide the redundant wordmark when no project is open;
                // the "O" mark stands alone (Notion-style minimal header).
                showLabel: Boolean(projectName),
              }}
              project={
                projectName
                  ? {
                      title: projectName,
                      onPress: handleProjectHeaderClick,
                      menuItems: projectMenuItems,
                    }
                  : undefined
              }
              sections={fullSections}
              sessions={cesareSessions}
              onSessionSelect={onCesareSessionSelect}
              onSessionRename={onCesareSessionRename}
              onSessionDelete={onCesareSessionDelete}
              onSessionNew={onCesareSessionNew}
              onSessionsOpen={onCesareSessionsOpen}
              tools={railTools}
              labels={{
                sessionsTitle: t("shell.rail.sessionsTitle"),
                sessionsOpen: t("shell.rail.sessionsOpen"),
                notifications: t("shell.rail.notifications"),
                notificationsUnread: t("shell.rail.notificationsUnread"),
                settings: t("shell.rail.settings"),
                projectFallback: t("shell.rail.projectFallback"),
                newSession: t("shell.rail.newSession"),
                nav: t("shell.rail.nav"),
                newSessionShort: t("shell.rail.newSessionShort"),
                profile: t("shell.rail.profile"),
                account: t("shell.rail.account"),
                tools: t("shell.rail.tools"),
              }}
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
                  openLabel={t("shell.rail.openSidebar")}
                />
              }
              sectionName={sectionName}
              center={topBarSlots.center ?? undefined}
              actions={topBarSlots.actions ?? undefined}
              onSearch={openPalette}
              elementLegend={topBarSlots.elementLegend ?? undefined}
              accountZone={
                <TopBarAccount
                  account={topBarAccount}
                  labels={{
                    notifications: t("shell.rail.notifications"),
                    notificationsUnread: t("shell.rail.notificationsUnread"),
                    profile: t("shell.rail.profile"),
                    settings: t("shell.rail.settings"),
                    account: t("shell.rail.account"),
                    toggleSplit: t("shell.topbar.toggleSplit"),
                  }}
                />
              }
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

          {!isCesareSplitActive && !isCesareSurfaceActive && (
            <BottomDock
              onCesareToggle={toggleCesare}
              openCesareLabel={t("shell.dock.openCesare")}
              actionsLabel={t("shell.dock.actions")}
            />
          )}

          <VersionsDrawer />
          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={closePalette}
            items={paletteItems}
            emptyLabel={t("shell.palette.empty")}
            resultsLabel={t("shell.palette.results")}
          />
          {/* Floating Cesare sheet — the default surface. Unmounted while the
              split lane is open OR a central Cesare surface (full-screen session
              page) is active, so the chat never duplicates. The helper carries
              the session-focus props (Spec 47-A5). */}
          {!isCesareSplitActive &&
            !isCesareSurfaceActive &&
            renderCesareSheet("floating")}
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
  const { t } = useTranslation();
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

  // History nav (← →) — the SplitDrawer keeps a stack of contents; a replaced
  // content is never lost (CONTEXT.md). Shown in every drawer header.
  const historyNav = (
    <SplitDrawerHistoryNav
      canGoBack={splitDrawer.canGoBack}
      canGoForward={splitDrawer.canGoForward}
      onBack={splitDrawer.back}
      onForward={splitDrawer.forward}
      backLabel={t("shell.splitDrawer.historyBack")}
      forwardLabel={t("shell.splitDrawer.historyForward")}
    />
  );

  if (payload.kind === "notifications") {
    return (
      <SplitDrawer
        state={splitDrawer.state}
        onStateChange={splitDrawer.setState}
        onCycle={onCycle}
        onStepBack={onStepBack}
        onClose={splitDrawer.close}
        placement="lane"
        header={
          <div className={styles.splitHeaderRow}>
            {historyNav}
            <NotificationCenterDrawerHeader />
          </div>
        }
        size={{ width: splitDrawerWidth }}
        onSizeChange={({ width }) => setSplitDrawerWidth(width)}
        ariaLabel={t("shell.splitDrawer.notificationsAria")}
        expandLabel={t("shell.splitDrawer.expand")}
        closeLabel={t("shell.splitDrawer.close")}
        reduceLabel={t("shell.splitDrawer.reduce")}
        testId="notification-center-drawer"
      >
        <NotificationCenterDrawerContent onActivate={onNotificationActivate} />
      </SplitDrawer>
    );
  }

  // payload.kind === "preview" — READ-ONLY view of the modified page with the
  // change highlighted inline. No accept/reject (the edit is already applied;
  // ADR-0001), so no footer and no "pending" count.
  return (
    <SplitDrawer
      state={splitDrawer.state}
      onStateChange={splitDrawer.setState}
      onCycle={onCycle}
      onStepBack={onStepBack}
      onClose={splitDrawer.close}
      placement="lane"
      header={
        <div className={styles.splitHeaderRow}>
          {historyNav}
          <h2 className={styles.splitHeaderTitle}>
            {payload.title ??
              payload.pageRef.title ??
              t("shell.splitDrawer.previewFallback")}
          </h2>
        </div>
      }
      size={{ width: splitDrawerWidth }}
      onSizeChange={({ width }) => setSplitDrawerWidth(width)}
      expandLabel={t("shell.splitDrawer.expand")}
      closeLabel={t("shell.splitDrawer.close")}
    >
      <SplitDrawerPreviewBody
        title={payload.pageRef.title ?? payload.title ?? ""}
        liveDiffs={payload.liveDiffs}
        summary={payload.summary}
      />
    </SplitDrawer>
  );
}

// ─── SplitDrawer history nav (← →) ──────────────────────────────────────────
// The shell SplitDrawer keeps a navigation history of the contents shown in it
// (CONTEXT.md): opening a new content pushes it; ←/→ move through the stack so a
// replaced content is never lost. × (the drawer's own close) clears the history.

function SplitDrawerHistoryNav({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  backLabel,
  forwardLabel,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  backLabel: string;
  forwardLabel: string;
}) {
  // Hide entirely when there's nowhere to go (single-item history) so the header
  // stays clean — the controls only appear once a second content has been shown.
  if (!canGoBack && !canGoForward) return null;
  return (
    <div className={styles.splitHistoryNav} data-testid="split-drawer-history">
      <button
        type="button"
        className={styles.splitHistoryBtn}
        onClick={onBack}
        disabled={!canGoBack}
        aria-label={backLabel}
        title={backLabel}
        data-testid="split-drawer-back"
      >
        ←
      </button>
      <button
        type="button"
        className={styles.splitHistoryBtn}
        onClick={onForward}
        disabled={!canGoForward}
        aria-label={forwardLabel}
        title={forwardLabel}
        data-testid="split-drawer-forward"
      >
        →
      </button>
    </div>
  );
}
