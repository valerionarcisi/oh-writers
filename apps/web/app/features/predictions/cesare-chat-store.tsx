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

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const FAILURE_TEXT = "Mi dispiace, si è verificato un errore. Riprova.";
const PENDING_SESSION = "__pending__";

/** Page context + transport the send pipeline needs. Published by the floating
 *  sheet (the only surface that owns them) so any surface's composer can send. */
export interface CesareSendDeps {
  readonly askCesare: AskCesareFn | null;
  readonly pageContext: StreamCesareInput["pageContext"] & {
    readonly projectId: string;
  };
  readonly onAssistantResponse?: (reply: string) => void;
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

  // The floating sheet publishes these; the send pipeline reads the latest via
  // a ref so a re-render of the sheet never stales the transport.
  const sendDepsRef = useRef<CesareSendDeps | null>(null);
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

  const selectSession = useCallback((sessionId: string) => {
    dispatch({ type: "session/select", sessionId });
  }, []);

  const send = useCallback(async (text: string, sessionId?: string) => {
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
    const history = threadFor(stateRef.current, targetSession)
      .filter((m) => m.id !== userMessageId && m.id !== assistantMessageId)
      .filter((m) => m.content.length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    const { projectId, ...pc } = pageContext;
    const streamInput: StreamCesareInput = {
      projectId,
      message: trimmed,
      pageContext: pc,
      conversationHistory: history,
    };

    let finalReply: string | null = null;
    let streamFailed = false;
    try {
      await streamCesare(streamInput, (event) => {
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
      });
    } catch {
      streamFailed = true;
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
    } else {
      dispatch({
        type: "message/failed",
        sessionId: targetSession,
        userMessageId,
        assistantMessageId,
        content: FAILURE_TEXT,
      });
    }
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
      setSendDeps,
    }),
    [state, activePage, selectSession, send, setSendDeps],
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
