import { describe, it, expect } from "vitest";
import {
  chatReducer,
  initialChatState,
  activeThread,
  threadFor,
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
