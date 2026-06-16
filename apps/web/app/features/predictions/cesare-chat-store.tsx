// apps/web/app/features/predictions/cesare-chat-store.tsx
//
// Spec 47b FIX 2 — shared Cesare chat store.
//
// The chat thread state (per-session message threads + the streamed live trace)
// used to live inside `useCesareChat`'s local reducer, mounted only by the
// floating `CesareSheet`. The full-page session route (`/sessions/:sessionId`)
// needs to render the SAME conversation, so the reducer is lifted here into a
// provider both surfaces consume — a SINGLE chat container, never a fork.
//
// The floating sheet is the only surface that knows the live page context +
// the `askCesare` server fn, so it PUBLISHES them into the store via
// `setSendDeps`. The store's `send` then works from either surface (floating
// composer OR full-page composer) against whatever page is currently open.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  chatReducer,
  initialChatState,
  threadFor,
  type ChatMessage,
  type ChatState,
} from "./use-cesare-chat-reducer";
import { streamCesare, type StreamCesareInput } from "./cesare-stream-client";
import type { AskCesareFn } from "./components/CesareSheet";
import type { CesarePage } from "./components/CesareConversation";
import { persistTurn } from "./messages/messages.server";
import { messagesQueryOptions } from "./messages/useMessages";
import { sessionsQueryKey } from "./sessions/useSessions";
import {
  buildAssistantMetadata,
  persistedToChatMessage,
} from "./messages/message-metadata";

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const FAILURE_TEXT = "Mi dispiace, si è verificato un errore. Riprova.";
const STOPPED_TEXT = "⏹ Interrotto.";
const PENDING_SESSION = "__pending__";

/** How a Cesare turn ended. `delivered` carries the final reply; `failed`
 *  covers both transports erroring; `aborted` is the user's Cmd+C. */
export interface CesareTurnSettle {
  readonly token: string | null;
  readonly outcome: "delivered" | "failed" | "aborted";
  readonly reply: string | null;
}

/** Page context + transport the send pipeline needs. Published by the floating
 *  sheet (the only surface that owns them) so any surface's composer can send. */
export interface CesareSendDeps {
  readonly askCesare: AskCesareFn | null;
  readonly pageContext: StreamCesareInput["pageContext"] & {
    readonly projectId: string;
  };
  readonly onAssistantResponse?: (reply: string) => void;
  /** BUG-066 — fired when a turn starts; returns a correlation token (the
   *  bell notification id) that `onTurnSettled` receives when the SAME turn
   *  ends, so the shell updates one row in place instead of appending. */
  readonly onTurnStart?: () => string | null;
  readonly onTurnSettled?: (settle: CesareTurnSettle) => void;
}

export interface CesareChatStore {
  readonly activeSessionId: string;
  /** The page the floating sheet currently has open — drives the full-page
   *  conversation's ChangeTrace labels. Defaults to `"soggetto"`. */
  readonly activePage: CesarePage;
  /** Messages for a specific session (full-page reads its focused session). */
  readonly messagesFor: (
    sessionId: string | null,
  ) => ReadonlyArray<ChatMessage>;
  /** Messages for the currently active session (floating sheet). */
  readonly activeMessages: ReadonlyArray<ChatMessage>;
  /** True when the given session has an assistant turn still in flight. */
  readonly isLoadingFor: (sessionId: string | null) => boolean;
  readonly selectSession: (sessionId: string) => void;
  /** Send a message. Optional `sessionId` targets a specific thread (full-page);
   *  defaults to the active session (floating sheet). */
  readonly send: (text: string, sessionId?: string) => Promise<void>;
  /** Stop the in-flight agent turn for a session (Cmd+C). No-op when idle. */
  readonly stop: (sessionId?: string) => void;
  /** Floating sheet publishes the live page context + transport here. */
  readonly setSendDeps: (deps: CesareSendDeps) => void;
}

const CesareChatStoreContext = createContext<CesareChatStore | null>(null);

const isLoadingThread = (thread: ReadonlyArray<ChatMessage>): boolean =>
  thread.some((m) => m.role === "assistant" && m.status === "pending");

