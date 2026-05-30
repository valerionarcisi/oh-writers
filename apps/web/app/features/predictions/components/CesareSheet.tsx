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
import { useSplitDrawer, setLiveDiffState } from "~/features/app-shell";
import {
  useSessions,
  useCreateSession,
  type CesareSession,
} from "~/features/predictions/sessions";
import { useCesareChat } from "../use-cesare-chat";
import {
  CesareConversation,
  PAGE_LABELS,
  parseRewriteSceneMarker,
  parseBlockingProposalMarkerForSideChannel,
  type CesarePage,
  type DocAppliedMarker,
  type LiveDiffMarker,
} from "./CesareConversation";
import {
  decideShowChangesSurface,
  buildTargetPageRef,
} from "../cesare-show-changes";
import styles from "./CesareSheet.module.css";

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

const QUICK_PROMPTS_INITIAL: Record<CesarePage, string[]> = {
  soggetto: [
    "Il conflitto centrale è chiaro?",
    "Suggerisci un arco del personaggio",
    "Come rendere il finale più forte?",
  ],
  synopsis: [
    "La sinossi è efficace per un produttore?",
    "Riassumi in tre righe",
    "Rendi il tono più commerciale",
  ],
  outline: [
    "C'è squilibrio tra gli atti?",
    "Suggerisci un twist al secondo atto",
    "Compatta le scene ridondanti",
  ],
  treatment: [
    "Il ritmo narrativo funziona?",
    "Suggerisci come migliorare la transizione",
    "Identifica i punti deboli",
  ],
  screenplay: [
    "Questa scena è fattibile domani?",
    "Aiutami a scrivere il dialogo",
    "Come riduco i costi di questa scena?",
  ],
  breakdown: [
    "Cosa costa di più in questa scena?",
    "Suggerisci dove tagliare",
    "Compara con scene simili",
  ],
  budget: [
    "Dove stiamo sforando?",
    "Ottimizza questa categoria",
    "Stima il costo della prossima giornata",
  ],
  schedule: [
    "Ottimizza i giorni di ripresa",
    "Raggruppa per location",
    "Quanti giorni rimangono?",
  ],
  "shooting-plan": [
    "Quanto tempo ci vuole per questa scena?",
    "Raggruppa le inquadrature per setup",
    "Ordine ottimale delle riprese",
  ],
  locations: [
    "Trova candidati per questa location",
    "Quale zona geografica esplorare?",
    "Cosa controllare durante il sopralluogo?",
  ],
};

// ─── Sessions UI ───────────────────────────────────────────────────────────

const formatRelativeLastAt = (iso: string): string => {
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
};

const toDrawerSessions = (
  sessions: ReadonlyArray<CesareSession>,
  activeId: string | null,
): ReadonlyArray<CesareDrawerSession> =>
  sessions.map((s) => ({
    id: s.id,
    title: s.title,
    lastAt: formatRelativeLastAt(s.lastMessageAt),
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
    () => toDrawerSessions(sessionsQuery.data ?? [], activeSessionId),
    [sessionsQuery.data, activeSessionId],
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
            ? `${PAGE_LABELS[page]} · SC.${sceneNumber}`
            : PAGE_LABELS[page],
      },
    ],
    [page, sceneNumber],
  );

  // ── Diff surface handlers (Spec 47-A6 / 47b FIX 4) ───────────────────────
  const showChangesInSplit = useShowChangesInSplitDrawer();

  const handleCancelRewrite = useCallback(
    (rewrite: { scene_number: number; new_content: string }) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("ohw:cesare:cancel-rewrite", {
          detail: { sceneNumber: rewrite.scene_number },
        }),
      );
    },
    [],
  );

  const handleUndoDocApply = useCallback((marker: DocAppliedMarker) => {
    if (typeof window === "undefined") return;
    if (!marker.previousVersionId) return;
    window.dispatchEvent(
      new CustomEvent("ohw:cesare:undo-doc-apply", {
        detail: {
          documentType: marker.documentType,
          previousVersionId: marker.previousVersionId,
        },
      }),
    );
  }, []);

  // Live-doc inline diff toggle (Spec 47d). Cesare edits already landed on the
  // touched documents; revealing the diff paints a green WORD-LEVEL highlight
  // INSIDE each document's prose — no overlay panel. We arm body[data-cesare-
  // diff] (the global flag) AND the live-diff store, which carries one diff per
  // touched document keyed by documentType. Each per-document <CesareLiveDiff/>
  // reads its own entry from the store (with last-value replay), so opening any
  // touched doc — even after the toggle fired — shows its highlight.
  const toggleLiveDiff = useCallback(
    (showing: boolean, liveDiffs?: ReadonlyArray<LiveDiffMarker>) => {
      if (typeof document === "undefined") return;
      if (showing) {
        document.body.setAttribute("data-cesare-diff", "on");
      } else {
        document.body.removeAttribute("data-cesare-diff");
      }
      const diffs: Record<string, LiveDiffMarker> = {};
      if (showing && liveDiffs) {
        for (const d of liveDiffs) {
          if (d.documentType) diffs[d.documentType] = d;
        }
      }
      setLiveDiffState({ showing, diffs });
    },
    [],
  );

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
        toggleLiveDiff(true, args.liveDiffs ?? []);
        return;
      }
      const pageRef = buildTargetPageRef(page, args.scope);
      if (!pageRef) {
        toggleLiveDiff(true, args.liveDiffs ?? []);
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
    [surface, drawer.state, page, toggleLiveDiff, showChangesInSplit],
  );

  const splitDrawerCtx = useSplitDrawer();
  const handleHideChanges = useCallback(() => {
    toggleLiveDiff(false);
    splitDrawerCtx.close();
  }, [toggleLiveDiff, splitDrawerCtx]);

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

  // ── Scopes shown above the composer ─────────────────────────────────────
  const scopes = useMemo<ReadonlyArray<CesareDrawerScope>>(
    () => [
      { id: "page", icon: "📎", label: PAGE_LABELS[page] },
      ...(sceneNumber != null
        ? [
            {
              id: "scene",
              icon: "🎬",
              label: `Scena ${sceneNumber}`,
            } satisfies CesareDrawerScope,
          ]
        : []),
    ],
    [page, sceneNumber],
  );

  // ── Body composition (shared conversation renderer) ──────────────────────
  const conversationBody: ReactNode = (
    <CesareConversation
      messages={messages}
      page={page}
      onShowChanges={handleShowChanges}
      onHideChanges={handleHideChanges}
      onCancelRewrite={handleCancelRewrite}
      onUndoDocApply={handleUndoDocApply}
      emptyState={
        <>
          <EmptyState page={page} />
          <QuickPrompts page={page} onSelect={handleQuickPrompt} />
        </>
      }
    />
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
      peekSubtitle={isLoading ? "sta pensando…" : "in attesa"}
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
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyText}>
        Chiedimi qualunque cosa su {PAGE_LABELS[page]}.
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
  return (
    <div className={styles.quickPrompts} aria-label="Suggerimenti rapidi">
      {QUICK_PROMPTS_INITIAL[page].map((prompt) => (
        <button
          key={prompt}
          type="button"
          className={styles.quickPromptBtn}
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
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
      aria-label="Sessioni Cesare"
      data-testid="cesare-sessions-popover"
    >
      <ul className={styles.sessionsList} role="listbox">
        {sessions.length === 0 && (
          <li className={styles.sessionsEmpty}>Nessuna sessione</li>
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
                {formatRelativeLastAt(s.lastMessageAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.sessionNewBtn} onClick={onNew}>
        + Nuova sessione
      </button>
    </div>
  );
}
