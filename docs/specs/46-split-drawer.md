# Spec 46 — SplitDrawer (Notion-style side-peek) + Sessions route

## Context

Spec 44 shipped the Notion-style shell: a floating bottom-right **CesareDrawer** (chat AI) that never reflows the editor. That handles the _conversation_ surface.

This spec adds the second Notion mechanism: the **side-peek** — a routed panel that injects a real page beside the current one. In Oh Writers this is the **SplitDrawer**. It is distinct from CesareDrawer:

| Surface                     | Role                                                       | Routing                                   |
| --------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| **CesareDrawer** (spec 44)  | floating chat + agentic edits applied LIVE to the open doc | none — shell overlay, `body[data-cesare]` |
| **SplitDrawer** (this spec) | inject a real page beside the current one (side-peek)      | `?peek=` search param                     |

Decided with the product owner 2026-05-29 (TEST-878-2 follow-up):

- **Cesare session click → real central route**, not a peek. Navigates to `/projects/:id/sessions/:sessionId`; the session conversation fills the main area. Deep-linkable, normal route.
- **"Mostra modifiche" (ChangeTrace, already built) → SplitDrawer side-peek**, side-by-side: the main page **compresses to the left**, the SplitDrawer takes the right half showing the trace's target page in diff/trace mode.
- Locations and other production views may use the SplitDrawer later — out of scope here.

## Glossary

- **side-peek**: a panel sliding in from the right that injects a _real, routed page_, pushing the main content to compress (not an opaque overlay).
- **peek target**: the URL of the page rendered inside the SplitDrawer, carried in `?peek=`.
- **host page**: the route that stays mounted on the left while the peek is open.

## Routing model — `?peek=`

The host route stays mounted; the peek is a search param on it.

```
/projects/:id/synopsis?peek=/projects/:id/screenplay%23scene-3
```

- `peek` holds a URL-encoded in-app path (optionally with a hash anchor) to render in the SplitDrawer.
- The host route does **not** unmount when the peek opens/closes — it only compresses. This is why a search param is used, not a nested layout route (which would remount).
- Browser **back** closes the peek (search param pops). **ESC** and an explicit **×** also close it (clear `peek`).
- Deep-linkable: pasting a URL with `?peek=` opens the host page with the peek already open.
- Validate `peek` with Zod: it must be a same-origin in-app path under `/projects/:id/...` for the current project. Reject anything else (no open redirect, no cross-project peek). Fail closed → ignore the param and render the host page alone.

### Why not a nested route

TanStack nested layout routes remount on navigation, which breaks "the host page stays alive underneath" and loses host scroll/editor state. The search-param approach keeps the host stable and makes the peek orthogonal to the route tree. (Reversibility: if we later need a peek that is itself deeply routable, we revisit — but `?peek=` covers the current needs.)

## Components

### `<SplitDrawerHost/>`

Lives at the app-shell layout level (wraps the main outlet). Reads `peek` from the route search params. When present:

1. Validates the peek path (Zod, same-project guard).
2. Compresses the main outlet (left lane) and mounts the **SplitDrawer** (right lane) with the peek page.
3. Wires close: ×, ESC, outside-click, browser-back → all clear `peek`.

Layout: flex row, main lane `min-width: 0` + `flex: 1`, drawer lane a token-based width (~`50%`, clamped `min`/`max` via tokens). Both lanes use logical props. The main lane must keep `min-width: 0` so its content (prose, editor) reflows instead of overflowing.

### `<SplitDrawer/>`

The right-lane container. Owns the chrome: header (title + ×), body (the injected page), and the slide-in animation (token-based duration/easing). Uses `react-aria` `useDialog` + `useOverlay` for focus management and dismiss — **mandatory**, do not hand-roll.

The injected page is rendered by routing the peek path through the same route components as the main app (a self-contained render of the target route's component, given the peek path). For the "Mostra modifiche" case, the SplitDrawer renders the target page in **trace/diff mode** (a prop/flag that tells the page to show the change diff for the relevant entity).

### Sessions route — `/projects/:id/sessions/:sessionId`

A normal route. The central area renders the full conversation for that session (Cesare history + composer). Clicking a session in the LeftRail navigates here. This is **not** a SplitDrawer — it replaces the main content. (The floating CesareDrawer and this central session view share the sessions context but are different surfaces; reconcile so opening one does not duplicate the other — define which is authoritative when both could show the same session.)

## Open coordination points

- **ChangeTrace "Mostra modifiche"** is being fixed in `refactor/ux-notion-v3-fix-split-iter-1` (QA iter-1). That fix makes the button _do something_; this spec defines where it should land (open SplitDrawer with `?peek=<target>` in diff mode). Land this spec's SplitDrawer **after** that fix merges + re-QA, to avoid colliding on `SplitDrawerHost` / ChangeTrace.
- The live-doc agentic edit (spec 44 Agentic Edit Pattern) is separate: edits apply to the open doc directly, **not** via SplitDrawer. SplitDrawer is for _viewing another page beside the current one_, not for applying edits.

## Domain ownership

- Routing + `SplitDrawerHost` + `SplitDrawer`: app-shell (`apps/web/app/features/app-shell/`) + `packages/ui/src/shell/`.
- Sessions route + central session view: `features/predictions/` (Cesare) — co-locate with the sessions context.

## Tests (OHW-046)

- `apps/web/tests/e2e/split-drawer.spec.ts`
  - **Happy**: open a host page, set `?peek=<same-project path>` → SplitDrawer renders the target page right; main lane compresses (`getBoundingClientRect().width` drops, `> 0`); ×, ESC, browser-back each close it and restore main width. Deep-link with `?peek=` opens already-peeked.
  - **Happy**: ChangeTrace "Mostra modifiche" → SplitDrawer opens with the trace's target page in diff mode (`data-split` set, diff visible).
  - **Sad**: malformed / cross-project / cross-origin `peek` → ignored, host page renders alone, no drawer, no redirect.
  - **Sad**: peek to a non-existent in-app path → drawer shows the not-found body for that route, host stays intact.
- `apps/web/tests/e2e/cesare-sessions-route.spec.ts`
  - **Happy**: click a LeftRail session → navigates to `/projects/:id/sessions/:sessionId`, central area shows that session's conversation; deep-link works.
  - **Sad**: session id not owned by the user/project → not-found/forbidden, no leaked content.
- Vitest: peek-path validation (Zod schema) — same-project pass, cross-project/cross-origin reject.

## Out of scope

- Locations / Budget / Schedule using the SplitDrawer — revisit per-feature later.
- Multiple simultaneous peeks (stack) — single peek only for now.
- Resizable / draggable split — fixed token width initially; draggable is a later enhancement.
