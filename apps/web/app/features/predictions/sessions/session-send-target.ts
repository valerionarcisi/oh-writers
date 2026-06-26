// apps/web/app/features/predictions/sessions/session-send-target.ts
//
// Lazy session creation (Bug 3b): a Cesare session row is persisted ONLY once it
// has its first real turn. "Nuova sessione" therefore drops the drawer into the
// empty/pending state WITHOUT minting a row; the row is created on the FIRST
// send. This pure predicate is the single decision both paths share: given the
// currently-active session id, should the next send CREATE a new session first,
// or send into the existing one?
//
// Keeping it pure (no React, no server fn) makes the "never persist a 0-turn
// session" invariant unit-testable without a DB or a render.

/** The action the send pipeline must take for the active-session state. */
export type SessionSendTarget =
  | { readonly kind: "existing"; readonly sessionId: string }
  | { readonly kind: "create" };

/**
 * Decide whether a send targets the existing active session or must create one.
 *
 * - A non-empty `activeSessionId` → send into it (`existing`).
 * - `null` (the fresh/pending state after "Nuova sessione", or a project with no
 *   session yet) → `create`: the row is minted now, with this first message, so
 *   it is born with a turn and a derived title — never an empty placeholder.
 */
export function resolveSessionSendTarget(
  activeSessionId: string | null | undefined,
): SessionSendTarget {
  if (activeSessionId != null && activeSessionId.length > 0) {
    return { kind: "existing", sessionId: activeSessionId };
  }
  return { kind: "create" };
}
