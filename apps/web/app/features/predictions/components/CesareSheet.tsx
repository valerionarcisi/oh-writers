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
import {
  useSplitDrawer,
  type SplitDrawerPreviewDiff,
} from "~/features/app-shell";
import {
  useSessions,
  useCreateSession,
  resolveSessionSendTarget,
  type CesareSession,
} from "~/features/predictions/sessions";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { setHighlight, clearHighlight } from "~/features/documents";
import { useCesareChat } from "../use-cesare-chat";
import type { CesareTurnSettle } from "../cesare-chat-store";
import {
  CesareConversation,
  pageLabel,
  parseRewriteSceneMarker,
  parseBlockingProposalMarkerForSideChannel,
  type CesarePage,
  type LiveDiffMarker,
} from "./CesareConversation";
import {
  buildTargetPageRef,
  buildTargetPageRefForDocument,
  documentTypeMatchesPage,
} from "../cesare-show-changes";
import { useNarrativeNextStep } from "../use-narrative-next-step";
import { NextStepChip } from "./NextStepChip";
import styles from "./CesareSheet.module.css";

type Translate = (key: TranslationKey) => string;

/**
 * Cross-component flow (ADR-0001): from inside a chat session, surface the
 * affected page inside the SplitDrawer as a READ-ONLY preview with the change
 * highlighted inline. No accept/reject — the edit is already applied live.
 */
export interface PreviewForToolRunArgs {
  pageRef: TargetPageRef;
  liveDiffs: ReadonlyArray<SplitDrawerPreviewDiff>;
  title?: string;
  summary?: string;
}

