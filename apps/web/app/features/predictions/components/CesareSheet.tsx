// apps/web/app/features/predictions/components/CesareSheet.tsx
//
// Spec 44 WP-B — chat owner for the Cesare assistant (floating drawer surface).
//
// CesareSheet renders the conversation surface inside the Notion-class
// `<CesareDrawer/>` chrome. The conversation rendering itself lives in the
// shared `<CesareConversation/>` (Spec 47b FIX 2) so the full-page session route
// renders the SAME thread without forking a second chat container. The chat
// thread state + send pipeline live in the shared `CesareChatStoreProvider`.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ResultShape } from "@oh-writers/utils";
import {
  CesareDrawer,
  useDrawerState,
  type CesareDrawerScope,
  type CesareDrawerSession,
  type CesareDrawerContextTag,
  type CesareDrawerState,
  type TargetPageRef,
  type TraceMarker,
} from "@oh-writers/ui";
import { useSplitDrawer, flashLiveDiff } from "~/features/app-shell";
import {
  useSessions,
  useCreateSession,
  type CesareSession,
} from "~/features/predictions/sessions";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { useCesareChat } from "../use-cesare-chat";
import {
  CesareConversation,
  pageLabel,
  parseRewriteSceneMarker,
  parseBlockingProposalMarkerForSideChannel,
  type CesarePage,
  type LiveDiffMarker,
} from "./CesareConversation";
import {
  decideShowChangesSurface,
  buildTargetPageRef,
} from "../cesare-show-changes";
import { useNarrativeNextStep } from "../use-narrative-next-step";
import { NextStepChip } from "./NextStepChip";
import styles from "./CesareSheet.module.css";

type Translate = (key: TranslationKey) => string;

/**
 * Cross-component flow (Spec 44): consumers invoke the returned function to
 * surface the affected page inside the SplitDrawer with a trace overlay.
 */
