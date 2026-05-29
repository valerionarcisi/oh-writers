# Spec 44 — WP delivery reviews (Phase 3)

WP-LEAD-WATCHER reviews of the three parallel WP branches as they land.
Each entry follows the format:

```
## WP-<NAME> · branch · <PASS | RESPAWN>

- **Pulled at**: HEAD shortish-SHA
- **Notion compliance**: short verdict
- **Spec deviation**: any
- **Suggested corrections** (if RESPAWN): bullets
```

---

## WP-CHAT-FIX

_Not yet delivered. Will be reviewed when the conductor notifies that
`refactor/ux-notion-v3-chat-fix` is ready._

Reviewer focus areas (set up-front against
[`44-notion-ux-reference.md`](./44-notion-ux-reference.md)):

- Drawer header carries bell + avatar + gear when state ≠ closed
  (Spec 44 §Cesare Panel — see TKT-LEAD-02).
- Step Blocks expose "Mostra modifiche / Annulla" as a leaf-themed pair
  and the affordance collapses the diff, not the whole step (Notion ref
  §2 Step blocks).
- Floating "Vai alle nuove risposte" pill appears once user scrolls
  away from the bottom; releases scroll-anchor immediately.
- Scope chips above input render with `×` and `+` affordances.

---

## WP-SIDEBAR-NOTION

_Not yet delivered. Will be reviewed when the conductor notifies that
`refactor/ux-notion-v3-sidebar-notion` is ready._

Reviewer focus areas:

- Collapsed state shows workspace switcher header + icon strip; no
  duplicate hamburger (Notion ref §1).
- `⌘\\` toggles full ↔ collapsed; ` »` chip re-expands on click in
  collapsed.
- LeftRail project label binds to the active project's title; no
  ellipsis-only placeholder (see TKT-LEAD-07).
- Sessioni subsection behaves per spec: visible only when Cesare
  expanded / full.
- Sessions overflow menu exposes Rename + Delete (Notion ref §3 +
  §6 recommendation 5).
- Dashboard filter chips render horizontally (TKT-LEAD-06).

---

## WP-SESSIONS-MENU

_Not yet delivered. Will be reviewed when the conductor notifies that
`refactor/ux-notion-v3-sessions-menu` is ready._

Reviewer focus areas:

- Header session selector dropdown exposes the project's session list
  + "+ Nuova" entry (Spec 44 §Drawer header).
- Active session shows next to the agent name; non-active sessions
  list rendered as a popover anchored to the selector button.
- `•••` menu on each session exposes Rename + Delete; Rename opens an
  inline rename input (no modal).
- Switching sessions preserves scroll-anchor and resets composer
  context to the new session.
- Session timestamps render as `relative` (e.g. "2 min fa", "ieri").

---

## Review verdict map

| WP                | Branch                                           | Verdict | Date |
| ----------------- | ------------------------------------------------ | ------- | ---- |
| WP-CHAT-FIX       | `refactor/ux-notion-v3-chat-fix`                 | pending |  —   |
| WP-SIDEBAR-NOTION | `refactor/ux-notion-v3-sidebar-notion`           | pending |  —   |
| WP-SESSIONS-MENU  | `refactor/ux-notion-v3-sessions-menu`            | pending |  —   |

The conductor should hold the merge gate until all three are PASS.
WP-LEAD-WATCHER stays running until then.
