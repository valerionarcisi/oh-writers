import { describe, it, expect } from "vitest";
import {
  chatReducer,
  initialChatState,
  activeThread,
  threadFor,
  lastUserMessage,
  type ChatMessage,
  type ChatState,
} from "./use-cesare-chat-reducer";

const SESSION_A = "session-a";
const SESSION_B = "session-b";

const send = (
  state: ChatState,
  sessionId: string,
  content: string,
  ids: { user: string; assistant: string },
): ChatState =>
  chatReducer(state, {
    type: "message/send",
    sessionId,
    userMessageId: ids.user,
    assistantMessageId: ids.assistant,
    content,
  });

describe("chatReducer — message lifecycle (A1)", () => {
  it("appends an optimistic user bubble + pending assistant bubble", () => {
    const state = send(initialChatState(SESSION_A), SESSION_A, "Ciao", {
      user: "u1",
      assistant: "a1",
    });
    const thread = activeThread(state);
    expect(thread).toHaveLength(2);
    expect(thread[0]).toMatchObject({
      id: "u1",
      role: "user",
      content: "Ciao",
      status: "pending",
    });
    expect(thread[1]).toMatchObject({
      id: "a1",
      role: "assistant",
      status: "pending",
    });
  });

  it("marks both bubbles delivered with the final reply", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "Ciao", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "message/delivered",
      sessionId: SESSION_A,
      userMessageId: "u1",
      assistantMessageId: "a1",
      content: "Risposta",
    });
    const thread = activeThread(state);
    expect(thread[0]?.status).toBe("delivered");
    expect(thread[1]).toMatchObject({
      status: "delivered",
      content: "Risposta",
    });
  });

  it("marks the user bubble failed on a failed send", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "Ciao", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "message/failed",
      sessionId: SESSION_A,
      userMessageId: "u1",
      assistantMessageId: "a1",
      content: "Errore",
    });
    const thread = activeThread(state);
    expect(thread[0]?.status).toBe("failed");
    expect(thread[1]).toMatchObject({ status: "delivered", content: "Errore" });
  });

  it("NEVER wipes an in-flight bubble when the session is swapped mid-flight", () => {
    // Send on session A, then swap to B BEFORE the reply lands.
    let state = send(initialChatState(SESSION_A), SESSION_A, "In volo", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "session/select",
      sessionId: SESSION_B,
    });

    // Session B shows a clean thread …
    expect(activeThread(state)).toHaveLength(0);
    // … but session A's in-flight bubble is intact.
    expect(threadFor(state, SESSION_A)).toHaveLength(2);
    expect(threadFor(state, SESSION_A)[0]?.content).toBe("In volo");

    // The reply still lands on session A even though B is active.
    state = chatReducer(state, {
      type: "message/delivered",
      sessionId: SESSION_A,
      userMessageId: "u1",
      assistantMessageId: "a1",
      content: "Atterrato",
    });
    expect(threadFor(state, SESSION_A)[1]?.content).toBe("Atterrato");

    // Swapping back restores the full thread.
    state = chatReducer(state, {
      type: "session/select",
      sessionId: SESSION_A,
    });
    expect(activeThread(state)).toHaveLength(2);
  });
});