export function useShowChangesInSplitDrawer(): (
  args: PreviewForToolRunArgs,
) => void {
  const splitDrawer = useSplitDrawer();
  return useCallback(
    (args: PreviewForToolRunArgs) => {
      splitDrawer.open({ kind: "preview", ...args });
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
  parseLiveDiffMarkers,
  parseDocAppliedMarker,
  parseEntityAppliedMarkers,
  extractChangeSummary,
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
  /** Invoked when the user clicks the drawer's "↗ full" affordance. In split
   *  this carries the active session id so the shell can route to its detail
   *  page without waiting for the focused-session round-trip. */
  onOpenFullPage: (sessionId?: string | null) => void;
  onCesareStateChange?: (next: CesareDrawerState) => void;
  /** Server function for chat. Pass null until the server fn is implemented. */
  askCesare?: AskCesareFn | null;
  /** Called after each assistant response — used to invalidate queries. */
  onAssistantResponse?: (reply: string) => void;
  /** BUG-066 — bell turn lifecycle: start returns the notification id used
   *  as correlation token; settled receives it when the same turn ends. */
  onTurnStart?: () => string | null;
  onTurnSettled?: (settle: CesareTurnSettle) => void;
  /** Spec 47-A5 — focused session published by the central route. */
  focusedSessionId?: string | null;
  /** Spec 47-A5 — mirror of the active session id back to the shell. */
  onActiveSessionChange?: (sessionId: string | null) => void;
  /** Rendering surface (Spec 46 ?peek=, Spec 47 A4). */
  surface?: "floating" | "split";
  /** "Open as split column" affordance — shown only on the floating surface. */
  onOpenAsSplit?: () => void;
  /** Split surface only: close the peek lane and re-open the floating drawer. */
  onShrinkToFloat?: () => void;
  /** Split surface only: shared auxiliary-lane history controls (←/→) rendered
   *  in the Cesare split header (Spec 78 A6). The shell passes its
   *  `SplitDrawerHistoryNav` so the one navigable track shows the same control
   *  whether Cesare, Versioni or Notifiche occupies it. */
  headerNav?: ReactNode;
  /** A prompt to auto-send once when the sheet opens (margin "start a session"
   *  affordance). The nonce makes re-sends of the same text distinct. */
  seedPrompt?: { text: string; nonce: number } | null;
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
  onTurnStart,
  onTurnSettled,
  focusedSessionId = null,
  onActiveSessionChange,
  surface = "floating",
  onOpenAsSplit,
  onShrinkToFloat,
  headerNav,
  seedPrompt = null,
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
  // A pulse (not persisted state) that plays a brief shake when Enter is
  // swallowed because a turn is still in flight — the field itself stays
  // editable, so this is the only signal the keypress did nothing.
  const [submitBlockedPulse, setSubmitBlockedPulse] = useState(false);

  // ── Sessions ────────────────────────────────────────────────────────────
  const sessionsQuery = useSessions(projectId);
  const createSession = useCreateSession(projectId);
  // Issue #42 — Cesare opens CLEAN. The default active session is `null`, which
  // selects the empty pending thread (the "Chiedimi qualunque cosa…" landing).
  // We deliberately do NOT auto-select the most recent session on mount: that
  // dropped the writer mid-conversation into a stale thread (with a leftover
  // pending ask-card). Past sessions are reachable from the sessions list and
  // become active only on an EXPLICIT pick (`handleSessionSelect`), a new
  // session (`handleSessionNew`), or the central route's focused session
  // (`focusedSessionId`). The in-session work still persists server-side and is
  // re-reachable from that list.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

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

      // A screenplay PROPOSAL landed in the server-side bucket (edit / rename /
      // revision / merge). The proposals query does not refetch on its own, so
      // signal the mounted editor to invalidate it — otherwise the ✓/✗ card /
      // draft banner never appears though Cesare says it proposed one (bug N3).
      if (content.includes("<!--ohw:screenplay-proposal-->")) {
        window.dispatchEvent(new CustomEvent("ohw:cesare:screenplay-proposal"));
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
    onTurnStart,
    onTurnSettled,
  });
  const messages = chat.messages;
  const isLoading = chat.isLoading;

  // Spec 47-A5 — the shell's `focusedSessionId` and this drawer's
  // `activeSessionId` form a TWO-WAY binding: the central `/sessions/:id` route
  // sets `focusedSessionId` and the drawer adopts it (below); the drawer
  // publishes its own selection back up (`onActiveSessionChange`). That feedback
  // loop only converges if each side ignores the ECHO of its own write. Without
  // it, switching sessions in the split made `focusedSessionId` and
  // `activeSessionId` chase each other forever — "Maximum update depth exceeded"
  // (Bug 3a). `lastPublishedRef` records the id this drawer last pushed upward;
  // when it bounces back as `focusedSessionId` we DON'T re-adopt it (it is our
  // own echo, not an external route-driven focus change).
  const lastPublishedRef = useRef<string | null>(null);
  // Depend on `chat.selectSession` (referentially stable, store-ref-bound) NOT
  // the whole `chat` object: `chat`'s identity changes every render, so listing
  // it re-fires this effect every commit.
  const selectChatSession = chat.selectSession;
  useEffect(() => {
    if (!focusedSessionId || focusedSessionId === activeSessionId) return;
    if (focusedSessionId === lastPublishedRef.current) return;
    setActiveSessionId(focusedSessionId);
    selectChatSession(focusedSessionId);
    setInput("");
  }, [focusedSessionId, activeSessionId, selectChatSession]);

  // Auto-send a seeded prompt (margin "start a session on this suggestion") once
  // per nonce, when the floating sheet is open. It always starts a FRESH session
  // (a suggestion is a new line of work — it must NOT append to the open thread):
  // create a session, select it, then send into it.
  //
  // The effect depends ONLY on the nonce + isOpen. `chat` and `createSession`
  // change identity on every render, so depending on them would re-run the
  // effect in a loop (each send triggers a re-render). We read the latest of
  // both from refs and guard with `sentSeedNonceRef` so each nonce fires once.
  const seedDepsRef = useRef({ chat, createSession });
  seedDepsRef.current = { chat, createSession };
  const sentSeedNonceRef = useRef<number | null>(null);
  const seedNonce = seedPrompt?.nonce ?? null;
  useEffect(() => {
    if (seedNonce == null || !isOpen) return;
    if (sentSeedNonceRef.current === seedNonce) return;
    sentSeedNonceRef.current = seedNonce;
    const text = seedPrompt?.text ?? "";
    if (!text) return;
    void (async () => {
      const { chat: c, createSession: cs } = seedDepsRef.current;
      const session = await cs.mutateAsync(undefined);
      setActiveSessionId(session.id);
      c.selectSession(session.id);
      // Target the new session explicitly so the send doesn't race the state
      // update (the suggestion must land in the fresh session, not the old one).
      await c.send(text, session.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce, isOpen]);

  useEffect(() => {
    // Record what we publish so the adoption effect above can recognise — and
    // ignore — the echo that returns as `focusedSessionId` (Bug 3a loop guard).
    lastPublishedRef.current = activeSessionId;
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

  // A session row is minted ONLY when the first real message is sent
  // (`sendInSession` below). "Nuova sessione" therefore does NOT hit the server:
  // it drops the drawer into the fresh/empty pending state (the landing +
  // composer). Eagerly creating the row here produced a flood of untitled
  // "Nuova sessione" rows with zero turns — a session must persist only once it
  // has ≥1 turn (a title is derived from the first message). Clearing
  // `activeSessionId` selects the synthetic pending thread in the chat store
  // (`useCesareChat` maps a null id to `__pending__`).
  const handleSessionNew = useCallback(() => {
    setActiveSessionId(null);
    setInput("");
  }, []);

  // Every send must target a REAL (DB-backed) session. When none is active yet
  // (a fresh project, or before the first session row exists), the floating
  // drawer used to send into the synthetic `PENDING_SESSION` id — the server
  // then failed `persistTurn` with CesareSessionNotFoundError and silently
  // dropped the whole turn (BUG #42: every Cesare edit failed, the editor never
  // updated, and Cesare falsely reported success). Create the session first and
  // send into its real id. The conversation page / landing already do this; the
  // drawer's send paths now share it.
  const sendInSession = useCallback(
    async (text: string) => {
      const target = resolveSessionSendTarget(activeSessionId);
      if (target.kind === "existing") {
        void chat.send(text, target.sessionId);
        return;
      }
      // `create`: mint the row NOW, with this first message, so it is born with a
      // turn + a derived title (never an empty placeholder — Bug 3b).
      const session = await createSession.mutateAsync(undefined);
      setActiveSessionId(session.id);
      chat.selectSession(session.id);
      await chat.send(text, session.id);
    },
    [activeSessionId, chat, createSession],
  );

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
  const handleNewSessionClick = useCallback(() => {
    handleSessionNew();
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

  const splitDrawerCtx = useSplitDrawer();

  const handleShowChanges = useCallback(
    (args: {
      traceMarkers: ReadonlyArray<TraceMarker>;
      scope?: string;
      liveDiffs?: ReadonlyArray<LiveDiffMarker>;
      summary?: string;
    }) => {
      const diffs = (args.liveDiffs ?? []).filter((d) => d.documentType);
      if (diffs.length === 0) return;
      const firstDocType = diffs[0]?.documentType;
      // When the edited entity is the one whose editor is open behind the
      // floating chat, "Mostra modifiche" UNDERLINES the change INSIDE the
      // document prose (Spec 63) — same as the in-editor banner, never the split
      // (which would duplicate the document the writer is already reading).
      if (firstDocType && documentTypeMatchesPage(firstDocType, page)) {
        const added = diffs
          .filter((d) => d.documentType === firstDocType)
          .flatMap((d) =>
            d.segments.filter((s) => s.op === "add").map((s) => s.text),
          );
        setHighlight(firstDocType, added);
        return;
      }
      // Otherwise (a cross-domain edit on a DIFFERENT page, or a chat session
      // where no editor is in front) the read-only split-preview is correct.
      const pageRef =
        (firstDocType
          ? buildTargetPageRefForDocument(firstDocType, args.scope)
          : null) ?? buildTargetPageRef(page, args.scope);
      if (!pageRef) return;
      showChangesInSplit({
        pageRef,
        liveDiffs: diffs.map((d) => ({
          documentType: d.documentType,
          label: d.label,
          segments: d.segments,
        })),
        title: pageRef.scope
          ? `${pageRef.title} · ${pageRef.scope}`
          : pageRef.title,
        ...(args.summary ? { summary: args.summary } : {}),
      });
    },
    [page, showChangesInSplit],
  );

  const handleHideChanges = useCallback(
    (args: { liveDiffs?: ReadonlyArray<LiveDiffMarker> }) => {
      // "Nascondi" on the entity's own page clears the in-document underline;
      // elsewhere it closes the read-only split.
      const firstDocType = (args.liveDiffs ?? []).find(
        (d) => d.documentType,
      )?.documentType;
      if (firstDocType && documentTypeMatchesPage(firstDocType, page)) {
        clearHighlight(firstDocType);
        return;
      }
      splitDrawerCtx.close();
    },
    [page, splitDrawerCtx],
  );

  // Spec 76 — the large-edit ask card's choice. Re-send a short IT confirmation:
  // the model re-runs the same edit (the instruction is still in the thread) and
  // the intent classifier maps the phrasing to overwrite vs a new version, so the
  // edit applies LIVE the way the writer just chose — no side draft tray.
  const handleChooseVersionAction = useCallback(
    (args: { documentType: string; action: "overwrite" | "mint" }) => {
      if (isLoading) return;
      const text =
        args.action === "mint"
          ? "Sì, fanne una nuova versione e applica la modifica."
          : "Sovrascrivi la versione corrente con questa modifica.";
      void sendInSession(text);
    },
    [isLoading, sendInSession],
  );

  const handleSubmit = useCallback(() => {
    if (isLoading) {
      setSubmitBlockedPulse(true);
      window.setTimeout(() => setSubmitBlockedPulse(false), 240);
      return;
    }
    const text = input;
    setInput("");
    void sendInSession(text);
  }, [input, isLoading, sendInSession]);

  const handleRecallLast = useCallback(() => {
    const recalled = chat.recallLast();
    if (recalled) setInput(recalled);
  }, [chat.recallLast]);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      void sendInSession(prompt);
    },
    [sendInSession],
  );

  // ── Next-step suggestion (Spec 50) ───────────────────────────────────────
  // Derived purely from which documents already have content. Clicking the chip
  // seeds the suggestion prompt through the SAME send path — exactly one
  // generation, never an automatic chain. Suppressed while Cesare is generating.
  const { suggestion: nextStep } = useNarrativeNextStep(projectId);
  const handleNextStep = useCallback(
    (prompt: string) => {
      if (isLoading) return;
      void sendInSession(prompt);
    },
    [isLoading, sendInSession],
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
  // N-11 — the forward-looking "next step" suggestion belongs AFTER the last
  // reply (a contextual nudge near where the user is reading + the composer),
  // not pinned above stale history. The empty-state keeps the quick prompts +
  // suggestion together as the cold-start menu.
  const conversationBody: ReactNode = (
    <>
      <CesareConversation
        messages={messages}
        page={page}
        onShowChanges={handleShowChanges}
        onHideChanges={handleHideChanges}
        onChooseVersionAction={handleChooseVersionAction}
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
      {showInlineNextStep && nextStep && (
        <NextStepChip
          suggestion={nextStep}
          onPick={handleNextStep}
          isDisabled={isLoading}
        />
      )}
    </>
  );

  const handleCycle = useCallback(() => {
    // From the minimised peek row, ↗ just restores the drawer to its expanded
    // size — it does NOT route away (the user is only un-minimising).
    if (surface !== "split" && drawer.state === "peek") {
      drawer.setState("expanded");
      return;
    }
    // Otherwise ↗ navigates to the full-screen session detail route — on both
    // the split lane (where the chat IS the central route) and the expanded
    // floating drawer. The floating overlay "full" state is no longer reachable
    // from ↗; the chat detail lives at /projects/:id/sessions/:sessionId. Pass
    // the active session id directly — the shell-side focused-session mirror may
    // not have flushed yet on first open.
    onOpenFullPage(activeSessionId);
  }, [drawer, surface, onOpenFullPage, activeSessionId]);

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
      onShrinkToFloat={onShrinkToFloat}
      headerNav={headerNav}
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
        onStop: () => chat.stop(activeSessionId ?? undefined),
        onRecallLast: handleRecallLast,
        isSubmitBlocked: submitBlockedPulse,
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
    <div
      className={styles.quickPrompts}
      aria-label={t("cesare.quickPrompts.aria")}
    >
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
          <li className={styles.sessionsEmpty}>{t("cesare.sessions.empty")}</li>
        )}
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={s.id === activeSessionId}
              data-testid="cesare-session-row"
              data-session-id={s.id}
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
      <button
        type="button"
        className={styles.sessionNewBtn}
        data-testid="cesare-session-new-btn"
        onClick={onNew}
      >
        {t("cesare.sessions.new")}
      </button>
    </div>
  );
}
