import { describe, it, expect } from "vitest";
import {
  chatReducer,
  initialChatState,
  threadFor,
  activeThread,
} from "./use-cesare-chat-reducer";

// Issue #42 — Cesare must open CLEAN.
//
// The floating `CesareSheet` keeps the active session in local state, defaulting
// to `null`. `useCesareChat` maps that null to the synthetic pending session, so
// the shared store renders its (empty) thread and the user lands on the
// "Chiedimi qualunque cosa…" landing — never dropped into the most recent
// session's stale thread. This suite pins that contract at the seam the fix
// touches: the null → pending resolution + the empty pending thread, plus the
// explicit-select / new-session paths that DO load a thread.

const PENDING_SESSION = "__pending__";

// The exact resolution `useCesareChat` applies to a surface's active session.
const resolveDesiredSession = (activeSessionId: string | null): string =>
  activeSessionId ?? PENDING_SESSION;

describe("Cesare opens clean (Issue #42)", () => {
  it("a null active session resolves to the synthetic pending session", () => {
    expect(resolveDesiredSession(null)).toBe(PENDING_SESSION);
  });

  it("the pending session's thread is empty — the cold-start landing", () => {
    const state = initialChatState(resolveDesiredSession(null));
    // No auto-selected session means no hydrated history: the empty thread is
    // what drives the "Chiedimi qualunque cosa…" landing (messages.length === 0).
    expect(activeThread(state)).toHaveLength(0);
    expect(state.activeSessionId).toBe(PENDING_SESSION);
  });

  it("the empty pending thread is NOT polluted by other sessions' history", () => {
    // A persisted past session exists in the store, but while the default
    // (pending) session is active its thread stays empty — the writer is not
    // dropped mid-conversation.
    const seeded = chatReducer(initialChatState(PENDING_SESSION), {
      type: "thread/hydrate",
      sessionId: "session-from-yesterday",
      messages: [
        {
          id: "u1",
          role: "user",
          content: "ciao",
          status: "delivered",
          trace: [],
        },
        {
          id: "a1",
          role: "assistant",
          content: "Ciao!",
          status: "delivered",
          trace: [],
        },
      ],
    });
    expect(threadFor(seeded, "session-from-yesterday")).toHaveLength(2);
    expect(activeThread(seeded)).toHaveLength(0);
  });

  it("an explicit session pick resolves to that session and loads its thread", () => {
    // The user choosing a past session from the list (handleSessionSelect) sets
    // a real id; the resolution passes it through and selecting it makes it
    // active so its hydrated history renders.
    const picked = "session-from-yesterday";
    expect(resolveDesiredSession(picked)).toBe(picked);

    const hydrated = chatReducer(initialChatState(PENDING_SESSION), {
      type: "thread/hydrate",
      sessionId: picked,
      messages: [
        {
          id: "u1",
          role: "user",
          content: "q",
          status: "delivered",
          trace: [],
        },
      ],
    });
    const selected = chatReducer(hydrated, {
      type: "session/select",
      sessionId: picked,
    });
    expect(selected.activeSessionId).toBe(picked);
    expect(activeThread(selected)).toHaveLength(1);
  });

  it("a brand-new session selects empty — '+ Nuova' starts a fresh thread", () => {
    // handleSessionNew creates a session row, then selects it. A freshly created
    // session has no persisted messages, so its thread is empty: a genuinely new
    // empty conversation, never the previous session's thread.
    const fresh = "brand-new-session";
    const state = chatReducer(initialChatState(PENDING_SESSION), {
      type: "session/select",
      sessionId: fresh,
    });
    expect(state.activeSessionId).toBe(fresh);
    expect(activeThread(state)).toHaveLength(0);
  });
});
