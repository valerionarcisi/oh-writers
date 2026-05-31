// apps/web/app/features/predictions/use-cesare-chat-reducer.ts
//
// Spec 47a (A1 + A2) — pure reducer for the Cesare chat lifecycle.
//
// Owns three responsibilities behind one narrow interface:
//   - A1: optimistic user bubbles with a delivery status
//         (`pending | delivered | failed`), namespaced PER SESSION so a session
//         swap can never wipe an in-flight bubble.
//   - A2: a live trace (reading/writing/reasoning steps) attached to the
//         in-flight assistant turn as stream events arrive.
//
// Kept pure (no React, no DOM, no fetch) so Vitest can exercise every
// transition without a browser.
import { match } from "ts-pattern";
import type { CesareStreamEvent, EntityRef } from "./cesare-stream-events";

export type MessageStatus = "pending" | "delivered" | "failed";

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly status: MessageStatus;
  /** Live trace steps for an assistant turn (A2). Empty for user bubbles. */
  readonly trace: ReadonlyArray<TraceStep>;
}

export interface TraceStep {
  readonly kind: "reasoning" | "reading" | "writing" | "tool";
  /** Resolved entity for reading/writing steps; null for reasoning/tool. */
  readonly entity: EntityRef | null;
  /** Reasoning text or tool name. */
  readonly text: string;
}

// State is keyed by session id so each thread is isolated. The active session's
// thread is what the UI renders; a swap only changes `activeSessionId`.
export interface ChatState {
  readonly activeSessionId: string;
  readonly threads: Readonly<Record<string, ReadonlyArray<ChatMessage>>>;
}

export type ChatAction =
  | { readonly type: "session/select"; readonly sessionId: string }
  | {
      // Spec 51 — replace an EMPTY session thread with the persisted history
      // loaded on open. Hydrate is a no-op when the thread already has messages
      // so a slower load round-trip never clobbers an in-flight optimistic
      // bubble or a thread the user is already chatting in.
      readonly type: "thread/hydrate";
      readonly sessionId: string;
      readonly messages: ReadonlyArray<ChatMessage>;
    }
  | {
      readonly type: "message/send";
      readonly sessionId: string;
      readonly userMessageId: string;
      readonly assistantMessageId: string;
      readonly content: string;
    }
  | {
      readonly type: "stream/step";
      readonly sessionId: string;
      readonly assistantMessageId: string;
      readonly event: CesareStreamEvent;
    }
  | {
      readonly type: "message/delivered";
      readonly sessionId: string;
      readonly userMessageId: string;
      readonly assistantMessageId: string;
      readonly content: string;
    }
  | {
      readonly type: "message/failed";
      readonly sessionId: string;
      readonly userMessageId: string;
      readonly assistantMessageId: string;
      readonly content: string;
    };

export const initialChatState = (activeSessionId: string): ChatState => ({
  activeSessionId,
  threads: {},
});

export const threadFor = (
  state: ChatState,
  sessionId: string,
): ReadonlyArray<ChatMessage> => state.threads[sessionId] ?? [];

export const activeThread = (state: ChatState): ReadonlyArray<ChatMessage> =>
  threadFor(state, state.activeSessionId);

// ─── Helpers (immutable) ──────────────────────────────────────────────────────

const withThread = (
  state: ChatState,
  sessionId: string,
  next: ReadonlyArray<ChatMessage>,
): ChatState => ({
  ...state,
  threads: { ...state.threads, [sessionId]: next },
});

const mapMessage = (
  thread: ReadonlyArray<ChatMessage>,
  id: string,
  fn: (m: ChatMessage) => ChatMessage,
): ReadonlyArray<ChatMessage> => thread.map((m) => (m.id === id ? fn(m) : m));

const traceStepForEvent = (event: CesareStreamEvent): TraceStep | null =>
  match(event)
    .with({ _tag: "reasoning" }, (e) => ({
      kind: "reasoning" as const,
      entity: null,
      text: e.text,
    }))
    .with({ _tag: "reading" }, (e) => ({
      kind: "reading" as const,
      entity: e.entity,
      text: e.entity.label,
    }))
    .with({ _tag: "writing" }, (e) => ({
      kind: "writing" as const,
      entity: e.entity,
      text: e.entity.label,
    }))
    .with({ _tag: "tool" }, (e) => ({
      kind: "tool" as const,
      entity: null,
      text: e.name,
    }))
    .with({ _tag: "done" }, () => null)
    .with({ _tag: "error" }, () => null)
    .exhaustive();

// ─── Reducer ───────────────────────────────────────────────────────────────────

export const chatReducer = (state: ChatState, action: ChatAction): ChatState =>
  match(action)
    .with({ type: "session/select" }, ({ sessionId }) => ({
      ...state,
      activeSessionId: sessionId,
    }))
    .with({ type: "thread/hydrate" }, (a) => {
      const existing = threadFor(state, a.sessionId);
      if (existing.length > 0) return state;
      return withThread(state, a.sessionId, a.messages);
    })
    .with({ type: "message/send" }, (a) => {
      const thread = threadFor(state, a.sessionId);
      const userBubble: ChatMessage = {
        id: a.userMessageId,
        role: "user",
        content: a.content,
        status: "pending",
        trace: [],
      };
      const assistantBubble: ChatMessage = {
        id: a.assistantMessageId,
        role: "assistant",
        content: "",
        status: "pending",
        trace: [],
      };
      return withThread(state, a.sessionId, [
        ...thread,
        userBubble,
        assistantBubble,
      ]);
    })
    .with({ type: "stream/step" }, (a) => {
      const step = traceStepForEvent(a.event);
      if (!step) return state;
      const thread = threadFor(state, a.sessionId);
      return withThread(
        state,
        a.sessionId,
        mapMessage(thread, a.assistantMessageId, (m) => ({
          ...m,
          trace: [...m.trace, step],
        })),
      );
    })
    .with({ type: "message/delivered" }, (a) => {
      const thread = threadFor(state, a.sessionId);
      const delivered = mapMessage(thread, a.userMessageId, (m) => ({
        ...m,
        status: "delivered",
      }));
      return withThread(
        state,
        a.sessionId,
        mapMessage(delivered, a.assistantMessageId, (m) => ({
          ...m,
          content: a.content,
          status: "delivered",
        })),
      );
    })
    .with({ type: "message/failed" }, (a) => {
      const thread = threadFor(state, a.sessionId);
      const failed = mapMessage(thread, a.userMessageId, (m) => ({
        ...m,
        status: "failed",
      }));
      return withThread(
        state,
        a.sessionId,
        mapMessage(failed, a.assistantMessageId, (m) => ({
          ...m,
          content: a.content,
          status: "delivered",
        })),
      );
    })
    .exhaustive();