describe("chatReducer — live trace (A2)", () => {
  it("accumulates reading/writing steps onto the in-flight assistant bubble", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "Genera sinossi", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "stream/step",
      sessionId: SESSION_A,
      assistantMessageId: "a1",
      event: {
        _tag: "reading",
        entity: { domain: "screenplay", label: "Sceneggiatura" },
      },
    });
    state = chatReducer(state, {
      type: "stream/step",
      sessionId: SESSION_A,
      assistantMessageId: "a1",
      event: {
        _tag: "writing",
        entity: { domain: "synopsis", label: "Sinossi" },
      },
    });
    const assistant = activeThread(state)[1];
    expect(assistant?.trace).toHaveLength(2);
    expect(assistant?.trace[0]).toMatchObject({
      kind: "reading",
      entity: { domain: "screenplay" },
    });
    // Cross-domain: read screenplay → write synopsis.
    expect(assistant?.trace[1]).toMatchObject({
      kind: "writing",
      entity: { domain: "synopsis" },
    });
  });

  it("collapses repeated writing steps for the same entity into ONE (N-26)", () => {
    let state = send(
      initialChatState(SESSION_A),
      SESSION_A,
      "mi scrivi la logline?",
      { user: "u1", assistant: "a1" },
    );
    // The server emits `writing{logline}` once per stream chunk / model
    // iteration; here it arrives three times back-to-back for the same entity.
    for (let i = 0; i < 3; i++) {
      state = chatReducer(state, {
        type: "stream/step",
        sessionId: SESSION_A,
        assistantMessageId: "a1",
        event: {
          _tag: "writing",
          entity: { domain: "logline", label: "Logline" },
        },
      });
    }
    const assistant = activeThread(state)[1];
    // One clean step per phase — the step itself is preserved (tracer invariant),
    // the duplication is gone.
    expect(assistant?.trace).toHaveLength(1);
    expect(assistant?.trace[0]).toMatchObject({
      kind: "writing",
      entity: { domain: "logline" },
    });
  });

  it("keeps distinct phases even when adjacent (reading → writing → tool)", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "x", {
      user: "u1",
      assistant: "a1",
    });
    const events: ReadonlyArray<
      Extract<
        Parameters<typeof chatReducer>[1],
        { type: "stream/step" }
      >["event"]
    > = [
      { _tag: "reading", entity: { domain: "soggetto", label: "Soggetto" } },
      { _tag: "writing", entity: { domain: "logline", label: "Logline" } },
      { _tag: "tool", name: "write_logline" },
    ];
    for (const event of events) {
      state = chatReducer(state, {
        type: "stream/step",
        sessionId: SESSION_A,
        assistantMessageId: "a1",
        event,
      });
    }
    expect(activeThread(state)[1]?.trace).toHaveLength(3);
  });

  it("collapses repeated reasoning steps with identical text (N-26)", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "x", {
      user: "u1",
      assistant: "a1",
    });
    for (let i = 0; i < 2; i++) {
      state = chatReducer(state, {
        type: "stream/step",
        sessionId: SESSION_A,
        assistantMessageId: "a1",
        event: { _tag: "reasoning", text: "Sto pensando" },
      });
    }
    expect(activeThread(state)[1]?.trace).toHaveLength(1);
  });

  it("ignores terminal done/error events in the trace reducer", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "x", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "stream/step",
      sessionId: SESSION_A,
      assistantMessageId: "a1",
      event: { _tag: "done", result: "ok", toolsExecuted: 1 },
    });
    expect(activeThread(state)[1]?.trace).toHaveLength(0);
  });
});

