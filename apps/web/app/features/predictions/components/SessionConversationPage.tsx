// Spec 47-A5 + 47b FIX 2 — central, deep-linkable session conversation route
// (`/projects/:id/sessions/:sessionId`). This REPLACES the main content (it is
// not a `?peek=` side-drawer).
//
// The page renders the REAL conversation for the focused session: every user +
// assistant bubble, the agentic trace (Step Block / ChangeTrace), and the
// Mostra/Nascondi modifiche + Annulla controls. It reuses the SAME renderer
// (`<CesareConversation/>`) and the SAME shared chat store as the floating
// drawer — so there is a single chat container, never a fork. The composer here
// sends through the shared store, targeting this session's thread.
//
// Access control lives entirely server-side: `useSession` calls a `getSession`
// server fn that fails closed (foreign / unknown id → not-found error).
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Skeleton } from "@oh-writers/ui";
import type { TraceMarker } from "@oh-writers/ui";
import { useButton } from "react-aria";
import { useCesareSessionFocus } from "~/features/app-shell";
import { useSession } from "../sessions";
import { useCesareChatStore } from "../cesare-chat-store";
import { CesareConversation, type LiveDiffMarker } from "./CesareConversation";
import { useShowChangesInSplitDrawer } from "./CesareSheet";
import { buildTargetPageRef } from "../cesare-show-changes";
import styles from "./SessionConversationPage.module.css";

const SessionIdParam = z.string().uuid();

export function SessionConversationPage({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  // A malformed param can't belong to anyone — short-circuit to not-found
  // before hitting the server (defence in depth; the server fn also rejects).
  const isValidParam = SessionIdParam.safeParse(sessionId).success;

  const sessionQuery = useSession(
    isValidParam ? projectId : null,
    isValidParam ? sessionId : null,
  );
  const { setFocusedSessionId } = useCesareSessionFocus();
  const store = useCesareChatStore();
  const showChangesInSplit = useShowChangesInSplitDrawer();

  const session = sessionQuery.data;
  const confirmedSessionId = session?.id ?? null;

  // `store` is a `useMemo` keyed on the chat state, so its reference changes on
  // every message/selection. Reading it through a ref keeps the focus/select
  // effect depending ONLY on the stable `confirmedSessionId` — listing `store`
  // as a dep made the effect re-fire on every state change, call `selectSession`
  // again, mutate the state, and loop ("Maximum update depth exceeded").
  const storeRef = useRef(store);
  storeRef.current = store;

  // Once the session is confirmed owned, focus it so the floating drawer and
  // this page agree on the active session (shared store, single source).
  useEffect(() => {
    if (!confirmedSessionId) return;
    setFocusedSessionId(confirmedSessionId);
    storeRef.current?.selectSession(confirmedSessionId);
  }, [confirmedSessionId, setFocusedSessionId]);

  useEffect(() => {
    return () => setFocusedSessionId(null);
  }, [setFocusedSessionId]);

  // ── Composer ──────────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const isLoading = store?.isLoadingFor(confirmedSessionId) ?? false;
  const handleSubmit = useCallback(() => {
    if (!store || !confirmedSessionId) return;
    const text = input.trim();
    if (text.length === 0 || isLoading) return;
    setInput("");
    void store.send(text, confirmedSessionId);
  }, [store, confirmedSessionId, input, isLoading]);

  // ── Diff handlers — full page hides the doc, so Mostra modifiche opens the
  //    routed SplitDrawer with the affected page (A6 full-page branch). Undo
  //    emits the same DOM events the floating drawer uses. ────────────────────
  const page = store?.activePage ?? "soggetto";
  const handleShowChanges = useCallback(
    (args: {
      traceMarkers: ReadonlyArray<TraceMarker>;
      scope?: string;
      liveDiffs?: ReadonlyArray<LiveDiffMarker>;
    }) => {
      const pageRef = buildTargetPageRef(page, args.scope);
      if (!pageRef) return;
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
    [page, showChangesInSplit],
  );
  const handleHideChanges = useCallback(() => undefined, []);

  if (!isValidParam || sessionQuery.isError) {
    return (
      <div className={styles.page} data-testid="cesare-session-not-found">
        <h1 className={styles.title}>Sessione non trovata</h1>
        <p className={styles.subtitle}>
          Questa conversazione non esiste o non è accessibile.
        </p>
      </div>
    );
  }

  if (sessionQuery.isPending || !session) {
    return (
      <div className={styles.page} data-testid="cesare-session-loading">
        <Skeleton
          lines={3}
          widths={["60%", "80%", "45%"]}
          tone="agent"
          ariaLabel="Caricamento sessione Cesare"
        />
      </div>
    );
  }

  const messages = store?.messagesFor(session.id) ?? [];

  return (
    <div
      className={styles.page}
      data-testid="session-conversation"
      data-session-id={session.id}
    >
      <header className={styles.header}>
        <span className={styles.brandGlyph} aria-hidden="true">
          ✦
        </span>
        <div>
          <h1 className={styles.title} data-testid="session-title">
            {session.title}
          </h1>
          <p className={styles.subtitle}>Conversazione con Cesare</p>
        </div>
      </header>

      <CesareConversation
        messages={messages}
        page={page}
        testId="session-conversation-thread"
        onShowChanges={handleShowChanges}
        onHideChanges={handleHideChanges}
        emptyState={
          <p className={styles.lede} data-testid="session-empty">
            Nessun messaggio ancora in questa conversazione. Scrivi qui sotto
            per iniziare.
          </p>
        }
      />

      <SessionComposer
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isThinking={isLoading}
      />
    </div>
  );
}

// ─── Composer (full-page) ──────────────────────────────────────────────────

function SessionComposer({
  value,
  onChange,
  onSubmit,
  isThinking,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  isThinking: boolean;
}) {
  const sendRef = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    {
      onPress: onSubmit,
      isDisabled: value.trim().length === 0 || isThinking,
      "aria-label": "Invia messaggio",
    },
    sendRef,
  );
  return (
    <div className={styles.composer} data-testid="session-composer">
      <textarea
        className={styles.composerInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Chiedi a Cesare…"
        disabled={isThinking}
        rows={1}
        aria-label="Composer Cesare"
        data-testid="cesare-composer-input"
      />
      <button
        ref={sendRef}
        {...buttonProps}
        type="button"
        className={styles.composerSend}
        data-testid="cesare-send-btn"
      >
        ↑
      </button>
    </div>
  );
}
