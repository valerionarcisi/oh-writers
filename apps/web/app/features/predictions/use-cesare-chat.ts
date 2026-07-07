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
import { useCesareChatStore, type CesareTurnSettle } from "./cesare-chat-store";
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
  /** BUG-066 — turn lifecycle for the bell: start returns a correlation
   *  token; settled receives it back when the same turn ends. */
  readonly onTurnStart?: () => string | null;
  readonly onTurnSettled?: (settle: CesareTurnSettle) => void;
}

export interface UseCesareChat {
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly isLoading: boolean;
  /** Send a message. An explicit `sessionId` targets that session directly
   *  (used to send into a just-created session without a render round-trip). */
  readonly send: (text: string, sessionId?: string) => Promise<void>;
  readonly selectSession: (sessionId: string) => void;
  /** Abort the in-flight turn (composer's ⏸ button). No-op outside a
   *  `CesareChatStoreProvider` — the local fallback has no cancellable stream. */
  readonly stop: (sessionId?: string) => void;
}

export const useCesareChat = (args: UseCesareChatArgs): UseCesareChat => {
  const store = useCesareChatStore();
  const local = useLocalCesareChat(args, store !== null);

  // Publish the live transport + page context so the store's `send` (used by
  // BOTH the floating composer and the full-page composer) always targets the
  // page the user currently has open.
  const {
    askCesare,
    pageContext,
    onAssistantResponse,
    onTurnStart,
    onTurnSettled,
  } = args;
  // Keep the latest deps in a ref so the publish effect never depends on the
  // (per-render-new) identity of `pageContext` / the callbacks. Depending on
  // those identities made `setSendDeps` → store setState → re-render → new
  // identities → effect re-fires → infinite "Maximum update depth" loop on the
  // Cesare peek surface. The effect now re-fires ONLY when the page context's
  // primitive VALUES change (serialised key), and reads the freshest deps from
  // the ref at publish time.
  const sendDeps = {
    askCesare,
    pageContext,
    onAssistantResponse,
    onTurnStart,
    onTurnSettled,
  };
  const sendDepsRef = useRef(sendDeps);
  sendDepsRef.current = sendDeps;
  const pageContextKey = JSON.stringify(pageContext);
  // The store object's IDENTITY changes on every state change (its memo depends
  // on the reducer state). Depending on `store` here would re-fire the publish
  // effect on every store mutation — and `setSendDeps` calls `setActivePage`,
  // which re-renders the provider, which re-creates `store`, which re-fires this
  // effect: an infinite "Maximum update depth" loop (Bug 3a — surfaced when
  // switching sessions in the Cesare split, store.tsx:158 ← use-cesare-chat:88).
  // `setSendDeps` is a stable `useCallback([])`, so read it through a ref and
  // depend ONLY on the serialised page-context values. The effect then fires once
  // per genuine page-context change, never on store-identity churn.
  const storeRef = useRef(store);
  storeRef.current = store;
  useEffect(() => {
    storeRef.current?.setSendDeps(sendDepsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageContextKey]);

  // Keep the store's active session in sync with this surface's selection. Read
  // the store through the ref for the same reason as above: depending on `store`
  // would re-run this on every store-identity churn. `selectSession` short-
  // circuits when the store is already on `desiredSession`, so the only trigger
  // we care about is a genuine change of THIS surface's desired session.
  const desiredSession = args.activeSessionId ?? "__pending__";
  useEffect(() => {
    const s = storeRef.current;
    if (!s) return;
    if (s.activeSessionId !== desiredSession) {
      s.selectSession(desiredSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredSession]);

  // `send` / `selectSession` are returned to consumers that list them in effect
  // dependency arrays (e.g. CesareSheet's focused-session adoption effect). They
  // MUST be referentially STABLE across renders, or every store-identity churn
  // re-fires those effects — re-entering the same loop family. Bind through the
  // store ref so the identity never changes while the methods always reach the
  // freshest store.
  const storeSend = useCallback(async (text: string, sessionId?: string) => {
    await storeRef.current?.send(text, sessionId);
  }, []);
  const storeSelect = useCallback(
    (sessionId: string) => storeRef.current?.selectSession(sessionId),
    [],
  );

  const storeStop = useCallback((sessionId?: string) => {
    storeRef.current?.stop(sessionId);
  }, []);

  if (store) {
    return {
      messages: store.activeMessages,
      isLoading: store.isLoadingFor(store.activeSessionId),
      send: storeSend,
      selectSession: storeSelect,
      stop: storeStop,
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
    onTurnStart,
    onTurnSettled,
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
    async (text: string, sessionIdOverride?: string) => {
      if (inert) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      const targetSession =
        sessionIdOverride ?? stateRef.current.activeSessionId;
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

      // BUG-066 — mirror the shared store's turn lifecycle so the bell
      // behaves identically outside a provider (isolated tests/Storybook).
      const turnToken = onTurnStart?.() ?? null;

      // Cap to the most recent 20 turns: spec 51 persists messages, so a long
      // session can exceed the server's `max(20)` on `conversationHistory`.
      // Send only the latest 20 (newest context) so a long thread never fails
      // Zod validation.
      const history = activeThread(stateRef.current)
        .filter((m) => m.id !== userMessageId && m.id !== assistantMessageId)
        .filter((m) => m.content.length > 0)
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-20);

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
        onTurnSettled?.({
          token: turnToken,
          outcome: "delivered",
          reply: finalReply,
        });
      } else {
        dispatch({
          type: "message/failed",
          sessionId: targetSession,
          userMessageId,
          assistantMessageId,
          content: FAILURE_TEXT,
        });
        onTurnSettled?.({ token: turnToken, outcome: "failed", reply: null });
      }
    },
    [
      inert,
      askCesare,
      onAssistantResponse,
      pageContext,
      onTurnStart,
      onTurnSettled,
    ],
  );

  const messages = activeThread(state);
  const isLoading = messages.some(
    (m) => m.role === "assistant" && m.status === "pending",
  );

  // ponytail: no-op — the local fallback has no in-flight request to cancel
  // (no store, no AbortController); real stop needs a CesareChatStoreProvider.
  const stop = useCallback(() => {}, []);

  return { messages, isLoading, send, selectSession, stop };
};
