# Spec 53 — Session naming + inline rename + delete-with-modal

Status: **Planned** · Decided 2026-05-31 (PO).

## Context

Cesare sessions (`cesare_sessions`, spec 44/46; messages persisted in spec 51) exist with full
server fns (`createSession`, `renameSession`, `deleteSession` in `sessions.server.ts`) but the UI and
the auto-naming are missing. Three gaps:

1. **Session title is static** — new sessions get `DEFAULT_NEW_SESSION_TITLE` / "Sessione principale".
   The user wants the title derived from the first request, like Notion ("Aggiungi tre film").
2. **No inline rename** in the LeftRail session list — the `renameSession` server fn exists but no UI.
3. **No delete affordance** — `deleteSession` exists but no UI, and delete must use a **confirmation
   modal** (it's destructive).

(Not in scope: the `ChangeTrace` "N passaggi" expand already works — collapsible, default-collapsed,
click to expand. Left as-is per the PO.)

## 1. Session title from the first request (Notion-style)

When a session's FIRST user message lands, set the session title from that message — a short,
one-line summary (NOT an extra LLM call; cost discipline):

- Take the first user message, trim/normalise whitespace, strip a trailing question mark if it makes
  it cleaner, cap to ~40 chars on a word boundary (e.g. "Fammi un v2 del soggetto" → "V2 del
  soggetto…" or the verbatim first clause).
- Only set it when the session still has the default placeholder title (don't overwrite a
  user-renamed title). Apply once, on the first message.
- Persist via the existing `renameSession` server fn (or fold into the first `persistTurn`).
- Pure title-derivation function (testable, no I/O) in a sensible place; the persistence is the
  existing server fn.

## 2. Inline rename in the LeftRail

- The session row in `LeftRail` (`SessionItemButton`) gets a rename affordance (a `…` / context
  action, or double-click to edit) that turns the title into an inline editable input (react-aria —
  mandatory; e.g. a controlled input with `useTextField`), Enter/blur commits via `renameSession`,
  Esc cancels. Optimistic update through `useSessions`'s existing rename mutation.
- The active session highlight + the central session route title update reactively.

## 3. Delete with confirmation modal

- A delete affordance on the session row (same `…` menu or a trailing button) opens a **confirmation
  modal** (DS Dialog / react-aria `useDialog` — mandatory, no `window.confirm`): "Eliminare la
  sessione «<title>»? L'azione non è reversibile." with Annulla / Elimina.
- Confirm → `deleteSession` via the existing mutation; the row leaves the list; if the deleted
  session was the open one, navigate away (to `/sessions` or the project). Messages cascade-delete
  (the `cesare_messages` FK is `ON DELETE CASCADE`, spec 51).

## Reuse

- Server fns: `createSession` / `renameSession` / `deleteSession` + the `useSessions` mutations
  (`useSessions.ts`) — all exist.
- DS Dialog + react-aria for the modal + the inline input.
- The rail session list + the central session route + the floating drawer's session selector all read
  the same sessions context — titles/rename/delete reflect everywhere.

## Tests (OHW-053)

- First message sets the session title from that message (≤ ~40 chars, word boundary); a second
  message does NOT change it; a user-renamed title is never overwritten by auto-naming.
- Inline rename: double-click/`…`→rename → edit → Enter commits (title updates in rail + route);
  Esc cancels.
- Delete: `…`→delete opens the confirmation modal; Annulla closes without deleting; Elimina removes
  the session (and navigates away if it was open); messages cascade-deleted.
- Pure title-derivation function unit-tested (whitespace, length cap, trailing `?`, word boundary).

## Out of scope

- AI-generated session titles (rejected — first-request derivation, no extra LLM call).
- Changing the `ChangeTrace` expand default (stays collapsed).
