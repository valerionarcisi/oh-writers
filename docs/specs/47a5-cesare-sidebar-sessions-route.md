# Spec 47-A5 — Cesare sidebar entry + central Sessions route

Sub-spec of [Spec 47 — Cesare Fix Fleet](47-cesare-fix-fleet.md), agent **A5**.
Builds on the sessions route contract in [Spec 46](46-split-drawer.md).

## Goal

1. A LeftRail entry dedicated to Cesare that opens the **full Cesare sessions
   landing** (`/projects/:id/sessions`).
2. Clicking a **session** (rail row or landing row) opens its full conversation
   at the central route `/projects/:id/sessions/:sessionId` — a real,
   deep-linkable route that replaces the main content. **Not** a `?peek=`.
3. The landing lists the project's sessions with a "+ Nuova" affordance.

## Routes added

- `_app.projects.$id_.sessions.tsx` — sessions landing (index). Lists sessions,
  "+ Nuova", click → central session route.
- `_app.projects.$id_.sessions.$sessionId.tsx` — central full conversation.
  The page validates the `sessionId` param (Zod uuid) and runs the
  ownership/same-project guard via `getSession`. Fail closed → not-found body,
  no leaked content.

Both routes escape the `/_app/projects/$id` layout (`$id_`) so the central area
is fully replaced (the project overview layout does not wrap them).

## Server

`getSession` (new) in `sessions.server.ts`:

- `.validator(GetSessionInput)` — `{ id: uuid, projectId: uuid }`.
- Looks up the row by id, then `withProjectAccess(projectId, "view")`.
- Guard (fail closed): the session is returned **only** when
  `row.userId === access.user.id` **and** `row.projectId === input.projectId`.
  Any mismatch → `CesareSessionNotFoundError` (never a different error that
  could leak existence/ownership). A non-existent id → same not-found.

The guard predicate (`ownsSession`) is a pure function, unit-tested in isolation.

`useSession(projectId, sessionId)` query binding + `sessionQueryOptions` for the
route loader/prefetch.

## Reconciliation with the floating CesareDrawer (authoritative)

The floating `CesareDrawer` (spec 44) stays **authoritative** for the live
conversation + agentic edits — chat messages are its in-memory state and the
send path is owned elsewhere (A1). The central session route does **not** fork a
second chat container. Instead:

- A shell-level **`CesareSessionFocusProvider`** holds a `focusedSessionId`.
- The central route, on mount, sets the focused session id and requests Cesare
  to expand. `CesareSheet` reads the focus and adopts it as its active session
  (so the authoritative drawer shows that exact session's thread).
- The central lane renders a **Notion-AI-style session page**: session title,
  metadata, and a CTA into the focused conversation. One source of truth for
  messages; the route gives a real, deep-linkable central body.

## Tests (OHW-047-A5)

- `tests/cesare-sessions-route.spec.ts`
  - **Happy**: click rail Cesare entry → `/projects/:id/sessions` landing.
  - **Happy**: click a session → `/projects/:id/sessions/:sessionId`, central
    conversation surface renders; Cesare focuses that session.
  - **Happy**: deep-link straight to `/sessions/:sessionId` renders the session.
  - **Sad**: a foreign / non-existent `sessionId` → not-found body, no session
    title or message content leaked.
- Vitest `sessions.guard.test.ts` — the `ownsSession` guard:
  owner+same-project pass; foreign user reject; cross-project reject. Plus the
  `GetSessionInput` Zod schema: valid pass, non-uuid reject.

## Out of scope

- Persisting message history server-side (A1 owns persistence).
- SplitDrawer `?peek=` interplay (A4/A6).
