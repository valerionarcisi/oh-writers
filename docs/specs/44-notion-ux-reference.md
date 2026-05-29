# Spec 44 — Notion UX reference

WP-LEAD-WATCHER's first-pass field notes on Notion's interaction patterns, captured
to ground the polishing round on observable Notion behaviour (not internal
hearsay). Each section lists the patterns Notion actually uses and where they
should map onto our shell.

> Source mix: Notion's published help docs (the canonical
> [Keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts),
> [A new sidebar, built for focus](https://www.notion.com/help/sidebar) and
> [What is Notion AI?](https://www.notion.com/help/notion-ai-faqs) pages) +
> public marketing screenshots of `notion.so/product/ai`. The post-login
> workspace pages require an authenticated Notion account; we observed
> the marketing-side product mocks Notion publishes for those flows
> instead of forcing a fresh signup.

---

## 1. Sidebar collapse behavior

### Notion's truth

- The new sidebar is always anchored to the left. It is structured into
  vertical *tabs* (Home / Chats with Notion AI / Meetings / Inbox / Search)
  rather than a tree.
- The expanded sidebar shows: workspace switcher header, the active tab
  panel, and three persistent "quick entry" buttons at the bottom of each
  tab (new chat, new page, new meeting).
- Notion's "Toggle sidebar" shortcut is `cmd/ctrl + \\` (confirmed by the
  help page above).
- In the collapsed state, the chrome that remains is the *workspace
  switcher header* and a tiny strip of tab icons — there is no separate
  permanent hamburger. The user re-expands by clicking either the workspace
  switcher (which becomes a `»` chip) or any tab icon.
- The user can also pin a single sidebar tab open as a side panel; closing
  that tab returns the sidebar to its collapsed strip.

### Hover-reveal verdict

**Notion does NOT auto-expand the sidebar when the user grazes the left
viewport edge.** The collapsed strip stays put until the user *clicks*
either the `»` chip or a tab icon. Re-expanding is a deliberate click, not
a hover-triggered slide-in.

This contradicts Spec 44's "Hover-reveal" section, which describes a 4px
sentinel that auto-opens the rail on mouse-enter. The spec text is the
source of truth for our shell; we have left this as a Spec-44 deviation
from Notion. See §6 Recommendations for the call we'd recommend the
conductor make.

### Animation

- Expanding the sidebar slides the rail in to the left of the page; the
  page reflows narrower (it does NOT slide over the page as an overlay).
  Duration roughly 180-220ms with a default ease-out curve.
- The collapsed strip stays in place during the animation; tab icons fade
  to labels rather than translating.

### Mapping to OHW

- `⌘\` should toggle `data-shell` between `full` and `collapsed`. TKT-02
  already nailed this; QA confirms it works.
- The "rail reflows page" behaviour is what we implement; the spec's
  hover-reveal is a deliberate extension we own.
- A `»` chip in the collapsed strip header should re-expand on click —
  consistent with Notion's affordance.

---

## 2. AI chat drawer (Notion AI)

### Notion's truth

- Notion AI lives as a dedicated **Chats with Notion AI** sidebar tab. The
  tab body lists the user's previous chat threads grouped by recency, a
  list of Custom Agents the user has built, and a "new chat" entry point
  pinned at the bottom of the tab.
- Active chats render in the **main content column**, replacing the
  current page. A chat is itself a Notion page; the chat thread, agent
  context, and inline tool runs all live in that page.
- Notion AI is also reachable through the global keyboard shortcut
  `shift + cmd/ctrl + J` (the user can customise it from Settings →
  Preferences).
- When Notion AI runs a tool (search, edit, web fetch, create page) it
  surfaces the run inline as a collapsible block headed by the tool name +
  status. Notion's docs describe an "Approval Mode" / "Plan Mode" where
  the agent presents intended changes before running them; the user
  reviews and accepts or rejects.
- A floating Notion AI "open chat" affordance also appears in the bottom
  bar of any page; clicking it opens a chat with the page pre-attached as
  context.

### Step blocks (the inline run-trace)

- Inside an assistant message, Notion shows a vertical timeline of steps
  (`Thought`, `Read`, `Update page`, etc.) with a sticky left rail. Each
  step is itself collapsible.
- Once a write step completes, an inline affordance shows the affected
  page name + a "Show / Hide changes" toggle. Hiding the changes collapses
  the diff visualisation; the step itself stays visible so the chat
  history doesn't lose the trace.

### Mapping to OHW

- Our `CesareDrawer` (bottom-right floating) does NOT match Notion's
  "chat-in-main-column" pattern; it's closer to a hybrid of Notion AI's
  per-page chat + the legacy Cursor/Linear bottom-right chat sub-window.
- Our four-state model (`closed | peek | expanded | full`) extends Notion
  with the `peek` state (a Notion-specific affordance we add); the
  `expanded` state corresponds to Notion's pinned chat sub-page when
  triggered from a page.
- The `Step Block` / `CollapsibleNote` design in our spec correctly
  mirrors Notion's collapsible tool-run blocks.

---

## 3. Sessions / chat history

### Notion's truth

- Past Notion AI chats live in the **Chats with Notion AI** tab in the
  sidebar, sorted by recency. A blue dot next to a chat means there is an
  unread response in the chat (i.e. the agent finished while the user was
  elsewhere).
- Clicking an old chat opens it in the main column (replaces the current
  page).
- The `•••` menu on each chat exposes: Rename, Change icon, Delete, Open
  chat.
- Chats are *global to the workspace*, not pinned to a specific page. The
  scope chip inside the chat (the page or block reference) is set when the
  chat is started, but the chat itself lives in the global chats list.

### Mapping to OHW

- Spec 44's `Cesare Session` is scoped per *project*, not workspace. This
  is a deliberate divergence: each OHW project owns its own session list.
- The `LeftRail` Sessioni section + the in-drawer session selector both
  align with Notion's pattern — Notion exposes sessions in *one* place
  (the sidebar tab). We expose them in *two* (rail + drawer header),
  which is acceptable as long as the drawer header selector is the
  canonical surface when the drawer is open.
- The `•••` overflow per session should match Notion's menu items:
  Rename, Delete (no Change icon yet — OHW doesn't support session
  iconography).

---

## 4. Drawer-style right panels (the SplitDrawer pattern)

### Notion's truth

- Notion shows several right-anchored panels triggered by `»`:
  - **Comments** panel (right-side, ~360-420px, slides in, page reflows
    narrower).
  - **Database peek** view (~50vw, drag-resizable left edge).
  - **Page details / sharing** popovers (smaller, ~400px).
- The animation: slide in from the right at ~200ms; the main content
  column reflows from the left. The panel is bordered with a
  left-edge `1px` separator + a small shadow.
- The resize handle sits on the panel's left edge. Drag-resize updates
  width live; minimum widths are around 320-360px.
- The `»` chevron in a database peek toggles the peek between
  "narrow" (50vw) and "full" (100vw).
- Closing the panel returns the main column to its original width.

### Mapping to OHW

- Our `SplitDrawer` primitive matches the Notion `»` pattern: states
  `closed | open | full`, drag-resize left edge, page reflows narrower in
  `open`.
- The `expanded-split` transient state for Cesare is OHW-specific (Notion
  doesn't do this — it would just close the chat to open the panel). Our
  use case (chat + target page in trace mode) is closer to ChatGPT
  Canvas than to Notion.
- The `NotificationCenterDrawer` and `VersionsDrawer` as `SplitDrawer`
  consumers are correct — they are exactly the right-anchored,
  page-reflowing panels Notion uses for comments and database peeks.

---

## 5. Keyboard shortcuts cheat sheet

From [Notion's help](https://www.notion.com/help/keyboard-shortcuts) and
[Notion AI help](https://www.notion.com/help/notion-ai-faqs):

| Notion shortcut         | Action                                          | OHW mapping                      |
| ----------------------- | ----------------------------------------------- | -------------------------------- |
| `cmd/ctrl + \\`         | Toggle sidebar                                  | `data-shell` full ↔ collapsed    |
| `cmd/ctrl + P` or `K`   | Open Search / jump to recent page               | `⌘K` opens command palette       |
| `cmd/ctrl + L`          | Copy current page URL                           | n/a yet                          |
| `cmd/ctrl + [`          | Go back                                         | n/a (browser handles)            |
| `cmd/ctrl + ]`          | Go forward                                      | n/a (browser handles)            |
| `cmd/ctrl + shift + L`  | Toggle dark / light mode                        | n/a (OHW is single-theme)        |
| `shift + cmd/ctrl + J`  | Open Notion AI                                  | n/a — we use `✦ Cesare` dock     |
| `cmd/ctrl + N`          | New page                                        | n/a (project-creation is modal)  |
| `cmd/ctrl + shift + N`  | Open new Notion window                          | n/a                              |
| `esc`                   | Dismiss `@`/`/` menus, clear block selection    | matches OHW menus                |
| `cmd/ctrl + /`          | Block menu / change-type                        | n/a (Monaco command palette)     |
| Custom: `⌃⌥F`           | (OHW only) Focus mode                           | hides rail + topstrip + dock     |

We add `⌃⌥F` for focus mode — Notion has no direct equivalent; the
closest is collapsing the sidebar via `⌘\\`, but that doesn't hide the
top bar.

---

## 6. Recommendations (out-of-scope decisions to escalate)

These are interaction patterns we observed in Notion that we should
consider adopting in Spec 44 follow-ups. They are NOT in the current spec
scope; we list them so the conductor can decide whether to widen the
polishing round.

1. **Hover-reveal should be removed (or kept but documented as a
   Spec-44 extension).** Notion does not auto-expand the rail on
   mouse-near-edge — they require a click. If we keep our hover-sentinel,
   we should at least require a brief dwell (e.g. 150-250ms) before
   sliding the rail open, to avoid accidental opens when reaching for a
   close button or the dashboard logo.

2. **One Cesare entry-point per project, surfaced in the rail like
   Notion's Chats tab.** The current rail has a Sessioni subsection
   visible when Cesare is expanded. Notion always shows the Chats tab as
   a sibling to Home/Meetings/Inbox/Search; we could mirror that by
   making "Cesare" a permanent rail subsection visible at all shell
   states (collapsed shows just the icon, expanded shows the session
   list). The current "visible only when Cesare expanded" rule splits
   the entry-point in two and may be confusing.

3. **Step-block "Hide changes" should collapse the diff overlay only —
   not the step itself.** Notion's affordance reads "Hide changes" and
   collapses the visual diff while keeping the step header + status
   visible. We should make sure our `CollapsibleNote` "Mostra modifiche
   / Annulla" pair does the same; otherwise a long completed run can hide
   itself entirely and the user loses the trace.

4. **The `↗ ↙ − ×` window-control glyphs in our drawer header look
   correct.** Notion uses similar `arrow-up-right` / `arrow-down-left`
   icons in their pinned-page peek; the symmetry is good. No change.

5. **Session menus should expose Rename + Delete, not just Delete.**
   Notion's `•••` menu on chats includes Rename. Our spec calls for
   `renameSession`; the rail and the drawer header selector both need
   the affordance wired.

---

## 7. Reference screenshots

| File                          | What it shows                                       |
| ----------------------------- | --------------------------------------------------- |
| `01-notion-ai-agents.png`     | Notion Agents panel + Q&A agent UI from product/ai. |
| `02-notion-product-ai.png`    | Notion AI product hero (illustrates Cesare moodboard). |
| `03-notion-wikis.png`         | Notion wiki product page hero (sidebar style ref).  |
| `ohw-project-home.png`        | OHW project dashboard reference for our shell.      |

Bug screenshots (Phase 2 artefacts) live alongside, prefixed `ohw-bug-`.
