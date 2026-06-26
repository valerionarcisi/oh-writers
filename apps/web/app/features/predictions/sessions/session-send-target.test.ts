// apps/web/app/features/predictions/sessions/session-send-target.test.ts
//
// The lazy-session-create invariant (Bug 3b): a session row is minted ONLY on
// the first real send, never eagerly on "Nuova sessione". This pure predicate is
// the single source of that decision, so a 0-turn placeholder can never be
// persisted.

import { describe, it, expect } from "vitest";
import { resolveSessionSendTarget } from "./session-send-target";

describe("resolveSessionSendTarget — lazy session creation (Bug 3b)", () => {
  it("sends into the existing session when one is active", () => {
    expect(resolveSessionSendTarget("sess-123")).toEqual({
      kind: "existing",
      sessionId: "sess-123",
    });
  });

  it("CREATES a session when none is active (null = fresh/pending state)", () => {
    // `null` is exactly the state "Nuova sessione" drops the drawer into: no row
    // exists yet, so the FIRST send must create one (born with a turn + title).
    expect(resolveSessionSendTarget(null)).toEqual({ kind: "create" });
  });

  it("CREATES a session for undefined (project with no session row yet)", () => {
    expect(resolveSessionSendTarget(undefined)).toEqual({ kind: "create" });
  });

  it("treats an empty-string id as no active session (creates)", () => {
    // Defensive: an empty id is not a real session, so it must not be sent into.
    expect(resolveSessionSendTarget("")).toEqual({ kind: "create" });
  });
});
