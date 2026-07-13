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
import { useButton } from "react-aria";
import { match } from "ts-pattern";
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
import {
  CesareSheet,
  appliedEntityDomains,
  parseLiveDiffMarkers,
  parseDocAppliedMarker,
  extractChangeSummary,
  CesareChatStoreProvider,
} from "~/features/predictions";
import type { CesarePage, CesareTurnSettle } from "~/features/predictions";
import { askCesare } from "~/features/predictions/cesare.server";
import { narrativeProgressQueryKey } from "~/features/documents";
import type { AppUser } from "~/server/context";
import { SaveStateProvider, useSaveStateValue } from "../save-state-context";
import { TopBarSlotsProvider, useTopBarSlots } from "../top-bar-slots-context";
import {
  VersionsDetailProvider,
  useVersionsDetailOpen,
} from "../versions-detail-context";
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
  isAgenticPage,
} from "../cesare-notification-labels";
import { decideTurnSettle } from "../cesare-turn-notifications";
import { useWebPush } from "../hooks/useWebPush";
import { pulseAffectedEntities } from "../cesare-pulse";
import { buildRailNav } from "../nav";
import { useTranslation } from "~/features/i18n";
import { TopBarCredits } from "~/features/ai-providers";
import { useFeatures } from "~/features/feature-flags";
import { Features } from "@oh-writers/domain";
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
import { useUnifiedSplitNavigation } from "../use-unified-split-navigation";
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
  /** Toggle pin/unpin for a session (LeftRail cap + "Vedi tutte"). */
  onCesareSessionPin?: (sessionId: string, pinned: boolean) => void;
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
  /** Raw `?vkind` companion — `"screenplay"` versions a screenplay, else narrative. */
  versionsKindParam?: string | null;
  /** Clear `?versions` (× / ESC / browser-back). */
  onCloseVersions?: () => void;
  /** Set `?versions=<id>` (+ companions) — re-opening the Versions surface when
   *  the shared split history navigates back/forward to it (Spec 78 A6). */
  onOpenVersions?: (
    documentId: string,
    companions: Readonly<Record<string, string>>,
  ) => void;
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
        <VersionsDetailProvider>
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
        </VersionsDetailProvider>
      </TopBarSlotsProvider>
    </SaveStateProvider>
  );
}

