// apps/web/app/features/predictions/use-cesare-chat.ts
//
// Spec 47a (A1 + A2) — React hook that drives the Cesare chat lifecycle, and
// Spec 47b FIX 2 — backed by the SHARED `CesareChatStoreProvider` so the
// floating sheet and the full-page session render the same threads.
//
// When mounted under a `CesareChatStoreProvider` (the app shell always is) the
// hook is a thin adapter over the shared store: it publishes the live page
// context + `askCesare` transport, keeps the requested session selected, and
// returns the active session's messages. Outside a provider (isolated component
// tests / Storybook) it degrades to a private reducer with the same lifecycle.
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  chatReducer,
  initialChatState,
  activeThread,
  type ChatMessage,
  type ChatState,
} from "./use-cesare-chat-reducer";
import { streamCesare, type StreamCesareInput } from "./cesare-stream-client";
import { useCesareChatStore } from "./cesare-chat-store";
import type { AskCesareFn } from "./components/CesareSheet";

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const FAILURE_TEXT = "Mi dispiace, si è verificato un errore. Riprova.";

export interface UseCesareChatArgs {
  readonly activeSessionId: string | null;
  /** Non-streaming fallback. Null disables Cesare on this surface. */
  readonly askCesare: AskCesareFn | null;
  /** Page context forwarded to both transports. */
  readonly pageContext: StreamCesareInput["pageContext"] & {
    projectId: string;
  };
  /** Fires with the final assistant reply (delivered or error text). */
  readonly onAssistantResponse?: (reply: string) => void;
}

export interface UseCesareChat {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly isLoading: boolean;
  readonly send: (text: string) => Promise<void>;
  readonly selectSession: (sessionId: string) => void;
}

export const useCesareChat = (args: UseCesareChatArgs): UseCesareChat => {
  const store = useCesareChatStore();
  const local = useLocalCesareChat(args, store !== null);

  // Publish the live transport + page context so the store's `send` (used by
  // BOTH the floating composer and the full-page composer) always targets the
  // page the user currently has open.
  const { askCesare, pageContext, onAssistantResponse } = args;
  useEffect(() => {
    store?.setSendDeps({ askCesare, pageContext, onAssistantResponse });
  }, [store, askCesare, pageContext, onAssistantResponse]);

  // Keep the store's active session in sync with this surface's selection.
  const desiredSession = args.activeSessionId ?? "__pending__";
  useEffect(() => {
    if (!store) return;
    if (store.activeSessionId !== desiredSession) {
      store.selectSession(desiredSession);
    }
  }, [store, desiredSession]);

  const storeSend = useCallback(
    async (text: string) => {
      await store?.send(text);
    },
    [store],
  );
  const storeSelect = useCallback(
    (sessionId: string) => store?.selectSession(sessionId),
    [store],
  );

  if (store) {
    return {
      messages: store.activeMessages,
      isLoading: store.isLoadingFor(store.activeSessionId),
      send: storeSend,
      selectSession: storeSelect,
    };
  }
  return local;
};

// ─── Private reducer fallback (no provider) ────────────────────────────────
// Preserves the original self-contained lifecycle for isolated usage. `inert`
// skips the work when a store is present so we never run two pipelines.
const useLocalCesareChat = (
  {
    activeSessionId,
    askCesare,
    pageContext,
    onAssistantResponse,
  }: UseCesareChatArgs,
  inert: boolean,
): UseCesareChat => {
  const sessionId = activeSessionId ?? "__pending__";
  const [state, dispatch] = useReducer(
    chatReducer,
    sessionId,
    initialChatState,
  );
  const stateRef = useRef<ChatState>(state);
  stateRef.current = state;

  const selectSession = useCallback((next: string) => {
    dispatch({ type: "session/select", sessionId: next });
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (inert) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      const targetSession = stateRef.current.activeSessionId;
      const userMessageId = newId();
      const assistantMessageId = newId();

      dispatch({
        type: "message/send",
        sessionId: targetSession,
        userMessageId,
        assistantMessageId,
        content: trimmed,
      });

      if (!askCesare) {
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

      const history = activeThread(stateRef.current)
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
    },
    [inert, askCesare, onAssistantResponse, pageContext],
  );

  const messages = activeThread(state);
  const isLoading = messages.some(
    (m) => m.role === "assistant" && m.status === "pending",
  );

  return { messages, isLoading, send, selectSession };
};
