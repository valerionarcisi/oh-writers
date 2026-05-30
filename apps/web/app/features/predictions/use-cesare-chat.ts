// apps/web/app/features/predictions/use-cesare-chat.ts
//
// Spec 47a (A1 + A2) — React hook that drives the Cesare chat lifecycle.
//
// Wraps the pure `chatReducer` and owns the send pipeline:
//   1. append the optimistic user bubble + an in-flight assistant bubble
//      SYNCHRONOUSLY (A1 — never lost to a session swap);
//   2. stream the turn from `/api/cesare/stream`, reducing step events into the
//      assistant bubble's live trace (A2);
//   3. on `done`, mark both bubbles delivered with the final reply;
//   4. on transport failure, fall back to the non-streaming `askCesare` server
//      function, then to a typed error bubble — the user bubble is marked
//      `failed` so the UI can offer a retry.
import { useCallback, useReducer, useRef } from "react";
import {
  chatReducer,
  initialChatState,
  activeThread,
  type ChatMessage,
  type ChatState,
} from "./use-cesare-chat-reducer";
import { streamCesare, type StreamCesareInput } from "./cesare-stream-client";
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

export const useCesareChat = ({
  activeSessionId,
  askCesare,
  pageContext,
  onAssistantResponse,
}: UseCesareChatArgs): UseCesareChat => {
  // Sessions load async; until the first id resolves we park the thread under a
  // stable sentinel so a message sent before sessions hydrate is never lost.
  const sessionId = activeSessionId ?? "__pending__";
  const [state, dispatch] = useReducer(
    chatReducer,
    sessionId,
    initialChatState,
  );

  // Keep the active session id in a ref so the async send pipeline always
  // dispatches against the session the bubble was created under — a swap
  // mid-flight must not redirect the reply into the wrong thread.
  const stateRef = useRef<ChatState>(state);
  stateRef.current = state;

  const selectSession = useCallback((next: string) => {
    dispatch({ type: "session/select", sessionId: next });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      // The bubble is owned by whichever session is active at submit time.
      const targetSession = stateRef.current.activeSessionId;
      const userMessageId = newId();
      const assistantMessageId = newId();

      // A1: append both bubbles synchronously — they cannot be wiped by a swap.
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

      // History excludes the just-sent bubble (the server appends `message`).
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

      // A2: prefer the streamed transport. Step events feed the live trace; the
      // terminal `done` carries the final reply (with legacy markers intact).
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

      // Fallback to the non-streaming server fn when the stream produced no
      // usable reply (transport down, or server emitted an `error` event).
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
    [askCesare, onAssistantResponse, pageContext],
  );

  const messages = activeThread(state);
  // Loading is state-driven (reactive): any assistant bubble still `pending`
  // means a turn is in flight in the visible thread.
  const isLoading = messages.some(
    (m) => m.role === "assistant" && m.status === "pending",
  );

  return {
    messages,
    isLoading,
    send,
    selectSession,
  };
};