function AppShellInner({
  user,
  projectName = "",
  sectionName = "",
  activeSegment = "",
  sectionGroups,
  projects,
  projectId,
  cesarePage,
  cesareSessions,
  onCesareSessionSelect,
  onCesareSessionRename,
  onCesareSessionDelete,
  onCesareSessionPin,
  onCesareSessionNew,
  peek = null,
  onOpenCesarePeek,
  onClosePeek,
  onCesareSessionsOpen,
  versionsParam = null,
  versionsStateParam = null,
  versionsCurrentParam = null,
  versionsKindParam = null,
  onCloseVersions,
  onOpenVersions,
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

  // Full-width TopBar strip (grid row 1). Its measured height feeds
  // `--ohw-topbar-h` on the shell so the sticky aux lanes can pin themselves
  // exactly below it whatever the strip's height is (legend row included).
  const shellRef = useRef<HTMLDivElement>(null);
  const topBarRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = topBarRowRef.current;
    const shell = shellRef.current;
    if (!row || !shell) return;
    const update = () =>
      shell.style.setProperty("--ohw-topbar-h", `${row.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
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

  // The Versions surface is master→detail: the LIST stays narrow (the host keeps
  // its space), but opening a version's DETAIL shows a whole document's formatted
  // preview, so the rail collapses for room (Spec 66). Only the detail collapses
  // — published by the lane. The persisted `shellState` is untouched; closing the
  // detail restores it.
  const versionsDetailOpen = useVersionsDetailOpen();

  // Spec 52 — a routed surface (the full-screen new-session landing) can force
  // focus mode for its lifetime. The user's persisted density (`shellState`) is
  // never overwritten while the request is active; releasing it restores their
  // prior layout automatically because we broadcast `shellState` again.
  const effectiveShellState: ShellState = isFocusRequested
    ? "focus"
    : versionsDetailOpen && shellState === "full"
      ? "collapsed"
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
  // Raw per-surface activations. Resolved into a MUTUALLY EXCLUSIVE set below
  // (BUG-N64): two routed surfaces sharing the single 3rd grid track squeeze the
  // main lane to nothing (white page). At most one auxiliary lane is ever live.
  // A Cesare PEEK and a central Cesare SURFACE (the full-screen session page /
  // new-session landing) both ARE the chat — they must never be live at once. A
  // session route still carrying a stale `?peek=cesare` would otherwise mount the
  // peek lane while the central surface owns the chat (two chats) AND feed the
  // URL ↔ split-history reconciler a peek it can never settle, looping the shell
  // (#49). The central surface wins; the peek yields — the lane is suppressed and
  // the reconciler collapses the shared host once, then converges (the URL
  // `?peek=cesare` lingers harmlessly until the user leaves the session route, at
  // which point the peek re-opens). `isCesarePeek` already fails closed without a
  // project id, so a project-less / mid-transition route never lights the peek.
  const isCesareSplitActiveRaw =
    isCesarePeek(peek, projectId ?? null) && !isCesareSurfaceActive;

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
    versionsKindParam,
  );
  const versionsPeek = versionsPeekResult.isOk()
    ? versionsPeekResult.value
    : null;
  // BUG-N64: only ONE auxiliary lane may own the single 3rd grid track. When the
  // user explicitly promotes Cesare to a split (`?peek=cesare`), Cesare WINS the
  // track and Versions yields — so Cesare renders as a real lane (with the
  // ↗/←/✕ controls), not a floating box layered over Versions. Versions is still
  // the highest-precedence surface against the preview/notifications lane.
  const isVersionsSplitActive =
    versionsPeek !== null &&
    versionsPeek.state === "split" &&
    !isCesareSplitActiveRaw;
  // The RAW Versions intent — a valid `?versions=` in the split state, BEFORE the
  // Cesare-yield. The unified-navigation hook mirrors this into the shared history
  // even when `?peek=cesare` is still in the URL (the version chip preserves the
  // peek param), so opening Versioni over Cesare PUSHES a history entry; the
  // history→URL reconciler then drops `?peek` so Versions wins the single track.
  const versionsRawSplit =
    versionsPeek !== null && versionsPeek.state === "split";
  // Master→detail width: the LIST is a narrow rail; opening a version's DETAIL
  // widens the lane to ~half the page (the read-only preview needs room). The
  // user's drag-resize is kept per-view in `versionsLaneWidth`; the effective
  // width below flips the BASE between narrow + half when there's no manual size.
  const NARROW_VERSIONS_WIDTH = 420;
  const halfPageWidth =
    typeof window === "undefined"
      ? 720
      : Math.round(Math.min(820, Math.max(560, window.innerWidth * 0.5)));
  const [versionsLaneWidth, setVersionsLaneWidth] = useState<number | null>(
    null,
  );
  const effectiveVersionsWidth =
    versionsLaneWidth ??
    (versionsDetailOpen ? halfPageWidth : NARROW_VERSIONS_WIDTH);

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

  // Shell SplitDrawer (Cesare preview + notifications) is ALWAYS an in-flow
  // collapsing lane (CONTEXT.md / ADR-0002), never a fixed overlay. While it has
  // content open in the `open` state, grow the third grid track so the page
  // compresses beside it. `full` escalates to its own overlay route, so no track
  // is reserved then.
  // Only the host-rendered kinds (preview / notifications) light the preview
  // grid track. `cesare-peek` / `versions` payloads are navigation records whose
  // bodies are painted by their own routed lanes (Spec 78 A6) — they must NOT
  // also reserve the preview track, or two tracks would fight for the slot.
  const isHostRenderedPayload =
    splitDrawer.payload !== null &&
    splitDrawer.payload.kind !== "cesare-peek" &&
    splitDrawer.payload.kind !== "versions";
  const isPreviewSplitActiveRaw =
    isHostRenderedPayload && splitDrawer.state === "open";

  // ── Single auxiliary-lane resolver (BUG-N64, fail-closed) ─────────────────
  // The shell grid has exactly ONE auxiliary (3rd) track. Two routed surfaces
  // claiming it at once (e.g. `?versions=…&peek=cesare`) render two lanes for a
  // single slot and squeeze the main lane to zero — a blank page with no error
  // boundary. Resolve to AT MOST ONE active lane with a deterministic
  // precedence: Versions (the most explicit, destructive-adjacent surface the
  // user routed to) > Cesare peek > the shell preview drawer. The losers are
  // suppressed entirely (no body attr, no lane render), so the host page always
  // keeps its track. The mutually-exclusive booleans below are the ONLY ones
  // used by the body-attr effects and the lane JSX. `isVersionsSplitActive`
  // (defined above) already yields to an explicit Cesare split, so this `&&` is a
  // belt-and-suspenders guarantee that the two never render at once.
  const isCesareSplitActive = isCesareSplitActiveRaw && !isVersionsSplitActive;
  const isPreviewSplitActive =
    isPreviewSplitActiveRaw && !isVersionsSplitActive && !isCesareSplitActive;

  // ── The single auxiliary split track (refound) ───────────────────────────
  // There is exactly ONE auxiliary (3rd) grid track shared by Cesare peek,
  // Versioni and Notifiche (Spec 78 A6). `data-split-aux` lights that track at a
  // CONSTANT `--split-aux-width` regardless of which surface owns it — so
  // switching surfaces never reflows the page (the whole point of the refound).
  // The per-surface attrs below (`data-cesare-split` / `data-versions-split` /
  // `data-preview-split`) still flag WHICH surface is live (the N64
  // single-lane invariant + the floating-drawer offset read them), but they no
  // longer drive the column width — only `data-split-aux` does.
  const isAnyAuxLaneActive =
    isCesareSplitActive || isVersionsSplitActive || isPreviewSplitActive;
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isAnyAuxLaneActive) {
      document.body.setAttribute("data-split-aux", "open");
    } else {
      document.body.removeAttribute("data-split-aux");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-split-aux");
      }
    };
  }, [isAnyAuxLaneActive]);

  // When a NON-Cesare auxiliary lane (Versioni / Notifiche / preview) claims the
  // track while the floating Cesare drawer was open, the drawer is suppressed in
  // render (#49). Reset its STATE too so `body[data-cesare]` doesn't stay
  // "expanded" (which would falsely hide the launcher dock and signal Cesare
  // open). The Cesare-PEEK lane manages its own state via `handleOpenAsSplit`, so
  // it is intentionally excluded here.
  const isNonCesareAuxLaneActive =
    isVersionsSplitActive || isPreviewSplitActive;
  useEffect(() => {
    if (isNonCesareAuxLaneActive && cesareOpen) {
      setCesareOpen(false);
      setCesareState("closed");
    }
  }, [isNonCesareAuxLaneActive, cesareOpen]);

  // ── Unified navigable split track (Spec 78 A6) ───────────────────────────
  // Mirror the routed Cesare-peek + Versions surfaces into the shell SplitDrawer
  // history so the ONE auxiliary track is navigable across Cesare ↔ Versioni ↔
  // Notifiche with a single ←/→. The hook keeps the URL and the shared history
  // in sync (idempotently); the lanes render the same `sharedHistoryNav` below.
  // `isVersionsSplitActive` carries the resolved (split, not full) Versions
  // surface so a full-screen Versions route is NOT mirrored into the track.
  // The reconciler's Effect 2 lists `actions` (its four callbacks) in its deps,
  // so a fresh `actions` object — or fresh wrapper closures — every render would
  // re-run the effect every render and amplify any residual URL ↔ history
  // disagreement into the #47 render storm. The parent callbacks
  // (`onOpenCesarePeek` …) are already reference-stable (they read pathname /
  // search through refs in `_app.tsx`); wrap them in stable `useCallback`s and a
  // memoised `actions` object so the effect runs only on a genuine surface change.
  const openCesarePeekAction = useCallback(
    () => onOpenCesarePeek?.(),
    [onOpenCesarePeek],
  );
  const closeCesarePeekAction = useCallback(
    () => onClosePeek?.(),
    [onClosePeek],
  );
  const openVersionsAction = useCallback(
    (documentId: string, companions: Readonly<Record<string, string>>) =>
      onOpenVersions?.(documentId, companions),
    [onOpenVersions],
  );
  const closeVersionsAction = useCallback(
    () => onCloseVersions?.(),
    [onCloseVersions],
  );
  const unifiedSplitActions = useMemo(
    () => ({
      openCesarePeek: openCesarePeekAction,
      closeCesarePeek: closeCesarePeekAction,
      openVersions: openVersionsAction,
      closeVersions: closeVersionsAction,
    }),
    [
      openCesarePeekAction,
      closeCesarePeekAction,
      openVersionsAction,
      closeVersionsAction,
    ],
  );
  useUnifiedSplitNavigation({
    splitDrawer,
    cesarePeek: { isActive: isCesareSplitActiveRaw },
    versions: {
      documentId: versionsRawSplit ? versionsPeek!.documentId : null,
      currentVersionId: versionsRawSplit
        ? versionsPeek!.currentVersionId
        : null,
      versionKind: versionsRawSplit
        ? versionsPeek!.kind === "screenplay"
          ? "screenplay"
          : "narrative"
        : null,
    },
    actions: unifiedSplitActions,
  });

  // Closing ANY routed lane (Cesare ×, Versions ×/ESC) clears ONLY its URL param.
  // The unified-navigation reconciler then sees a routed payload with no routed
  // param left and fires `close-host`, clearing the shared history so the WHOLE
  // navigable host collapses — one close path that keeps history + URL in sync
  // without the manual `splitDrawer.close()` racing effect-1's re-push (Spec 78
  // A6). Browser-back hits the same path (it drops the param too).
  const handleCloseCesarePeek = useCallback(() => {
    onClosePeek?.();
  }, [onClosePeek]);
  const handleCloseVersionsLane = useCallback(() => {
    onCloseVersions?.();
  }, [onCloseVersions]);

  // The shared ←/→ history control, rendered in WHICHEVER lane currently owns the
  // single auxiliary track (Cesare split header, Versions header, or the host
  // preview/notifications header). One stack, one control — so back from Versioni
  // returns to Cesare and forward re-navigates.
  const sharedHistoryNav = (
    <SplitDrawerHistoryNav
      canGoBack={splitDrawer.canGoBack}
      canGoForward={splitDrawer.canGoForward}
      onBack={splitDrawer.back}
      onForward={splitDrawer.forward}
      backLabel={t("shell.splitDrawer.historyBack")}
      forwardLabel={t("shell.splitDrawer.historyForward")}
    />
  );

  // When the Cesare split lane opens, collapse the rail ONCE to give it room.
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

  // BUG-066 — ONE bell notification per Cesare turn. The turn lifecycle owns
  // the emission: `onTurnStart` creates the in-progress row ("Cesare sta
  // lavorando…") and returns its id as the correlation token; `onTurnSettled`
  // updates the SAME row in place — completed ("Cesare ha aggiornato il
  // <doc>" + "Vai al <documento>" link), failed, or dismissed — never
  // appending a second row. The page/projectId are captured at start so a
  // mid-turn navigation can't mislabel the settle.
  const pendingTurnsRef = useRef(
    new Map<string, { page: CesarePage; projectId: string }>(),
  );

  const handleCesareTurnStart = useCallback((): string | null => {
    // A new request clears the bell's unread dot regardless of page.
    markAllSeen();
    if (!cesarePage || !projectId || !isAgenticPage(cesarePage)) return null;
    const id = startNotification({
      actionLabel: t(ACTION_LABEL_KEY_BY_PAGE[cesarePage]),
      page: cesarePage,
      projectId,
    });
    pendingTurnsRef.current.set(id, { page: cesarePage, projectId });
    return id;
  }, [cesarePage, projectId, markAllSeen, startNotification, t]);

  const handleCesareTurnSettled = useCallback(
    ({ token, outcome, reply }: CesareTurnSettle) => {
      if (!token) return;
      const pending = pendingTurnsRef.current.get(token);
      pendingTurnsRef.current.delete(token);
      if (!pending) return;

      const decision = decideTurnSettle(outcome, reply);
      match(decision)
        .with({ kind: "dismiss" }, () => dismissNotification(token))
        .with({ kind: "fail" }, () =>
          failNotification(token, t("shell.notification.failed")),
        )
        .with({ kind: "complete-applied" }, ({ target }) => {
          const resultLabel = t(target.updatedLabelKey);
          completeNotification(token, {
            resultLabel,
            target: { page: target.page, goToLabel: t(target.goToLabelKey) },
          });
          firePush({
            title: "Cesare",
            body: resultLabel,
            onClick: () => {
              setCesareOpen(true);
              markAllSeen();
            },
          });
        })
        .with({ kind: "complete-replied" }, () => {
          completeNotification(token, {
            resultLabel: deriveResultLabel(pending.page, reply ?? "", t),
          });
        })
        .exhaustive();
    },
    [
      completeNotification,
      dismissNotification,
      failNotification,
      firePush,
      markAllSeen,
      setCesareOpen,
      t,
    ],
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

      // Bell notifications are NOT emitted here: the turn lifecycle owns them
      // (`handleCesareTurnStart` / `handleCesareTurnSettled`, BUG-066) so the
      // start row collapses into the completed row instead of appending.
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
    [cesarePage, projectId, queryClient, showToast, activeDocument, t],
  );

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // BUG (N64 family) — the bell notifications open in the shell's preview
  // SplitDrawer, which shares the single auxiliary (3rd) grid track with the
  // Cesare peek and the Versions lane. With the unified navigable host (Spec 78
  // A6) opening the bell PUSHES the notifications payload onto the shared history
  // — it does NOT close Cesare. The history→URL reconciler then cedes the track
  // by dropping `?peek` (a host kind owns no routed param), so the notifications
  // are visible AND ← returns to the Cesare peek. The N64 invariant still holds:
  // only one auxiliary lane is live (the host body renders while the routed param
  // is cleared), so the two never coexist in the third track.
  const handleBell = useCallback(() => {
    openBellDrawer();
  }, [openBellDrawer]);

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
    // While an auxiliary lane (Versioni / Notifiche / preview) owns the single
    // 3rd track, the floating Cesare drawer is suppressed so it can never blanket
    // the lane's input (#49). The launcher must still REACH Cesare, so opening it
    // here promotes Cesare INTO the shared navigable host (Spec 78 A6): the open
    // lane becomes a back-step rather than being overlapped by a floating box.
    //
    // PUSH the `cesare-peek` record onto the shared history directly (don't just
    // set `?peek` via `onOpenCesarePeek`): with a HOST payload (notifications /
    // preview) still the active history entry, the URL→history reconciler would
    // see a host kind + a fresh routed param and fire `clear-both` — dropping
    // `?peek` and collapsing the WHOLE host (Bug 4b: Notifiche → Cesare closed
    // everything). Pushing the payload makes `cesare-peek` the active cursor
    // entry first; Effect 2 then projects `?peek=cesare`, and the previous host
    // surface survives as a ←back-step. The previous lane is never lost.
    if (cesareState === "closed" && isAnyAuxLaneActive) {
      setCesareState("closed");
      setCesareOpen(false);
      splitDrawer.promoteRoutedSurface({ kind: "cesare-peek" });
      markAllSeen();
      return;
    }
    if (cesareState === "closed") {
      setCesareState("expanded");
      setCesareOpen(true);
      markAllSeen();
    } else {
      setCesareState("closed");
      setCesareOpen(false);
    }
  }, [cesareState, isAnyAuxLaneActive, splitDrawer, markAllSeen]);

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

  // BUG-066 — "Vai al <documento>" on an applied-change row navigates to the
  // AFFECTED document's page (which may differ from the page the turn ran on:
  // a cross-domain edit links to the entity it actually wrote).
  const handleGoToNotificationTarget = useCallback(
    (notification: CesareNotification) => {
      markAllSeen();
      const targetPage = notification.target?.page ?? notification.page;
      const pageSegment = PAGE_TO_ROUTE_SEGMENT[targetPage];
      if (notification.projectId && pageSegment) {
        void router.navigate({
          to: `/projects/${notification.projectId}/${pageSegment}`,
        });
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

  // Gear dropdown (live request 2026-07-13) — the gear is a menu, not a bare
  // link: every project page, then project settings / account settings / AI.
  // Built only inside a project (outside one the gear is hidden entirely).
  const gearMenuItems = useMemo<DropdownMenuItem[] | undefined>(() => {
    if (!projectId || !sectionGroups) return undefined;
    const pageItems = sectionGroups.flatMap((group) =>
      group.items.map(
        (s): DropdownMenuItem => ({
          label: s.label,
          onClick: () => handleNavigate(s.href),
          disabled: s.isActive,
        }),
      ),
    );
    return [
      ...pageItems,
      {
        label: t("shell.projectMenu.settings"),
        icon: "⚙",
        onClick: handleProjectSettings,
        testId: "gear-menu-project-settings",
      },
      {
        label: t("shell.gearMenu.accountSettings"),
        icon: "⚙",
        onClick: handleUserSettings,
        testId: "gear-menu-account-settings",
      },
      {
        label: t("shell.gearMenu.aiCredits"),
        icon: "✦",
        onClick: () => handleNavigate("/settings/ai"),
        testId: "gear-menu-ai-credits",
      },
    ];
  }, [
    projectId,
    sectionGroups,
    handleNavigate,
    handleProjectSettings,
    handleUserSettings,
    t,
  ]);

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
      // N-49 — "new project" lives here with the other project-level actions;
      // it used to float alone as a "+" toolbar in the rail.
      {
        label: t("shell.projectMenu.new"),
        icon: "+",
        onClick: () => void router.navigate({ to: "/projects/new" }),
        testId: "project-menu-new",
      },
    ],
    [
      t,
      handleProjectHeaderClick,
      handleProjectSettings,
      handleBrandClick,
      router,
    ],
  );

  // Gates the rail nav (and everything derived from it below — palette
  // section jumps) through DEV_ONLY/market rules.
  const enabledFeatures = useFeatures();
  // Spec 84 §5 — the master AI switch. OFF hides the Cesare drawer, its
  // BottomDock/dock affordance, and the LeftRail "Sessioni Cesare" section
  // entirely (not disabled — absent), leaving only the AI-off banner
  // (rendered per-page, not here) as the sole trace of AI.
  const isAiEnabled = enabledFeatures.has(Features.AI_ENABLED);

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
      const nav = buildRailNav({
        projectId,
        currentSegment: activeSegment,
        t,
        enabledFeatures,
      });
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

      // Spec 84 §5 — the command palette is an AI surface too: with AI off,
      // ⌘K must not offer Cesare entries (found live by the Chrome gate; the
      // dock/rail gating alone left this reachable).
      if (isAiEnabled) {
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
    }

    return items;
  }, [
    router,
    projectId,
    activeSegment,
    openCesare,
    onCesareSessionNew,
    t,
    enabledFeatures,
    isAiEnabled,
  ]);

  // ── Rail tools — empty since N-49: the last tool ("+", new project) moved
  // into the project-header dropdown with the other project-level actions.
  // Search lives in the TopBar (⌘K palette), project-switch is the brand
  // dropdown. An empty array hides the toolbar row entirely.
  const railTools = useMemo<RailToolItem[]>(() => [], []);

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
      onBell: handleBell,
      onAvatar: handleUserSettings,
      // No project open → no gear: outside a project it would only duplicate
      // the avatar's /settings destination (live report 2026-07-13, refines
      // N-22's fallback). Inside a project the gear opens the pages/settings
      // dropdown.
      ...(projectId ? { onGear: handleProjectSettings, gearMenuItems } : {}),
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
      handleBell,
      handleUserSettings,
      handleProjectSettings,
      gearMenuItems,
      projectId,
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
    const nav = buildRailNav({
      projectId,
      currentSegment: activeSegment,
      t,
      enabledFeatures,
    });
    return [nav.sviluppo, nav.produzione];
  }, [projectId, activeSegment, t, enabledFeatures]);

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
    (surface: "floating" | "split", headerNav?: ReactNode) => {
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
          headerNav={isSplit ? headerNav : undefined}
          onShrinkToFloat={
            isSplit
              ? () => {
                  handleCloseCesarePeek();
                  setCesareOpen(true);
                  setCesareState("expanded");
                }
              : undefined
          }
          onClose={() => {
            if (isSplit) {
              handleCloseCesarePeek();
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
                handleCloseCesarePeek();
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
          askCesare={askCesare}
          onAssistantResponse={handleCesareAssistantResponse}
          onTurnStart={handleCesareTurnStart}
          onTurnSettled={handleCesareTurnSettled}
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
      handleCloseCesarePeek,
      handleCesareAssistantResponse,
      handleCesareTurnStart,
      handleCesareTurnSettled,
      focusedSessionId,
      setFocusedSessionId,
      router,
    ],
  );

  return (
    <CesareProvider openCesare={openCesare}>
      <div className={styles.shell} ref={shellRef}>
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
            // The rail renders the "Sessioni Cesare" section whenever
            // `onSessionsOpen` is set, even with an empty `sessions` list (it
            // stays reachable from zero sessions) — so AI-off must clear
            // BOTH props, not just the list, or an empty section survives.
            sessions={isAiEnabled ? cesareSessions : undefined}
            onSessionSelect={onCesareSessionSelect}
            onSessionRename={onCesareSessionRename}
            onSessionDelete={onCesareSessionDelete}
            onSessionPin={isAiEnabled ? onCesareSessionPin : undefined}
            onSessionNew={isAiEnabled ? onCesareSessionNew : undefined}
            onSessionsOpen={isAiEnabled ? onCesareSessionsOpen : undefined}
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
              pinSession: t("shell.rail.pinSession"),
              unpinSession: t("shell.rail.unpinSession"),
              seeAllSessions: t("shell.rail.seeAllSessions"),
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

        {/* Full-width TopBar strip (grid row 1, spans main + aux lane): the
            account zone stays at the viewport's top-right even when a split
            surface owns the third column (live report 2026-07-13). Its live
            height feeds `--ohw-topbar-h` so the sticky lanes start below it. */}
        <div className={styles.topBarRow} ref={topBarRowRef}>
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
            versionSelector={topBarSlots.versionSelector ?? undefined}
            onSearch={openPalette}
            elementLegend={topBarSlots.elementLegend ?? undefined}
            accountZone={
              <>
                {isAiEnabled && <TopBarCredits />}
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
              </>
            }
          />
        </div>

        <main id="main-content" className={styles.main}>
          {children}
        </main>

        {/* Cesare split column (Spec 46 ?peek=, Spec 47 A4). A REAL third
              grid column — the main lane reflows narrower beside it (the page
              collapses). Hosts the single split CesareSheet; closing it clears
              `?peek`. Spec 84 §5: gated behind `isAiEnabled` like every other
              Cesare surface — OFF hides it even if `?peek=cesare` is still in
              the URL (a stale deep link never resurrects the drawer). */}
        {isAiEnabled && isCesareSplitActive && (
          <CesarePeekLane onClose={handleCloseCesarePeek}>
            {renderCesareSheet("split", sharedHistoryNav)}
          </CesarePeekLane>
        )}

        {/* Versions split column (Spec 49 W1 + W2). A REAL third grid column
              for the split state — the main lane reflows narrower beside it. In
              `full` the lane renders its own overlay (the `↗` expanded route),
              so no grid track is reserved. The single source of truth is the
              `?versions` URL param; the lane's controls dispatch URL navs.
              Yields to an explicit Cesare split (Option B): when Cesare owns the
              track, Versions does not render. */}
        {versionsPeek !== null && !isCesareSplitActive && (
          <VersionsSplitLane
            peek={versionsPeek}
            width={effectiveVersionsWidth}
            onWidthChange={setVersionsLaneWidth}
            onExpand={() => onExpandVersions?.()}
            onStepBack={() => onStepBackVersions?.()}
            onClose={handleCloseVersionsLane}
            headerNav={sharedHistoryNav}
          />
        )}

        {/* Collapse affordance now lives inside the LeftRail brand row
              (hover-revealed `«`). ⌘\ still drives the full↔collapsed cycle
              from the keydown handler above. */}

        {/* Spec 47d — the "Mostra modifiche" diff is no longer a shell-level
              floating overlay; it is painted INSIDE each touched document's
              prose by a per-document <CesareLiveDiff/> (mounted in the document
              bodies). The shell only relays the broadcast. */}

        {/* Spec 84 §5: the dock is Cesare-only (bell/avatar/gear live in
              TopBarAccount) — AI off means no dock at all, not a disabled
              one. */}
        {isAiEnabled && !isCesareSplitActive && !isCesareSurfaceActive && (
          <BottomDock
            onCesareToggle={toggleCesare}
            openCesareLabel={t("shell.dock.openCesare")}
            actionsLabel={t("shell.dock.actions")}
          />
        )}

        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={closePalette}
          items={paletteItems}
          emptyLabel={t("shell.palette.empty")}
          resultsLabel={t("shell.palette.results")}
        />
        {/* Floating Cesare sheet — the default surface. Unmounted while ANY
              auxiliary lane (Cesare peek / Versioni / Notifiche / preview) owns
              the single 3rd track, OR a central Cesare surface (full-screen
              session page) is active. The floating drawer (z `--cesare-drawer-z`)
              would otherwise sit OVER the split host (z `--split-host-z`) and
              blanket the lane's composer input — pointer-events dead (#49). The
              launcher dock stays reachable (it promotes Cesare into the shared
              navigable host while a lane is open — see `toggleCesare`). The chat
              is never duplicated. Session-focus props per Spec 47-A5. */}
        {isAiEnabled &&
          !isAnyAuxLaneActive &&
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
          onNotificationGoTo={(notification) => {
            handleGoToNotificationTarget(notification);
            splitDrawer.close();
          }}
        />
      </div>
    </CesareProvider>
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
  onNotificationGoTo: (notification: CesareNotification) => void;
}

function SplitDrawerHost({
  splitDrawer,
  splitDrawerWidth,
  setSplitDrawerWidth,
  onNotificationActivate,
  onNotificationGoTo,
}: SplitDrawerHostProps) {
  const { t } = useTranslation();
  if (!splitDrawer.payload) return null;

  const payload = splitDrawer.payload;

  // `cesare-peek` / `versions` are NAVIGATION RECORDS in the shared history, not
  // host-rendered bodies: the routed `CesarePeekLane` / `VersionsSplitLane` paint
  // them (Spec 78 A6). The host renders ONLY its own kinds (preview /
  // notifications); when the active payload is a routed kind the host yields the
  // track entirely so the two never double-render.
  if (payload.kind === "cesare-peek" || payload.kind === "versions") {
    return null;
  }

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
        <NotificationCenterDrawerContent
          onActivate={onNotificationActivate}
          onGoTo={onNotificationGoTo}
        />
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

// One ←/→ arrow, focus/keyboard-managed by react-aria `useButton` (mandatory for
// every interactive primitive). A disabled arrow stays in the DOM (so the nav
// keeps a stable width) but is inert.
function SplitDrawerHistoryArrow({
  glyph,
  onPress,
  disabled,
  label,
  testId,
}: {
  glyph: string;
  onPress: () => void;
  disabled: boolean;
  label: string;
  testId: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, isDisabled: disabled, "aria-label": label },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      className={styles.splitHistoryBtn}
      title={label}
      data-testid={testId}
    >
      {glyph}
    </button>
  );
}

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
  // ALWAYS render the ←/→ arrows — the split header IS the router, so every
  // surface (Cesare peek, Versioni, Notifiche) carries the same back/forward
  // affordance even with a single-item history (the arrows are simply disabled).
  // A constant header chrome means the user always knows the lane is navigable
  // and the column width never shifts as history grows (Spec 78 A6 / refound).
  return (
    <div className={styles.splitHistoryNav} data-testid="split-drawer-history">
      <SplitDrawerHistoryArrow
        glyph="←"
        onPress={onBack}
        disabled={!canGoBack}
        label={backLabel}
        testId="split-drawer-back"
      />
      <SplitDrawerHistoryArrow
        glyph="→"
        onPress={onForward}
        disabled={!canGoForward}
        label={forwardLabel}
        testId="split-drawer-forward"
      />
    </div>
  );
}