// Task 4 (streaming) — text-delta events append token chunks onto the
// in-flight assistant bubble's content, so MessageView can render partial
// text as it arrives (see CesareConversation.tsx's pending-with-content
// branch) instead of only showing the trace.
describe("chatReducer — text-delta streaming (Task 4)", () => {
  it("appends successive text-delta chunks onto the assistant bubble's content", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "Ciao", {
      user: "u1",
      assistant: "a1",
    });
    for (const chunk of ["Cia", "o! ", "Come", " va?"]) {
      state = chatReducer(state, {
        type: "stream/step",
        sessionId: SESSION_A,
        assistantMessageId: "a1",
        event: { _tag: "text-delta", text: chunk },
      });
    }
    expect(activeThread(state)[1]?.content).toBe("Ciao! Come va?");
  });

  it("does not touch the trace when accumulating text-delta", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "x", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "stream/step",
      sessionId: SESSION_A,
      assistantMessageId: "a1",
      event: {
        _tag: "reading",
        entity: { domain: "soggetto", label: "Soggetto" },
      },
    });
    state = chatReducer(state, {
      type: "stream/step",
      sessionId: SESSION_A,
      assistantMessageId: "a1",
      event: { _tag: "text-delta", text: "Un frammento." },
    });
    const assistant = activeThread(state)[1];
    expect(assistant?.trace).toHaveLength(1);
    expect(assistant?.content).toBe("Un frammento.");
  });

  it("message/delivered overwrites the accumulated streamed content with the final authoritative text", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "x", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "stream/step",
      sessionId: SESSION_A,
      assistantMessageId: "a1",
      event: { _tag: "text-delta", text: "parziale" },
    });
    state = chatReducer(state, {
      type: "message/delivered",
      sessionId: SESSION_A,
      userMessageId: "u1",
      assistantMessageId: "a1",
      content: "Risposta finale completa.",
    });
    const assistant = activeThread(state)[1];
    expect(assistant?.content).toBe("Risposta finale completa.");
    expect(assistant?.status).toBe("delivered");
  });
});

// [OHW-051] — hydration of a session thread from persisted history.

const persisted = (id: string, content: string): ChatMessage => ({
  id,
  role: "user",
  content,
  status: "delivered",
  trace: [],
});

describe("chatReducer — thread/hydrate (Spec 51)", () => {
  it("fills an empty thread with the persisted messages", () => {
    const state = chatReducer(initialChatState(SESSION_A), {
      type: "thread/hydrate",
      sessionId: SESSION_A,
      messages: [persisted("m1", "Ciao"), persisted("m2", "Come va")],
    });
    expect(threadFor(state, SESSION_A)).toHaveLength(2);
    expect(threadFor(state, SESSION_A)[0]).toMatchObject({
      id: "m1",
      content: "Ciao",
      status: "delivered",
    });
  });

  it("is a no-op when the thread already has messages (never clobbers in-flight)", () => {
    const withBubble = send(initialChatState(SESSION_A), SESSION_A, "live", {
      user: "u1",
      assistant: "a1",
    });
    const after = chatReducer(withBubble, {
      type: "thread/hydrate",
      sessionId: SESSION_A,
      messages: [persisted("m1", "stale persisted")],
    });
    expect(after).toBe(withBubble);
    expect(threadFor(after, SESSION_A)).toHaveLength(2);
  });

  it("hydrates a non-active session without changing the active one", () => {
    const state = chatReducer(initialChatState(SESSION_A), {
      type: "thread/hydrate",
      sessionId: SESSION_B,
      messages: [persisted("m1", "altro")],
    });
    expect(state.activeSessionId).toBe(SESSION_A);
    expect(threadFor(state, SESSION_B)).toHaveLength(1);
  });
});

describe("lastUserMessage (composer ArrowUp recall)", () => {
  it("returns undefined for an empty thread", () => {
    expect(lastUserMessage([])).toBeUndefined();
  });

  it("returns the only user message in a single-turn thread", () => {
    const state = send(initialChatState(SESSION_A), SESSION_A, "Ciao", {
      user: "u1",
      assistant: "a1",
    });
    expect(lastUserMessage(activeThread(state))?.content).toBe("Ciao");
  });

  it("returns the MOST RECENT user turn across a multi-turn thread", () => {
    let state = send(initialChatState(SESSION_A), SESSION_A, "Prima domanda", {
      user: "u1",
      assistant: "a1",
    });
    state = chatReducer(state, {
      type: "message/delivered",
      sessionId: SESSION_A,
      userMessageId: "u1",
      assistantMessageId: "a1",
      content: "Prima risposta",
    });
    state = send(state, SESSION_A, "Seconda domanda", {
      user: "u2",
      assistant: "a2",
    });
    expect(lastUserMessage(activeThread(state))?.content).toBe(
      "Seconda domanda",
    );
  });
});
