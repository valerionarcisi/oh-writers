# Spec 52 — New Cesare session: full-screen glowy landing (Notion AI style)

Status: **Planned** · Decided 2026-05-31 (PO) · Build AFTER the merge to main.

## Context

Clicking **"Nuova sessione"** (or "+ Nuova") in the LeftRail must open a **full-screen Cesare page**
with a large, glowing centred input — the Notion AI "How can I help you today?" landing (the PO's
original Image #3 reference). Today (spec 47-A5) the rail's "+ Nuova" creates a session and routes to
`/sessions/:id`, which renders the conversation; there is no dedicated empty-state landing with the
big centred prompt.

## The experience

- Click "Nuova sessione" in the rail → navigate to a full-screen Cesare landing
  (`/projects/:id/sessions/new`, or `/sessions/:id` in its empty state).
- The page is a focused, full-screen Cesare surface (rail/topbar minimised à la focus mode), centred
  vertically, with:
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
- **Full-screen**: reuse the AppShell focus/collapsed mode (spec 44) so rail + topstrip recede; the
  Cesare landing owns the viewport. Routed + deep-linkable (consistent with spec 49 "everything
  routed").
- **react-aria** for the input + quick-prompt buttons (mandatory). CSS Modules + tokens.
- **One chat container**: the landing input and the session conversation are the same Cesare chat
  surface in two layouts (empty centred → docked-with-history). Reuse `useCesareChat` /
  `CesareConversation`; do NOT create a second chat container.

## Relation to existing work

- `/sessions` landing + `/sessions/:id` conversation + the rail "+ Nuova" exist (spec 47-A5). Spec 52
  adds the **empty-state full-screen glowy landing** as the entry, and wires "+ Nuova" to it.
- The "write-from-zero with Cesare" next-step suggestions (spec 50) live naturally on this landing as
  the quick-prompts.
- Routed/deep-linkable per spec 49; focus mode per spec 44.

## Tests (OHW-052)

- Click rail "Nuova sessione" → full-screen Cesare landing with the centred glowing input + heading +
  quick prompts; rail/topbar receded.
- Type + submit → session created, page transitions to the conversation (input docks, history grows),
  single chat container (no duplicate).
- Deep-link to the landing works; `prefers-reduced-motion` → no glow animation.
- Quick-prompt click → seeds the input / starts the corresponding flow.

## Out of scope

- The guided write-from-zero chain itself (spec 50) — this spec is the entry surface; spec 50 is the
  step-by-step behaviour that can run from here.
