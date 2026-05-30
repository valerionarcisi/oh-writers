# Spec 47b — Cesare Fix Fleet bounce-back (iter-1)

Sub-spec of [47](47-cesare-fix-fleet.md). Four fixes the judges bounced back, all
verified live by the orchestrator. Base: `integ/ux-notion-v3-qa-iter-1` (HEAD `70dcc90`).

## FIX 1 — header overflow `…` removed; bell/avatar/gear live in the LeftRail footer

The A3 merge folded bell/avatar/gear into a `…` overflow inside the `CesareDrawer`
header. The header must instead be truly minimal: **agent name + session selector +
state controls `↗ / − / ×`** — no `…`.

- Remove the `…` overflow popover and `dockIcons` rendering from `CesareDrawer`
  (`packages/ui/src/composites/CesareDrawer`). Drop the now-unused `dockIcons`,
  `onNewChat`, `onShare` header plumbing from the drawer chrome (new-chat stays
  reachable from the sessions popover's `+ Nuova`).
- bell / avatar / gear move to the **LeftRail footer** (`packages/ui/src/shell/LeftRail`)
  as a dedicated account row above the existing tools toolbar.
- The **BottomDock** keeps only the Cesare launcher pill — bell + avatar + settings
  move out of it so there is exactly one home (the rail footer). `CesareSheet` stops
  passing `dockIcons`.
- E2E `[OHW-047-A3]`: drawer header shows only `Espandi / Minimizza / Chiudi`, no
  `Altre azioni`; the rail footer exposes Notifiche / Profilo / Impostazioni; the
  dock no longer renders bell/settings.

## FIX 2 — full-page session renders the real conversation

`SessionConversationPage` was an empty shell. It must render the actual thread:
user + assistant bubbles, the agentic trace (`ChangeTrace`), and Mostra/Nascondi +
Annulla.

- The chat thread state is lifted out of `useCesareChat`'s local reducer into a
  shared `CesareChatStoreProvider` (app-shell context) keyed by session id. Both the
  floating `CesareSheet` and the full-page session read the **same** store — single
  chat container, no fork.
- The conversation rendering (bubble map + `ChangeTrace` + live trace) is extracted
  into a reusable `<CesareConversation/>` used by both surfaces.
- The full-page session renders the focused session's thread + a composer that sends
  through the shared store. Sending from either surface updates both.
- E2E (new tag `[OHW-047-A5-session]`): open a session full-page → after a Cesare
  turn the page shows the user + assistant bubbles and, on an agentic edit, the
  Mostra/Nascondi controls.

## FIX 3 — `+ Nuova` from the sessions landing creates + navigates

`SessionsLandingPage`'s `+ Nuova` mutation + navigate must create the session and
navigate to `/sessions/:newId`. Confirm + harden the handler.

## FIX 4 — floating "Mostra modifiche" is a word-level coloured diff

A6's floating case painted a `--ds-diff-add-fg` ring on `<main>`. It must instead
render a **word-level coloured diff** (green additions / red removals) inline.

- The server embeds an `<!--ohw:live-diff-b64:…-->` marker carrying precomputed
  word-level diff segments (`{op:"eq"|"add"|"del", text}[]`) + a label whenever a
  document/section edit is applied live (`executeApplyTextEdit`,
  `generateAndReplaceSection`).
- `buildWordDiffSegments(before, after)` is a pure helper in `@oh-writers/utils`
  (wraps `diffWordsWithSpace`), used server-side to build the marker and client-side
  to render.
- The floating "Mostra modifiche" broadcasts the segments; a shell-level
  `CesareLiveDiff` overlay renders the coloured diff over the main lane. `data-cesare-diff`
  still flips so existing wiring/tests keep working, and the overlay carries
  `data-testid="cesare-live-diff-overlay"` with `.added` / `.removed` spans.
- E2E `[OHW-047-A6]`: floating Mostra modifiche → the overlay shows `.added`
  (green) and `.removed` (red) word spans; Nascondi removes it.

## Tests

`[OHW-047-A3]`, `[OHW-047-A5]`, `[OHW-047-A5-session]`, `[OHW-047-A6]` + Vitest for
`buildWordDiffSegments` and the chat-store reducer reuse.
