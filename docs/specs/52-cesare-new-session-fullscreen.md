# Spec 52 — New Cesare session: glowy landing (Notion AI style)

Status: **Built** · Decided 2026-05-31 (PO) · Implemented 2026-05-31 ·
**Revised 2026-06-05 (N-13): the landing lives INSIDE the AppShell — no focus
mode.**

## Implementation notes (as built)

- Route: `/projects/:id/sessions/new` (`_app.projects.$id_.sessions.new.tsx`) →
  `NewSessionLandingPage`. The static `new` segment wins over the dynamic
  `$sessionId` conversation route, so both are deep-linkable.
- **N-13 (2026-06-05): the landing no longer engages focus mode.** The original
  build called `useRequestShellFocus()` to hide the rail + top strip, which made
  the landing a bare full-screen takeover. The narrative walk flagged this: the
  new-session landing must keep the rail + TopBar present (consistent shell). The
  landing now simply renders inside the main content lane and centres the prompt
  there (`.page { flex: 1 1 auto; align-items/justify-content: center }`). No
  `data-shell="focus"`, no rail collapse. The glow ring was also softened (wider
  inset + heavier blur + lower opacity) so it reads as an ambient halo instead of
  a hard conic "X" painted through the composer.
- (Historic) Focus mode was previously engaged via `ShellFocusRequestProvider`
  (`shell-focus-request-context.tsx`) / `useRequestShellFocus()`; that provider
  still exists for other surfaces, but the new-session landing no longer uses it.
- The glow is a blurred, rotating conic-gradient ring (`--ds-agent` →
  `--ds-action`) behind the composer, pulsing its opacity; both animations are
  removed under `prefers-reduced-motion` (static ring).
- One chat container: the landing creates the session, pushes the first message
  through the shared `useCesareChatStore`, then routes to `/sessions/:sessionId`,
  which renders the same store thread. No second chat container, no replay.
- The rail "+ Nuova" and the `/sessions` landing "+ Nuova" both now route to
  `/sessions/new` (the session row is created on first send, not on click — no
  empty throwaway sessions).

## Context

Clicking **"Nuova sessione"** (or "+ Nuova") in the LeftRail must open a **full-screen Cesare page**
with a large, glowing centred input — the Notion AI "How can I help you today?" landing (the PO's
original Image #3 reference). Today (spec 47-A5) the rail's "+ Nuova" creates a session and routes to
`/sessions/:id`, which renders the conversation; there is no dedicated empty-state landing with the
big centred prompt.

## The experience

- Click "Nuova sessione" in the rail → navigate to the Cesare landing
  (`/projects/:id/sessions/new`, or `/sessions/:id` in its empty state).
- The page renders inside the AppShell (rail + TopBar present — N-13), centring the Cesare prompt
  vertically within the main lane, with:
  - the Cesare sparkle mark,
  - a heading ("Cosa scriviamo oggi?" / "Come posso aiutarti?" — Italian),
  - a **large, centred input** with the Notion-style **glow** (soft animated focus ring / gradient
    border), placeholder "Chiedi qualunque cosa a Cesare…",
  - a few quick-prompt suggestions below (start a logline, expand a scene, …).
- Typing + submit starts the session: the first message creates the `cesare_sessions` row (if not
  already) and the page transitions into the normal session conversation view (the input docks, the
  conversation grows above it) — same single chat container, no fork.

## Design

- **Glow**: a token-driven animated focus ring / gradient border (`--ds` tokens, no hardcoded hex;
  `--ds-duration` for the pulse). `prefers-reduced-motion` → static ring, no animation. Reuse the
  existing composer/input primitive; this is a larger, centred variant, not a new input.
- **Inside the shell (N-13, revised)**: the landing renders inside the AppShell main lane — the rail
  and TopBar stay present — and centres the Cesare prompt within that lane. It is NOT a focus-mode /
  full-screen takeover. Routed + deep-linkable (consistent with spec 49 "everything routed").
- **react-aria** for the input + quick-prompt buttons (mandatory). CSS Modules + tokens.
- **One chat container**: the landing input and the session conversation are the same Cesare chat
  surface in two layouts (empty centred → docked-with-history). Reuse `useCesareChat` /
  `CesareConversation`; do NOT create a second chat container.

## Relation to existing work

- `/sessions` landing + `/sessions/:id` conversation + the rail "+ Nuova" exist (spec 47-A5). Spec 52
  adds the **empty-state full-screen glowy landing** as the entry, and wires "+ Nuova" to it.
- The "write-from-zero with Cesare" next-step suggestions (spec 50) live naturally on this landing as
  the quick-prompts.
- Routed/deep-linkable per spec 49. (N-13: no longer uses spec 44 focus mode — the landing stays
  inside the shell.)

## Tests (OHW-052)

- Click rail "Nuova sessione" → Cesare landing inside the shell (rail present) with the centred
  glowing input + heading + quick prompts.
- Type + submit → session created, page transitions to the conversation (input docks, history grows),
  single chat container (no duplicate).
- Deep-link to the landing works; `prefers-reduced-motion` → no glow animation.
- Quick-prompt click → seeds the input / starts the corresponding flow.

## Out of scope

- The guided write-from-zero chain itself (spec 50) — this spec is the entry surface; spec 50 is the
  step-by-step behaviour that can run from here.
