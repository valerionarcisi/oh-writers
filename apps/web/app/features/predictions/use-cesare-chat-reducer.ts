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

/** Most recent user turn in a thread — the composer's ArrowUp recall gesture. */
export const lastUserMessage = (
  thread: ReadonlyArray<ChatMessage>,
): ChatMessage | undefined =>
  [...thread].reverse().find((m) => m.role === "user");

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
    // text-delta is not a trace step — handled separately in the reducer
    // (appended to the message's content, see the "stream/step" case below).
    .with({ _tag: "text-delta" }, () => null)
    .with({ _tag: "done" }, () => null)
    .with({ _tag: "error" }, () => null)
    .exhaustive();

/**
 * Two trace steps describe the SAME phase when they share a kind and the same
 * entity domain (reading/writing) — or, for entity-less steps (reasoning/tool),
 * the same text. The server emits one step per completed tool call, but a single
 * agentic edit can run the same writing tool across several model iterations (or
 * stream the same phase in chunks), which would otherwise stack many identical
 * `writing{logline}` rows. N-26 collapses those into one clean step per phase.
 */
const isSamePhase = (a: TraceStep, b: TraceStep): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.entity || b.entity) {
    return a.entity?.domain === b.entity?.domain;
  }
  return a.text === b.text;
};

/**
 * Append a trace step, collapsing a consecutive duplicate of the SAME phase so
 * the live trace shows ONE clear step per phase (N-26). The step is never
 * dropped from the trace as a whole — only a back-to-back repeat of the phase
 * already at the tail is folded — so the tracer invariant (reading → reasoning →
 * writing → tool → done) is preserved; the duplication is what goes away.
 */
const appendTraceStep = (
  trace: ReadonlyArray<TraceStep>,
  step: TraceStep,
): ReadonlyArray<TraceStep> => {
  const last = trace[trace.length - 1];
  if (last && isSamePhase(last, step)) return trace;
  return [...trace, step];
};

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
      // Task 4 (streaming) — text-delta appends to the assistant bubble's
      // content as tokens arrive, so MessageView can render partial text
      // instead of only the trace while the turn is still in flight. Every
      // other event still only affects the trace (unchanged).
      if (a.event._tag === "text-delta") {
        const delta = a.event.text;
        const thread = threadFor(state, a.sessionId);
        return withThread(
          state,
          a.sessionId,
          mapMessage(thread, a.assistantMessageId, (m) => ({
            ...m,
            content: m.content + delta,
          })),
        );
      }
      const step = traceStepForEvent(a.event);
      if (!step) return state;
      const thread = threadFor(state, a.sessionId);
      return withThread(
        state,
        a.sessionId,
        mapMessage(thread, a.assistantMessageId, (m) => ({
          ...m,
          trace: appendTraceStep(m.trace, step),
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