export function CesareChatStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    chatReducer,
    PENDING_SESSION,
    initialChatState,
  );
  const stateRef = useRef<ChatState>(state);
  stateRef.current = state;
  const queryClient = useQueryClient();

  // The floating sheet publishes these; the send pipeline reads the latest via
  // a ref so a re-render of the sheet never stales the transport.
  const sendDepsRef = useRef<CesareSendDeps | null>(null);

  // In-flight stream controllers, keyed by session, so `stop(sessionId)` can
  // abort the agent mid-turn (Cmd+C, like every agent CLI). Cleared when the
  // turn settles.
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Sessions already hydrated this mount — avoids re-fetching persisted history
  // on every selectSession (the floating sheet + the full-page route both
  // select the same session). Real UUIDs only; the synthetic pending session is
  // never persisted.
  const hydratedSessionsRef = useRef<Set<string>>(new Set());

  // Load a session's persisted messages once and fill its (empty) thread, so a
  // reload / first-open restores the conversation. The hydrate reducer action is
  // a no-op when the thread already has bubbles, so an in-flight turn is never
  // clobbered by a slower load.
  const hydrateSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === PENDING_SESSION) return;
      if (hydratedSessionsRef.current.has(sessionId)) return;
      const projectId = sendDepsRef.current?.pageContext.projectId;
      if (!projectId) return;
      hydratedSessionsRef.current.add(sessionId);
      const persisted = await queryClient
        .fetchQuery(messagesQueryOptions(projectId, sessionId))
        .catch(() => null);
      if (!persisted || persisted.length === 0) return;
      dispatch({
        type: "thread/hydrate",
        sessionId,
        messages: persisted.map(persistedToChatMessage),
      });
    },
    [queryClient],
  );
  // `activePage` is reactive (drives the full-page ChangeTrace labels), so it
  // lives in state — not just the ref. Defaults to the soggetto until the
  // floating sheet publishes the page the user actually has open.
  const [activePage, setActivePage] = useState<CesarePage>("soggetto");
  const setSendDeps = useCallback((deps: CesareSendDeps) => {
    sendDepsRef.current = deps;
    setActivePage((prev) =>
      prev === deps.pageContext.page ? prev : deps.pageContext.page,
    );
  }, []);

  const selectSession = useCallback(
    (sessionId: string) => {
      dispatch({ type: "session/select", sessionId });
      void hydrateSession(sessionId);
    },
    [hydrateSession],
  );

  const send = useCallback(
    async (text: string, sessionId?: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      const deps = sendDepsRef.current;

      const targetSession =
        sessionId ?? stateRef.current.activeSessionId ?? PENDING_SESSION;
      const userMessageId = newId();
      const assistantMessageId = newId();

      // Optimistic bubbles appear synchronously — never wiped by a session swap.
      dispatch({
        type: "message/send",
        sessionId: targetSession,
        userMessageId,
        assistantMessageId,
        content: trimmed,
      });

      if (!deps || !deps.askCesare) {
        dispatch({
          type: "message/delivered",
          sessionId: targetSession,
          userMessageId,
          assistantMessageId,
          content:
            "Cesare non è ancora disponibile su questa sezione. Tornerà presto.",
        });
        return;
      }

      const { askCesare, pageContext, onAssistantResponse } = deps;

      // BUG-066 — one bell row per turn: the shell creates it now and settles
      // the SAME row (via the token) when this turn ends, on every path.
      const turnToken = deps.onTurnStart?.() ?? null;

      // Cap to the most recent 20 turns: spec 51 persists messages, so a long
      // session can exceed the server's `max(20)` on `conversationHistory`.
      // Send only the latest 20 (newest context) so a long thread never fails
      // Zod validation.
      const history = threadFor(stateRef.current, targetSession)
        .filter((m) => m.id !== userMessageId && m.id !== assistantMessageId)
        .filter((m) => m.content.length > 0)
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-20);

      const { projectId, ...pc } = pageContext;
      const streamInput: StreamCesareInput = {
        projectId,
        message: trimmed,
        // BUG-N66 — tell the server which session this turn belongs to so its
        // small edits collapse into one working version instead of flooding.
        sessionId: targetSession,
        pageContext: pc,
        conversationHistory: history,
      };

      // Per-turn abort controller so `stop(targetSession)` can cancel the agent
      // mid-stream (Cmd+C). A previous in-flight turn for the same session is
      // superseded — abort it before starting the new one.
      abortControllersRef.current.get(targetSession)?.abort();
      const controller = new AbortController();
      abortControllersRef.current.set(targetSession, controller);

      let finalReply: string | null = null;
      let streamFailed = false;
      let aborted = false;
      try {
        await streamCesare(
          streamInput,
          (event) => {
            if (event._tag === "done") {
              finalReply = event.result;
              return;
            }
            if (event._tag === "error") {
              streamFailed = true;
              return;
            }
            dispatch({
              type: "stream/step",
              sessionId: targetSession,
              assistantMessageId,
              event,
            });
          },
          controller.signal,
        );
      } catch (e) {
        // An abort (Cmd+C) is a user action, not a failure: don't fall back to
        // the non-streaming retry (that would re-run the agent we just stopped).
        if (controller.signal.aborted || (e as Error)?.name === "AbortError") {
          aborted = true;
        } else {
          streamFailed = true;
        }
      } finally {
        if (abortControllersRef.current.get(targetSession) === controller) {
          abortControllersRef.current.delete(targetSession);
        }
      }

      // Stopped by the user — settle the turn with whatever was streamed so far
      // (the partial trace stays) and stop; no retry, no failure bubble.
      if (aborted) {
        dispatch({
          type: "message/delivered",
          sessionId: targetSession,
          userMessageId,
          assistantMessageId,
          content: STOPPED_TEXT,
        });
        deps.onTurnSettled?.({
          token: turnToken,
          outcome: "aborted",
          reply: null,
        });
        return;
      }

      if (finalReply === null || streamFailed) {
        const shape = await askCesare({
          data: {
            projectId: streamInput.projectId,
            message: streamInput.message,
            pageContext: { ...streamInput.pageContext },
            conversationHistory: streamInput.conversationHistory.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
        }).catch(() => null);
        if (shape && shape.isOk) {
          finalReply = shape.value;
          streamFailed = false;
        }
      }

      if (finalReply !== null && !streamFailed) {
        dispatch({
          type: "message/delivered",
          sessionId: targetSession,
          userMessageId,
          assistantMessageId,
          content: finalReply,
        });
        onAssistantResponse?.(finalReply);
        deps.onTurnSettled?.({
          token: turnToken,
          outcome: "delivered",
          reply: finalReply,
        });
        // Persist the turn so the conversation survives reload. Best-effort: a
        // failed persist never breaks the live UI (the bubble is already shown).
        // Only real (UUID) sessions are persisted — the synthetic pending session
        // has no row to attach to. The assistant message in current state carries
        // the accumulated live trace; we pair it with the marker-bearing reply to
        // derive the metadata (trace + edit version ids) for the transcript.
        if (targetSession !== PENDING_SESSION) {
          const assistantInState = threadFor(
            stateRef.current,
            targetSession,
          ).find((m) => m.id === assistantMessageId);
          const metadata = buildAssistantMetadata({
            id: assistantMessageId,
            role: "assistant",
            content: finalReply,
            status: "delivered",
            trace: assistantInState?.trace ?? [],
          });
          void persistTurn({
            data: {
              projectId,
              sessionId: targetSession,
              userContent: trimmed,
              assistantContent: finalReply,
              metadata,
            },
          })
            .then(() => {
              // The persisted thread is now authoritative for a future reload —
              // drop the stale cache so the next open refetches the saved turn.
              void queryClient.invalidateQueries({
                queryKey: ["cesare-messages", projectId, targetSession],
              });
              // The first turn may have auto-named the session (Spec 53) and
              // every turn bumps its lastMessageAt; refresh the rail/route list
              // so the derived title + ordering reflect everywhere.
              void queryClient.invalidateQueries({
                queryKey: sessionsQueryKey(projectId),
              });
            })
            .catch(() => undefined);
        }
      } else {
        dispatch({
          type: "message/failed",
          sessionId: targetSession,
          userMessageId,
          assistantMessageId,
          content: FAILURE_TEXT,
        });
        deps.onTurnSettled?.({
          token: turnToken,
          outcome: "failed",
          reply: null,
        });
      }
    },
    [queryClient],
  );

  const stop = useCallback((sessionId?: string) => {
    const target = sessionId ?? stateRef.current.activeSessionId;
    abortControllersRef.current.get(target)?.abort();
  }, []);

  const store = useMemo<CesareChatStore>(
    () => ({
      activeSessionId: state.activeSessionId,
      activePage,
      messagesFor: (sessionId) =>
        threadFor(state, sessionId ?? state.activeSessionId),
      activeMessages: threadFor(state, state.activeSessionId),
      isLoadingFor: (sessionId) =>
        isLoadingThread(threadFor(state, sessionId ?? state.activeSessionId)),
      selectSession,
      send,
      stop,
      setSendDeps,
    }),
    [state, activePage, selectSession, send, stop, setSendDeps],
  );

  return (
    <CesareChatStoreContext.Provider value={store}>
      {children}
    </CesareChatStoreContext.Provider>
  );
}

/** Returns the shared store, or null outside a provider (isolated tests). */
export function useCesareChatStore(): CesareChatStore | null {
  return useContext(CesareChatStoreContext);
}