export interface TraceForToolRunArgs {
  pageRef: TargetPageRef;
  traceMarkers: ReadonlyArray<TraceMarker>;
  onAccept: (markerId: string) => void;
  onReject: (markerId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  title?: string;
}

export function useShowChangesInSplitDrawer(): (
  args: TraceForToolRunArgs,
) => void {
  const splitDrawer = useSplitDrawer();
  return useCallback(
    (args: TraceForToolRunArgs) => {
      splitDrawer.open({ kind: "trace", ...args });
    },
    [splitDrawer],
  );
}

// ─── Re-exports preserved for existing importers ───────────────────────────
export type { CesarePage } from "./CesareConversation";
export {
  parseToolsExecuted,
  parseRewriteSceneMarker,
  appliedEntityDomains,
} from "./CesareConversation";

// ─── Server-side surface ───────────────────────────────────────────────────

export type AskCesareFn = (params: {
  data: {
    projectId: string;
    message: string;
    pageContext: {
      page: CesarePage;
      sceneId: string | null;
      sceneNumber: number | null;
      requirementId?: string | null;
      documentId?: string | null;
      shootingDayId?: string | null;
      shootingDayNumber?: number | null;
    };
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  };
}) => Promise<ResultShape<string, { _tag: string; message: string }>>;

// ─── Quick prompts (unchanged from legacy sheet) ───────────────────────────

const QUICK_PROMPT_KEYS: Record<CesarePage, ReadonlyArray<TranslationKey>> = {
  soggetto: [
    "cesare.quick.soggetto.0",
    "cesare.quick.soggetto.1",
    "cesare.quick.soggetto.2",
  ],
  synopsis: [
    "cesare.quick.synopsis.0",
    "cesare.quick.synopsis.1",
    "cesare.quick.synopsis.2",
  ],
  outline: [
    "cesare.quick.outline.0",
    "cesare.quick.outline.1",
    "cesare.quick.outline.2",
  ],
  treatment: [
    "cesare.quick.treatment.0",
    "cesare.quick.treatment.1",
    "cesare.quick.treatment.2",
  ],
  screenplay: [
    "cesare.quick.screenplay.0",
    "cesare.quick.screenplay.1",
    "cesare.quick.screenplay.2",
  ],
  breakdown: [
    "cesare.quick.breakdown.0",
    "cesare.quick.breakdown.1",
    "cesare.quick.breakdown.2",
  ],
  budget: [
    "cesare.quick.budget.0",
    "cesare.quick.budget.1",
    "cesare.quick.budget.2",
  ],
  schedule: [
    "cesare.quick.schedule.0",
    "cesare.quick.schedule.1",
    "cesare.quick.schedule.2",
  ],
  "shooting-plan": [
    "cesare.quick.shootingPlan.0",
    "cesare.quick.shootingPlan.1",
    "cesare.quick.shootingPlan.2",
  ],
  locations: [
    "cesare.quick.locations.0",
    "cesare.quick.locations.1",
    "cesare.quick.locations.2",
  ],
};

// ─── Sessions UI ───────────────────────────────────────────────────────────

const formatRelativeLastAt = (iso: string, t: Translate): string => {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("cesare.time.now");
  if (minutes < 60) return `${minutes}${t("cesare.time.minutes")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t("cesare.time.hours")}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return t("cesare.time.yesterday");
  return `${days}${t("cesare.time.days")}`;
};

const toDrawerSessions = (
  sessions: ReadonlyArray<CesareSession>,
  activeId: string | null,
  t: Translate,
): ReadonlyArray<CesareDrawerSession> =>
  sessions.map((s) => ({
    id: s.id,
    title: s.title,
    lastAt: formatRelativeLastAt(s.lastMessageAt, t),
    isActive: s.id === activeId,
  }));

// ─── Component ─────────────────────────────────────────────────────────────

export interface CesareSheetProps {
  projectId: string;
  page: CesarePage;
  sceneId?: string | null;
  sceneNumber?: number | null;
  requirementId?: string | null;
  documentId?: string | null;
  shootingDayId?: string | null;
  shootingDayNumber?: number | null;
  isOpen: boolean;
  onClose: () => void;
  /** Invoked when the user clicks the drawer's "↗ full" affordance. */
  onOpenFullPage: () => void;
  onCesareStateChange?: (next: CesareDrawerState) => void;
  /** Server function for chat. Pass null until the server fn is implemented. */
  askCesare?: AskCesareFn | null;
  /** Called after each assistant response — used to invalidate queries. */
  onAssistantResponse?: (reply: string) => void;
  /** Spec 47-A5 — focused session published by the central route. */
  focusedSessionId?: string | null;
  /** Spec 47-A5 — mirror of the active session id back to the shell. */
  onActiveSessionChange?: (sessionId: string | null) => void;
  /** Rendering surface (Spec 46 ?peek=, Spec 47 A4). */
  surface?: "floating" | "split";
  /** "Open as split column" affordance — shown only on the floating surface. */
  onOpenAsSplit?: () => void;
}

export function CesareSheet({
  projectId,
  page,
  sceneId,
  sceneNumber,
  requirementId,
  documentId,
  shootingDayId,
  shootingDayNumber,
  isOpen,
  onClose,
  onOpenFullPage,
  onCesareStateChange,
  askCesare = null,
  onAssistantResponse,
  focusedSessionId = null,
  onActiveSessionChange,
  surface = "floating",
  onOpenAsSplit,
}: CesareSheetProps) {
  const { t } = useTranslation();
  // ── Drawer state machine ────────────────────────────────────────────────
  const initialDrawerState: CesareDrawerState = isOpen ? "expanded" : "closed";
  const drawer = useDrawerState({
    initialState: initialDrawerState,
    onChange: (next) => {
      onCesareStateChange?.(next);
      if (typeof document !== "undefined") {
        const normalised = next === "expanded-split" ? "expanded" : next;
        document.body.setAttribute("data-cesare", normalised);
      }
      if (next === "closed") onClose();
      if (next === "full") onOpenFullPage();
    },
  });

  useEffect(() => {
    if (isOpen && drawer.state === "closed") {
      drawer.open("expanded");
    } else if (!isOpen && drawer.state !== "closed") {
      drawer.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Chat composer value (local controlled input) ─────────────────────────
  const [input, setInput] = useState("");

  // ── Sessions ────────────────────────────────────────────────────────────
  const sessionsQuery = useSessions(projectId);
  const createSession = useCreateSession(projectId);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionsQuery.data || activeSessionId) return;
    const first = sessionsQuery.data[0];
    if (first) setActiveSessionId(first.id);
  }, [sessionsQuery.data, activeSessionId]);

  // ── Assistant-reply side channels ────────────────────────────────────────
  const handleAssistantSideChannels = useCallback(
    (content: string) => {
      onAssistantResponse?.(content);
      if (typeof window === "undefined") return;

      const proposal = parseBlockingProposalMarkerForSideChannel(content);
      if (proposal) {
        window.dispatchEvent(
          new CustomEvent("ohw:cesare:blocking-proposal", { detail: proposal }),
        );
      }

      const rewrite = parseRewriteSceneMarker(content);
      if (rewrite) {
        try {
          window.sessionStorage.setItem(
            "ohw:cesare:pending-rewrite",
            JSON.stringify({ ...rewrite, projectId, ts: Date.now() }),
          );
        } catch {
          // sessionStorage may be unavailable (private mode, iframe).
        }
        window.dispatchEvent(
          new CustomEvent("ohw:cesare:rewrite-scene", { detail: rewrite }),
        );
        if (page === "screenplay") drawer.peek();
      }
    },
    [onAssistantResponse, projectId, page, drawer],
  );

  // ── Send pipeline (shared store: stream-first, askCesare fallback) ───────
  const chat = useCesareChat({
    activeSessionId,
    askCesare,
    pageContext: {
      projectId,
      page,
      sceneId: sceneId ?? null,
      sceneNumber: sceneNumber ?? null,
      requirementId: requirementId ?? null,
      documentId: documentId ?? null,
      shootingDayId: shootingDayId ?? null,
      shootingDayNumber: shootingDayNumber ?? null,
    },
    onAssistantResponse: handleAssistantSideChannels,
  });
  const messages = chat.messages;
  const isLoading = chat.isLoading;

  // Spec 47-A5 — adopt the central route's focused session as active.
  useEffect(() => {
    if (!focusedSessionId || focusedSessionId === activeSessionId) return;
    setActiveSessionId(focusedSessionId);
    chat.selectSession(focusedSessionId);
    setInput("");
  }, [focusedSessionId, activeSessionId, chat]);

  useEffect(() => {
    onActiveSessionChange?.(activeSessionId);
  }, [activeSessionId, onActiveSessionChange]);

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      setActiveSessionId(sessionId);
      chat.selectSession(sessionId);
      setInput("");
    },
    [activeSessionId, chat],
  );

  const handleSessionNew = useCallback(async () => {
    const result = await createSession.mutateAsync(undefined);
    setActiveSessionId(result.id);
    chat.selectSession(result.id);
    setInput("");
  }, [createSession, chat]);

  const drawerSessions = useMemo(
    () => toDrawerSessions(sessionsQuery.data ?? [], activeSessionId, t),
    [sessionsQuery.data, activeSessionId, t],
  );

  // ── Sessions popover ─────────────────────────────────────────────────────
  const [isSessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const handleSessionSelectorClick = useCallback(() => {
    setSessionPopoverOpen((v) => !v);
  }, []);
  const handleSessionPick = useCallback(
    (id: string) => {
      handleSessionSelect(id);
      setSessionPopoverOpen(false);
    },
    [handleSessionSelect],
  );
  const handleNewSessionClick = useCallback(async () => {
    await handleSessionNew();
    setSessionPopoverOpen(false);
  }, [handleSessionNew]);

  // ── Context tag derived from the active page ────────────────────────────
  const contextTags = useMemo<ReadonlyArray<CesareDrawerContextTag>>(
    () => [
      {
        id: "page-scope",
        label:
          sceneNumber != null
            ? `${pageLabel(page, t)} · SC.${sceneNumber}`
            : pageLabel(page, t),
      },
    ],
    [page, sceneNumber, t],
  );

  // ── Diff surface handlers (Spec 47e) ─────────────────────────────────────
  const showChangesInSplit = useShowChangesInSplitDrawer();

  // Live-doc inline flash (Spec 47e). Cesare edits already landed on the touched
  // documents; the document always holds the new version. "Mostra modifiche"
  // flashes the GREEN additions, "Nascondi modifiche" flashes the RED previous
  // text (a peek at "how it was") — both transient, fading out, neither a
  // revert. We arm the live-diff store with one flash per touched document
  // keyed by documentType; each per-document <CesareLiveDiff/> reads its own
  // entry (with last-value replay), so opening any touched doc — even after the
  // click — flashes its own diff.
  const flashLiveDiffFor = useCallback(
    (
      mode: "mostra" | "nascondi",
      liveDiffs?: ReadonlyArray<LiveDiffMarker>,
    ) => {
      const inputs = (liveDiffs ?? [])
        .filter((d) => d.documentType)
        .map((d) => ({
          documentType: d.documentType,
          label: d.label,
          segments: d.segments,
        }));
      flashLiveDiff(mode, inputs);
    },
    [],
  );

  const splitDrawerCtx = useSplitDrawer();

  const handleShowChanges = useCallback(
    (args: {
      traceMarkers: ReadonlyArray<TraceMarker>;
      scope?: string;
      liveDiffs?: ReadonlyArray<LiveDiffMarker>;
    }) => {
      const surfaceChoice = decideShowChangesSurface({
        surface,
        drawerState: drawer.state,
      });
      if (surfaceChoice._tag === "live-diff") {
        flashLiveDiffFor("mostra", args.liveDiffs);
        return;
      }
      const pageRef = buildTargetPageRef(page, args.scope);
      if (!pageRef) {
        flashLiveDiffFor("mostra", args.liveDiffs);
        return;
      }
      showChangesInSplit({
        pageRef,
        traceMarkers: args.traceMarkers,
        onAccept: () => undefined,
        onReject: () => undefined,
        onAcceptAll: () => undefined,
        onRejectAll: () => undefined,
        title: pageRef.scope
          ? `${pageRef.title} · ${pageRef.scope}`
          : pageRef.title,
      });
    },
    [surface, drawer.state, page, flashLiveDiffFor, showChangesInSplit],
  );

  const handleHideChanges = useCallback(
    (args: { liveDiffs?: ReadonlyArray<LiveDiffMarker> }) => {
      flashLiveDiffFor("nascondi", args.liveDiffs);
      splitDrawerCtx.close();
    },
    [flashLiveDiffFor, splitDrawerCtx],
  );

  const handleSubmit = useCallback(() => {
    if (isLoading) return;
    const text = input;
    setInput("");
    void chat.send(text);
  }, [input, isLoading, chat]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      void chat.send(prompt);
    },
    [chat],
  );

  // ── Next-step suggestion (Spec 50) ───────────────────────────────────────
  // Derived purely from which documents already have content. Clicking the chip
  // seeds the suggestion prompt through the SAME send path — exactly one
  // generation, never an automatic chain. Suppressed while Cesare is generating.
  const { suggestion: nextStep } = useNarrativeNextStep(projectId);
  const handleNextStep = useCallback(
    (prompt: string) => {
      if (isLoading) return;
      void chat.send(prompt);
    },
    [isLoading, chat],
  );
  const showInlineNextStep =
    nextStep !== null && messages.length > 0 && !isLoading;

  // ── Scopes shown above the composer ─────────────────────────────────────
  const scopes = useMemo<ReadonlyArray<CesareDrawerScope>>(
    () => [
      { id: "page", icon: "📎", label: pageLabel(page, t) },
      ...(sceneNumber != null
        ? [
            {
              id: "scene",
              icon: "🎬",
              label: `${t("cesare.scene")} ${sceneNumber}`,
            } satisfies CesareDrawerScope,
          ]
        : []),
    ],
    [page, sceneNumber, t],
  );

  // ── Body composition (shared conversation renderer) ──────────────────────
  const conversationBody: ReactNode = (
    <>
      {showInlineNextStep && nextStep && (
        <NextStepChip
          suggestion={nextStep}
          onPick={handleNextStep}
          isDisabled={isLoading}
        />
      )}
      <CesareConversation
        messages={messages}
        page={page}
        onShowChanges={handleShowChanges}
        onHideChanges={handleHideChanges}
        emptyState={
          <>
            <EmptyState page={page} />
            {nextStep && (
              <NextStepChip
                suggestion={nextStep}
                onPick={handleNextStep}
                isDisabled={isLoading}
              />
            )}
            <QuickPrompts page={page} onSelect={handleQuickPrompt} />
          </>
        }
      />
    </>
  );

  const handleCycle = useCallback(() => {
    if (drawer.state === "expanded") {
      drawer.setState("full");
      return;
    }
    if (drawer.state === "expanded-split") {
      drawer.setState("full");
      return;
    }
    drawer.cycle();
  }, [drawer]);

  const handleStepBack = useCallback(() => {
    if (drawer.state === "full") {
      drawer.setState("expanded");
      return;
    }
    drawer.stepBack();
  }, [drawer]);

  return (
    <CesareDrawer
      state={drawer.state}
      onStateChange={drawer.setState}
      onCycle={handleCycle}
      onStepBack={handleStepBack}
      onPeek={drawer.peek}
      onClose={drawer.close}
      surface={surface}
      onOpenAsSplit={onOpenAsSplit}
      sessions={drawerSessions}
      activeSessionId={activeSessionId ?? undefined}
      onSessionSelectorClick={handleSessionSelectorClick}
      onNewChat={handleNewSessionClick}
      contextTags={contextTags}
      scopes={scopes}
      composer={{
        value: input,
        onChange: setInput,
        onSubmit: handleSubmit,
        isThinking: isLoading,
      }}
      peekSubtitle={
        isLoading ? t("cesare.peek.thinking") : t("cesare.peek.waiting")
      }
      labels={{
        peekExpand: t("shell.cesareDrawer.peekExpand"),
        peekClose: t("shell.cesareDrawer.peekClose"),
        expand: t("shell.cesareDrawer.expand"),
        openAsColumn: t("shell.cesareDrawer.openAsColumn"),
        minimize: t("shell.cesareDrawer.minimize"),
        close: t("shell.cesareDrawer.close"),
      }}
    >
      {conversationBody}
      {isSessionPopoverOpen && (
        <SessionsPopover
          sessions={sessionsQuery.data ?? []}
          activeSessionId={activeSessionId}
          onPick={handleSessionPick}
          onNew={handleNewSessionClick}
          onClose={() => setSessionPopoverOpen(false)}
        />
      )}
    </CesareDrawer>
  );
}

// ─── Floating-sheet-only building blocks ───────────────────────────────────

function EmptyState({ page }: { page: CesarePage }) {
  const { t } = useTranslation();
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>
        {t("cesare.empty.askAbout")} {pageLabel(page, t)}.
      </p>
    </div>
  );
}

function QuickPrompts({
  page,
  onSelect,
}: {
  page: CesarePage;
  onSelect: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.quickPrompts} aria-label={t("cesare.quickPrompts.aria")}>
      {QUICK_PROMPT_KEYS[page].map((key) => {
        const prompt = t(key);
        return (
          <button
            key={key}
            type="button"
            className={styles.quickPromptBtn}
            onClick={() => onSelect(prompt)}
          >
            {prompt}
          </button>
        );
      })}
    </div>
  );
}

function SessionsPopover({
  sessions,
  activeSessionId,
  onPick,
  onNew,
  onClose,
}: {
  sessions: ReadonlyArray<CesareSession>;
  activeSessionId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={styles.sessionsPopover}
      role="dialog"
      aria-label={t("cesare.sessions.popoverAria")}
      data-testid="cesare-sessions-popover"
    >
      <ul className={styles.sessionsList} role="listbox">
        {sessions.length === 0 && (
          <li className={styles.sessionsEmpty}>
            {t("cesare.sessions.empty")}
          </li>
        )}
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={s.id === activeSessionId}
              className={[
                styles.sessionRow,
                s.id === activeSessionId ? styles.sessionRowActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onPick(s.id)}
            >
              <span className={styles.sessionRowTitle}>{s.title}</span>
              <span className={styles.sessionRowMeta}>
                {formatRelativeLastAt(s.lastMessageAt, t)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.sessionNewBtn} onClick={onNew}>
        {t("cesare.sessions.new")}
      </button>
    </div>
  );
}
