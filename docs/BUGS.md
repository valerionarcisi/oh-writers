# Bugs — live ledger

The detail home for bugs we are actively tracking. `docs/BACKLOG.md` queues them (one
line + link here); this file holds the repro + proof. Point-in-time audit findings live
in their audit report (e.g. `docs/audits/2026-06-03/CONSOLIDATED.md`); when one is pulled
into work, copy its detail here.

**Entry format:**

```
### BUG-NNN — short title (YYYY-MM-DD)
- Severity: ALTO | MEDIO | BASSO
- Status: open | in-progress | fixed (commit)
- Repro: page → action → observed result
- Proof: screenshot path / file:line / repro steps
- Notes / suspected cause
```

A bug is fixed only per `docs/conventions/definition-of-done.md` (tests at every layer,
E2E first; screenshots in a recap; gates green).

---

## Open

### BUG-N41 — narrative realtime editor double-seeds the CRDT → unbounded growth → "Invalid string length" freeze (2026-06-07)

- Severity: ALTO (freezes the whole page; Attiva / Nuova versione appear broken because the page is already frozen when clicked)
- Status: fixed (`NarrativeProseMirrorView` seed guard + corrupted-CRDT data cleanup)
- Repro: open a narrative doc with realtime ON (ws-server up) whose `documents.yjs_state` already holds content — e.g. project `…012` Soggetto (doc `5903948d`). The editor loaded clean (3735 chars) then ballooned to ~112 MB within ~5s, the save pill stuck on "Salvataggio…", and `RangeError: Invalid string length` froze the tab. With ws-server DOWN the same doc loaded clean and stayed stable — isolating the cause to the realtime CRDT, not the HTML converter (which unit-tests as perfectly idempotent on the real content).
- Proof: `documents.yjs_state` for `5903948d` measured **129 MB** while its text was 3.7 KB (project `…013`'s healthy Soggetto was 2.6 KB). After the fix + cleanup, a single fresh client loads at exactly the content length (4556), 1 online, stable across repeated samples; Attiva + Nuova versione both work with no freeze. Regression test: `apps/web/app/features/documents/components/narrative-realtime-seed.test.ts`.
- Notes / cause: `NarrativeProseMirrorView` created the `EditorState` with `doc: initialDoc` unconditionally while `ySyncPlugin` was bound to the shared fragment. When the fragment was already populated (a reconnecting client), y-prosemirror merged the initial doc ON TOP of the existing content, growing the CRDT every connect; `flushRoom` persisted the bloat, compounding across sessions. The screenplay editor already guards this (`ProseMirrorView` `seedFromInitial = !isRealtime || isFragmentEmpty(ydoc)`); the narrative view was missing the same guard. Fix mirrors it: seed from `initialDoc` only when `isFragmentEmpty(realtime.ydoc)`, else build the state empty (`{ schema }`) and let the CRDT populate. Data fix: nulled the bloated `documents.yjs_state` so the room reseeds clean (ws-server restart required — it caches the room in memory).

### BUG-N40 — /api/test/fundraising-seed returns 503 in dev (route module won't load) (2026-06-07)

- Severity: BASSO (test-only endpoint; blocks the Spec 35 fundraising E2E)
- Status: open
- Repro: `curl -X POST http://localhost:3002/api/test/fundraising-seed -d '{"title":"T","guid":"g1"}'` against the dev server → generic vinxi `503 Server Unavailable` (HTML), not the handler's 200/400. Persists across many retries (~30s), so it's not just lazy-compile warmup.
- Proof: the four Spec 35 E2E (`tests/fundraising-classify.spec.ts` OHW-353/354, `tests/fundraising-ui.spec.ts` OHW-355/356) all fail at the seed call (`seed responded 503`). They are `test.fixme` until the endpoint loads. The sibling test routes load fine: `set-locale` / `mock-context` / `reset-cesare-state` / `set-narrative-state` return 400 on an empty body, and `POST /api/cron/fundraising-ingest` returns 200 — only `fundraising-seed` 503s.
- Notes / suspected cause: the route imports the same `@oh-writers/db/schema` tables as the (working) `set-narrative-state` route and `getDb` like the (working) cron, so it's not an obviously missing export. Something in the `fundraising-seed` route module throws at load under vinxi dev. Investigate with the route module's actual load error (vinxi server log didn't surface one). Un-fixme the four tests once it loads. A `seedFundraising` helper with 503-retry is already in `tests/fundraising-helpers.ts`.

### BUG-N39 — Tab from a dialogue block goes to Parenthetical, not Action (2026-06-06)

- Severity: BASSO
- Status: fixed (`tabCommand` empty-dialogue special case removed — dialogue now follows `nextElementOnTab`)
- Repro: screenplay editor → place cursor in an empty block → Alt+D (dialogue) → Tab. Expected the block to cycle to Action (Spec 05e Tab matrix: dialogue → action); observed it becomes Parenthetical.
- Proof: `tests/screenplay-editor/screenplay-editor-ux.spec.ts` [OHW-417] re-enabled and green (17/17 in the file). Unit: `keymap.test.ts` "empty dialogue → action" + `fountain-element-transforms.test.ts` (30/30).
- Root cause: the Tab keymap (`apps/web/app/features/screenplay-editor/lib/plugins/keymap.ts`, `tabCommand`) had an explicit empty-dialogue branch that converted the block to a parenthetical pre-filled with "()" instead of routing through `nextElementOnTab` — exactly the post-Enter state the repro hits. The branch was removed; every non-prefix block now follows the Spec 05e Tab matrix.

### BUG-N38 — TopBar center pill overlaps the right cluster below ~900px (2026-06-06)

- Severity: MEDIO
- Status: open
- Repro: any narrative page (Soggetto/Sinossi/…) → shrink the viewport below ~900px (768 or 390) → the TopBar center slot (logline pill) and the right cluster (version chip + ⋯ "Altre azioni") overlap. The `topbar-version-chip` ("Versioni") renders on top of the logline pill, so `elementFromPoint` at the pill's centre returns the version chip — the pill is not clickable and the logline popover can't be opened.
- Proof: `tests/documents/logline-popover-viewport.spec.ts` narrow (768px) + mobile (390px) cases hang on `pill.click()` (target intercepted) and are skipped pending this fix; hit-test chain at 768px: `SPAN._label (Versioni)` → `BUTTON[data-testid=topbar-version-chip]` → `_topBarVersionGroup` → `_versionSlot` → `_pageActions`. Desktop (1440px) passes.
- Notes / suspected cause: the TopBar row (`_pageActions` / center + right slots) does not wrap or shrink the pill below a threshold, so the right cluster collides with the centred pill. Fix the TopBar responsive layout (wrap/clamp the center pill, or move it out of the center slot at narrow widths). Re-enable the two skipped N-16 cases once fixed.

### BUG-067 — TopBar status shows "online" then flips to "offline" (2026-06-06)

- Severity: MEDIO
- Status: open
- Repro: any narrative page (Soggetto seen) → top-right presence indicator briefly shows "online" then switches to "offline" and stays there.
- Proof: reported live by Valerio on :3000 (visible in every recent screenshot — the "offline" label top-right of the editor card).
- Notes / suspected cause: the realtime/presence indicator (`PresenceIndicator`, Yjs room `document:<id>`) reports connected then drops to disconnected. Likely the y-websocket provider never connects (no/wrong `VITE_WS_URL` in dev) so it falls back to "offline", or a connect→disconnect race on mount. Investigate `useYjsRoom` status transitions + the dev ws-server. Decide: is "offline" expected in single-instance dev (no ws-server running) — if so, hide/soften the label — or is the ws-server meant to be up?

### BUG-066 — Cesare bell: missing "go to document" link + duplicated start/done notifications (2026-06-06)

- Severity: MEDIO
- Status: open
- Repro: trigger several Cesare turns that touch a document → open the bell (NotificationCenter) → (a) NO explicit "Vai al <documento>" link on applied-change notifications; (b) the list fills with repeated "Cesare sta lavorando…/ha risposto" rows (≈8 seen) instead of one entry per turn.
- Proof: img #6 (NotificationCenter full of repeated "CESARE STA LAVORANDO SUL SOGGETTO…" rows).
- Desired (decided 2026-06-06): one notification PER TURN (collapse start→done into a single row that goes "sta lavorando" → "ha aggiornato il <doc>"); an explicit "Vai al <documento>" link ONLY on applied-change notifications (not on "sta lavorando"). The Mostra/Nascondi underline stays in the document with Cesare open on the right page — NOT in the bell. Scenario: on Location, a change lands on Soggetto via floating Cesare → the float/bell shows the link to Soggetto → click navigates there → in the doc with Cesare open, Mostra/Nascondi is available.
- Notes / suspected cause: the bell likely emits separate start + complete notifications (or re-emits on the streaming + fallback paths) instead of updating one id. Investigate `handleCesareAssistantResponse` + `startNotification`/`completeNotification` emission in `AppShell.tsx`, and the render in `NotificationCenterDrawer.tsx` (add the link off `affectedEntities`/`page`).

### BUG-065 — Cesare needs a presence "glow" effect (closed pill + open chat header) (2026-06-06)

- Severity: BASSO (polish)
- Status: open
- Repro: n/a — enhancement. The Cesare floating pill (closed) and the chat header (open) have no presence/activity glow.
- Desired: a subtle glow effect on the Cesare pill when closed AND on the chat header when open. Decorative, signals presence/activity.
- Notes: pure CSS on the floating pill + `CesareDrawer` header. Respect `prefers-reduced-motion`.

### BUG-064 — "Avvia sessione" from a margin suggestion triggers a stray re-render (2026-06-06)

- Severity: MEDIO
- Status: open
- Repro: Soggetto → open a margin suggestion card → "✦ Avvia sessione" → a new session is created and the prompt sends, BUT a strange re-render flicker still happens around the open (Spec 64).
- Proof: reported live by Valerio on :3000 (real AI). The infinite-loop variant was fixed (effect now deps only on `[seedNonce, isOpen]`, chat/createSession read from a ref) — but a residual rerender remains.
- Notes / suspected cause: likely the `onActiveSessionChange` → AppShell `setFocusedSessionId` → re-render chain, or `setActiveSessionId` inside the seed effect racing the session-adopt effect. Investigate the seed-session open path in `CesareSheet.tsx` (seedPrompt effect) + the focused-session mirror in `AppShell.tsx`. Defer per Valerio — fix in a later pass.

Narrative UI/UX manual walk — 2026-06-03 (Valerio). Grouped by topic; image refs are
the walk screenshots. Severity is provisional (to confirm during one-by-one analysis).

### Topic 1 — Action placement / TopBar standard (Spec 55)

The recurring "everything near the lens" pattern. Confirms + enriches `docs/specs/55-shell-action-standard.md`.

- **N-01** ALTO — Notifications still bottom-left; must move to the TopBar; they open in a SplitDrawer, and the **old notification drawer is removed** (img #3, #18).
  - `Done =` bell lives in the TopBar action zone on every narrative page; clicking it opens notifications in a SplitDrawer; `NotificationCenterDrawer` (bottom-left) deleted; E2E asserts bell-in-topbar + split open + no legacy drawer in DOM.
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Bell moved to a new TopBar account zone (`packages/ui/src/shell/TopBar/TopBarAccount.tsx`), wired in `AppShell.tsx`; rail-footer `AccountRow` no longer rendered by the shell. Bell opens the notifications SplitDrawer. E2E `tests/shell/spec55-shell-backbone.spec.ts`.
- **N-02** ALTO — **Versions missing on all narrative pages**; must open in a SplitDrawer, **old VersionsDrawer removed**; place "Versioni" near the lens (img #15). (Spec 49 + 55.)
  - `Done =` "Versioni" action registered in the TopBar zone on all narrative document pages; opens the Versions SplitDrawer (`?peek=versions`); legacy VersionsDrawer removed; E2E asserts action present + split opens + rollback path intact.
  - **FIXED for narrative (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** "Versioni" is registered in the shared registry (`context-actions.ts`) and rendered in the TopBar `ActionsMenu` on soggetto/sinossi/scaletta/trattamento; it opens the routed Versions SplitDrawer (`?versions=<docId>`, the real impl — NOT `?peek=versions`). Narrative pages no longer use the legacy `VersionsDrawer`. **Caveat:** the legacy `VersionsDrawer` shell mount is KEPT because screenplay/budget/breakdown still consume it (out of scope — A5/N-28); deleting it would break those. E2E: action+split in `spec55-shell-backbone.spec.ts`; rollback in `versions-splitdrawer.spec.ts`.
- **N-03** ALTO — **Exports** must sit near the lens, as a **per-page tool pattern across ALL narrative pages** (img #16, #20). One pattern, page-specific tools.
  - `Done =` narrative document pages register their export actions (SIAE/PDF) via the shared TopBar action registry — one pattern, page-specific tools; no mid-page export menu/modal on narrative docs; E2E asserts export action in TopBar zone per narrative page. (Screenplay export registration owned by A5.)
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Built the registry backbone (`packages/domain/src/actions/context-actions.ts` + `use-context-actions.ts`). Soggetto (DOCX + SIAE) and synopsis/outline/treatment (PDF) export actions now come from the registry into the TopBar `ActionsMenu`. Export modals still open from those actions (placement, not redesign). Unit: `context-actions.test.ts`; E2E: `spec55-shell-backbone.spec.ts`.
- **N-04** MEDIO — Drawers are ALWAYS SplitDrawer; clean up any legacy drawer (img #18).
  - `Done =` no drawer pattern other than Cesare (floating bottom-right) + SplitDrawer (`?peek=`) remains in the narrative surface; BottomDock/FloatingDock/AccountRow retired per Spec 55; grep + E2E confirm no legacy drawer/dock mounts.
  - **PARTIAL (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Rail `AccountRow` retired from the shell (bell/avatar/gear now in the TopBar). On the narrative surface the only drawers are Cesare (floating) + SplitDrawer (routed). `BottomDock` is KEPT — it is the Cesare launcher pill per the updated CLAUDE/Spec 44 invariant, not a per-page action bar. `FloatingDock` is only used on the (non-routed) logline editor, not narrative pages; retiring it app-wide is Slice C / N-28. E2E asserts no `rail-account` on narrative pages.

### Topic 2 — Cesare drawer & chat UX

- **N-05** ALTO — Cesare **auto-opens**; it should **start closed** (img #4).
  - `Done =` on first load of any narrative page Cesare is `closed` (no auto-open); `body[data-cesare]` is `closed` until the user opens it; E2E asserts closed-on-load across narrative pages. (Owned by A1 — `cesare-context.tsx`.)
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Root cause was `AppShell.readPersistedCesare()` restoring a persisted `expanded` on every load. Now it always returns `closed` (persisted state never acted on at mount). E2E in `spec55-shell-backbone.spec.ts` pre-seeds `ohw.cesare.state=expanded` and still asserts `body[data-cesare]=closed` on load.
- **N-06** ALTO — In split view (`?peek=cesare`) the **text input to talk to Cesare is missing / not visible** (img #12, #13).
  - `Done =` the composer is present AND inside the viewport in the `?peek=cesare` split surface, even beside a tall document; E2E asserts the composer is on-screen and usable.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** Root cause: the shell grid is `min-block-size: 100vh` and GROWS with the main document, so a tall soggetto stretched the grid (and the Cesare lane, at `block-size: 100%`) past the viewport, pushing the composer footer ~175px below the fold at 1440×900. Fix: the lane is now `position: sticky; inset-block-start: 0; block-size: 100dvh; align-self: start` (`CesarePeekLane.module.css`) so it pins to the viewport and the composer stays in view. Measured: composer at y≈855/900 (was 1075/900). E2E `tests/cesare-agentic-chat-ux.spec.ts`.
- **N-07** MEDIO — Chat layout: **fixed header + footer always visible, body scrolls, "go to end of chat" button** — same as Claude (img #13).
  - `Done =` header pinned at top, footer (composer) pinned at bottom, scrollable body in between; scroll-to-end pill present; verified in the split surface.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** The `CesareDrawer` frame already lays out header (`flex-shrink:0`) / body (`flex:1; overflow:auto`) / footer (`flex-shrink:0`) with a sticky `scrollNudge` ("↓ Vai alle nuove risposte"); N-06's viewport-bounding fix is what made it hold in the split surface. E2E asserts header.top≈0, footer at the viewport bottom, body `overflow-y:auto`.
- **N-08** MEDIO — Improve the **response bubbles** UI (img #12).
  - `Done =` assistant replies read as a distinct soft card with an agent marker; user bubble distinct.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** `.bubbleMarkdown` is now a left-aligned surface card (`--ds-surface-alt` + 1px line + `--ds-radius-lg`) with a ✦ agent marker; user bubble uses `--ds-radius-lg`. CSS-only in `CesareSheet.module.css`. Screenshot `a2-n08-bubble-and-card.png`.
- **N-09** MEDIO — **"Mostra/Nascondi modifiche" shows nothing** when toggled (img #11). (Spec 47e flash.) **CONFIRMED 2026-06-03** on the logline-from-Cesare result card.
  - `Done =` clicking Mostra modifiche on a logline edit renders a visible inline diff; E2E asserts the flash with green additions.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** Root cause: the live-diff marker pipeline was intact for the logline (`write_logline` → `diff_segments` → `ohw:live-diff-b64` → `flashLiveDiff("logline")`), but **no `<CesareLiveDiff documentType="logline"/>` was ever mounted** — the prose docs mount it inside the editor, the logline lives in a collapsed `LoglinePill` with no diff surface, so the flash had no consumer. Fix: `LoglinePill` now subscribes to the live-diff store, auto-opens its popover on a new logline flash, and renders `<CesareLiveDiff documentType="logline"/>` inside it. E2E asserts `data-flash-mode="mostra"` + visible `[data-diff-op="add"]`.
- **N-10** MEDIO — **Markdown rendering problem** in Cesare messages (img #8).
  - `Done =` numbered lists and inline code render correctly in Cesare replies.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** The hand-rolled `renderMarkdown` (CesareConversation) only handled bullets/headings/bold/italic — numbered lists fell through to plain paragraphs and inline code rendered as literal backticks. Added ordered-list (`<ol>`) + inline-code (`<code>`) support, and fixed `.mdList` to use real list markers (`list-style`) instead of a flex list that suppressed them. New `.mdCode` token-styled chip.
- **N-11** BASSO — Suggestion cards (Cesare structure cards) placement needs rethinking (img #14).
  - `Done =` the inline next-step suggestion sits after the last reply (near the composer), not pinned above stale history.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** Moved the inline `NextStepChip` to render AFTER the conversation in `CesareSheet`, so the forward-looking nudge is contextual to where the user is reading rather than a banner above old messages. Empty-state cold-start menu unchanged.
- **N-26** MEDIO — **Trace repeats the "sta scrivendo" step many times** during a Cesare edit (new, 2026-06-03).
  - `Done =` the live trace shows ONE clear `writing{entity}` step per phase; the step is never removed (tracer invariant); unit test asserts collapse, E2E asserts one writing step at the transport.
  - **FIXED (branch `agent/a2-cesare-chat-ux`).** The server emits one `writing` event per tool call, but a single edit can run the same writing tool across model iterations / chunks. Fix: the client reducer (`use-cesare-chat-reducer.ts`) now collapses a CONSECUTIVE duplicate of the same phase (same kind + entity domain, or same text for entity-less steps) via `appendTraceStep` — one clean step per phase, the step itself preserved. Unit tests in `use-cesare-chat-reducer.test.ts`; transport-level E2E asserts exactly one `writing{logline}` event.
- **N-27** ALTO — **Cesare margin-note suggestions invent elements not in the document** (new, 2026-06-03, **real AI** — confirmed `MOCK_AI=false`, key set). The `MarginNotesColumn` notes from `polishNarrativeDoc` (`apps/web/app/features/documents/server/narrative-polish.server.ts`) are mostly grounded (Marta, manoscritto, libreria are in the text) but (a) **propose example elements as if plausible-present** (e.g. "un parente geloso, il notaio" — not in the soggetto) and (b) **impose a 3-act frame** ("Atto II") on free-form prose that declares no acts. For a screenwriting tool this erodes trust. **Spans the whole narrative area** — soggetto/sinossi/scaletta/trattamento share `SYSTEM_PROMPTS` + the `submit_narrative_suggestions` tool. Fix: add grounding constraints to the prompt (base every note on text actually present; never assert non-present characters/events/structure; frame any addition explicitly as a proposal, "potresti introdurre…"; optionally anchor each note to a short quote). **Must be tuned + verified against REAL AI** (mock returns static fixtures, so mock can't validate this) — use `pnpm cost:smoke:cesare` / manual on `:3000`.
  - **FIXED (cherry-picked from `agent/a3-cesare-grounding` onto `main`).** Added a centralized `GROUNDING_RULES` preamble prepended to every narrative system prompt via `buildNarrativeSystemPrompt` (soggetto/sinossi/scaletta/trattamento), plus reinforced the tool schema (`category` "Do NOT use act labels unless declared"; `message` "grounded only in what the document says; new elements framed as proposals"). The pure prompt assets were extracted to `narrative-polish-prompt.ts` (no `~/server` deps) so they can be unit-tested + exercised by a real-AI smoke; the `.server.ts` re-exports them. **Verified against REAL AI** with a new `pnpm cost:smoke:narrative-grounding` (controlled soggetto with no notaio/relative/acts → all notes grounded, no invented elements asserted, no "Atto I/II/III"). Structural Vitest in `narrative-polish.server.test.ts` (14 tests). Tool name/transport unchanged so the tracer invariant holds.

### Topic 3 — Cesare sessions (pages & model)

- **N-12** MEDIO — Sessions list page UI too basic (img #5).
  - `Done =` the sessions list renders inside the AppShell as Notion-style cards (sparkle header, primary "+ Nuova" CTA, session count, card per session with glyph/title/relative-activity/hover chevron), `SkeletonCard` loading, a proper empty state; all copy via i18n keys (IT), tokens only; E2E asserts list-in-shell + cards + count.
  - **FIXED (branch `agent/a4-sessions-pages`).** Rewrote `SessionsLandingPage.tsx` + `.module.css`. Added i18n keys `cesare.landing.{lastActivity,countOne,countMany,emptyTitle}` (EN+IT). E2E `tests/cesare-sessions-pages-ui.spec.ts` `[N-12]`. Screenshot `/tmp/a4-after-list.png`.
- **N-13** MEDIO — New-session **full-screen landing should live INSIDE AppShell**, not a bare takeover (img #6).
  - `Done =` the new-session landing renders inside the AppShell (rail + TopBar present), centring the glowy composer within the main lane — no focus mode / `data-shell="focus"`; E2E asserts rail present (non-zero width) + non-focus on click-through and deep-link.
  - **FIXED (branch `agent/a4-sessions-pages`).** Removed `useRequestShellFocus()` from `NewSessionLandingPage.tsx`; `.page` now `flex:1 1 auto` centred in the lane; softened the glow ring (wider inset + heavier blur + lower opacity — was a hard conic "X"). Updated the legacy focus-mode assertions in `tests/cesare-new-session-fullscreen.spec.ts` + new `[N-13]` E2E. Spec 52 revised. Screenshot `/tmp/a4-after-new.png`.
- **N-14** MEDIO — Session conversation page: **EN/IT language mix** + UI too basic (img #7).
  - `Done =` all conversation-page copy routes through i18n keys (IT values present — no hardcoded strings); chat layout with a pinned header, scrolling thread, and a composer docked at the bottom; tokens only; E2E asserts IT copy (subtitle + composer placeholder) + composer docked below the thread.
  - **FIXED (branch `agent/a4-sessions-pages`).** Audit confirmed the page already routes every string through `t()` (the walk's EN was the account locale); reworked `SessionConversationPage.tsx` + `.module.css` into a full-height chat layout (header / scroll thread / docked composer). E2E `[N-14]` in `tests/cesare-sessions-pages-ui.spec.ts`. Screenshot `/tmp/a4-after-conversation.png`. NOTE: the conversation **header title** still reads the DB `session.title` ("Nuova sessione") — auto-naming from first message is **Spec 53 (not built, out of A4 scope)**.
- **N-15** QUESTION — Navigating between pages: should it spawn a **new session** or keep the same one? Design decision (img #10).

### Topic 4 — Logline & narrative nav

- **N-16** ALTO — ~~**Clicking the logline opens nothing** in some state~~ **FIXED (Spec 57)**. Root cause: the shared `Popover` primitive positioned itself with absolute CSS + a fixed width and **no viewport-collision handling**. At 1440 the centred TopBar pill's 480px popover just fit; on any narrower width (smaller window or a split/peek lane compressing the lane) it overflowed off the right edge → appeared to open nothing. Fix: primitive now portals + clamps/flips to the viewport (`computeAnchoredPosition`) and caps `max-inline-size`. Regression: `tests/documents/logline-popover-viewport.spec.ts` (1440/768/390).
- **N-17** MEDIO — ~~**"Soggetto" missing from the sidebar nav"**~~ **FIXED (Spec 57)**. Not missing — the EN label for `soggetto` was wrongly "Treatment outline" (colliding with the real "Treatment" item); with EN labels showing, Valerio read the first item as not-Soggetto. Corrected the EN label to "Soggetto" in all four key sites.

### Topic 5 — Narrative editor chrome

- **N-18** MEDIO — Screenplay: **remove the white border**, want only the centered text page (img #16).
  - `Done =` no `.editorSlot` card frame around the editor; the page shell carries no box-shadow; the centered text column sits flat on the `--ds-bg` canvas (`--radius-none`, the only surface allowed it). E2E asserts the page-shell ancestor has `border-top-width: 0px` + `box-shadow: none`.
  - **FIXED (`agent/a5-screenplay-chrome`, Spec 55a).** `ScreenplayEditorShell` renders the editor directly (the `.editorSlot` card border/radius/bg dropped); `.pageShell` lost its `box-shadow`. E2E `tests/screenplay-editor/screenplay-chrome.spec.ts` N-18.
- **N-19** ALTO — Screenplay top element-tabs (SCENE/ACTION/…) look hardcoded or buggy; **imports + previously-available functionality missing** from the toolbar; move these controls (img #17).
  - `Done =` element-type tabs are a react-aria `useToolbar` strip with roving arrow-key focus (one tab stop); export PDF/Fountain + import PDF/Fountain + Versioni (+ renumber + title page) all live in the single TopBar `screenplay-actions-menu`, registered via the A1 context-action registry; the in-editor `actionsBar`/`ToolbarMenu` is retired.
  - **FIXED (`agent/a5-screenplay-chrome`, Spec 55a).** Registry `screenplay` segment in `context-actions.ts`; `ScreenplayEditor` builds the handlers, calls `useContextActions("screenplay", …)` and publishes the `ActionsMenu` into the TopBar via `useTopBarSlotPublisher`; `ScreenplayElementChips` wrapped in `useToolbar`. Unit `context-actions.test.ts`; E2E `screenplay-chrome.spec.ts` N-19 + migrated export/import/versions specs.

### Topic 6 — i18n leaks

- **N-20** ALTO — EN/IT mix across narrative + sessions + shell (e.g. "Continue screenplay", "Export PDF", "Saved", "2 online", session titles) (img #3,#7,#8,#16,#17,#20). Maps to audit A-05/A-06.
  - **FIXED (narrative+sessions+shell scope) on `main`.** Two classes: (a) **hardcoded `it-IT`/`en-US` formatters** → centralized in `packages/domain/src/i18n/format.ts` (added `formatTime`/`formatDateTime`/`formatInteger`/`formatCurrencyEUR`, joining the pre-existing `formatDate`/`formatNumber`), now consumed via `useLocale()` in `VersionsSplitDrawer`, `versions/VersionsList`, `NotificationCenterDrawer` (the `formatTime`→`formatRelativeTime` rename), `NarrativeCesarePanel`, `FreeNarrativeEditor`. (b) **hardcoded user-visible English** → `SaveStatus` ("Saved/Saving…/Unsaved/Error") now `documents.saveStatus.*`; `PresenceIndicator` ("N persone online" + the EN `online` suffix + `offline`) now `shell.presence.*`. Tests: `format.test.ts` (6, locale-discriminating), `keys.test.ts` parity green; E2E `narrative-editor` saved-status locator made locale-robust (matches the `saved` CSS-module class, not the text). **DEFERRED to N-28/A-05 (production pages):** budget/breakdown/schedule/fundraising formatters (~40 sites) + `RecapStrip`/`cesare.server.ts` (breakdown/AI-context currency, not narrative UI) — out of the narrative-walk scope. **packages/ui IT defaults are NOT bugs** — they are framework-agnostic fallback props meant to be overridden by app-passed `t()` labels (mobile-companion rule); the app already overrides them.

### Topic 7 — Shell & settings polish

- **N-21** BASSO — Redundant **"Oh Writers" label under the logo** (project switcher when no project) (img #3).
  - `Done =` the redundant "Oh Writers" text under the logo is removed (logo stands alone when no project); Design judge screenshot-approves; matches Notion-style minimal header.
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** Root cause: `_app.tsx` defaulted `projectName` to `"Oh Writers"` when no project, so the shell rendered a redundant project row + wordmark. Now it is empty when no project → no project row, and `LeftRail brand.showLabel` hides the wordmark (the "O" mark stands alone). Screenshot `07-dashboard-no-wordmark.png`.
- **N-22** MEDIO — **Avatar click and gear both open the same page**; should differ: avatar → user settings, gear → project settings (img #17).
  - `Done =` avatar (TopBar account menu) → user settings route; gear → project settings route; they are distinct destinations; E2E asserts each opens its own page.
  - **FIXED (branch `agent/a1-spec55-shell-backbone`, MERGED to main `82202c6`).** In `AppShell` the avatar `onAvatar` → `/settings` (user) and gear `onGear` → `/projects/:id/settings` (project) — split into two handlers (was both `/settings`). E2E asserts each lands on its own pathname.
- **N-23** MEDIO — **Account settings page too narrow** (cramped column) (img #19).
- **N-24** BASSO — Project icon (e.g. "Non fa ridere"): unclear what it should open (img #4).

### Topic 9 — Spec 55 rollout to production surface (DEBT, deferred)

- **N-28** DEBT — **Spec 55 TopBar action standard not yet applied to the production pages** (budget, breakdown, schedule, locations). This fleet (Narrative Walk) intentionally scopes Spec 55 to the **narrative** surface (soggetto/sinossi/scaletta/trattamento/screenplay). The shell backbone (TopBar zones + action registry) lands app-wide via A1, but per-page action registration (export/versions) for the production pages is **out of scope** here. Valerio will analyse the production zones and file the specific bugs. Until then, Spec 56's single-home / shell-zone CI checks may report those routes as non-compliant — that is expected, not a regression. Tracked in `docs/BACKLOG.md` (ICEBOX).

- **N-29** BASSO (test debt) — **Two E2E specs hardcode `http://localhost:3002`** in `page.goto` instead of using `BASE_URL`: `tests/schedule/schedule-export.spec.ts:140` and `tests/shooting-plan/shooting-plan-export.spec.ts:105`. They pass on the default port but misfire under a `WEB_PORT`/`BASE_URL` override (the exact confound that broke the A1 gate before `fixtures.ts`/`helpers.ts` were fixed in `82202c6`). Fix: route both through `BASE_URL`. Found during the A1 gate; out of scope there.

- **N-32** FIXED (`fix/n32-focus-toggle`) — **Screenplay focus mode had no clickable ENTER affordance and the in-editor "Exit Focus" button was hardcoded English.** Fix: a clickable **Focus** button (👁) in the editor Viewbar (`ScreenplayEditorShell`, `screenplay-focus-enter`) that dispatches the same `screenplay:toggleFocusMode` event the keyboard shortcut fires — so the editor keeps owning the focus state, and touch/iPad (no keyboard) can now enter focus mode. The in-editor exit button now reads the existing `screenplay.shell.exitFocus` key ("Esci da Focus" / "Exit Focus"). E2E: `screenplay-chrome.spec.ts` N-32 (enter → localised exit → exit restores chrome). _(Bonus: hardened the N-19 menu test — `menu-item-export-fountain` is `hasContent`-gated and the clean seed leaves the screenplay's live doc empty (N-31 seed gap), so it's no longer asserted there; export-Fountain stays covered by `screenplay-export.spec.ts`.)_

- **N-31** MEDIO (test debt) — **The `tests/editor/` + `tests/screenplay-editor/` suites are NOT in CI** (qa.yml runs only `tests/route-smoke.spec.ts`), so they rotted silently. Two rot classes surfaced during the A5 gate: (a) **stale EN form locators** — `getByLabel(/title|format/i)` + `getByRole("button", { name: /create/i })` on the now-IT `/projects/new` form (`save-indicator`, `screenplay-authoring`, and others; `pdf-import` already fixed in A5 to `#title`/`#format`/`button[type=submit]`); (b) **stale content assertions** — `expect(getEditorContent()).toContain("NON FA RIDERE")` in `editor.spec.ts:31` (the title moved to the title-page doc in `33dbe58`, never in the body fountain); (c) **DB-truncation races** — specs that create their own project in `beforeAll` (e.g. `pdf-import`'s "The Wolf") lose it when another spec's seed truncates mid-run, so they pass solo but flake in a full-file/suite run. A5 fixed the shared `testProjectId` fixture (now returns the stable seeded `TEST_PERSONAL_PROJECT_ID` instead of a non-deterministic dashboard scrape) which recovered ~24 of these; the rest are pre-existing, out of A5 scope. Fix: wire these suites into CI + sweep the stale locators/assertions + give per-spec projects isolation from the global truncate.

### Topic 10 — Resilience

- **N-30** FIXED (`fix/route-error-boundary`, Spec 60) — **`Cannot use 'in' operator to search for 'IP_DIFF' in null` rendered as a bare, unstyled full-page crash** on a session/event detail during the walk. The _specific_ throw was **not reproducible on current `main`** (every session/conversation/edit/diff/version/event-detail path verified live with real AI — likely already fixed by a post-walk merge, or a rare data condition). The real bug class fixed here: **a render throw had no app-owned boundary**, so it escaped to TanStack's bare default page (whole app blanked, real stack lost). Fix = one app-wide `defaultErrorComponent` (`RouteErrorBoundary` → `RouteErrorFallback` in `packages/ui`): branded fallback, shell chrome survives, "Riprova"/"Torna alla dashboard", collapsible stack, and the real error logged as a structured `route.error.boundary` client event. Tests: `RouteErrorFallback.test.tsx` (4), E2E `route-error-boundary.spec.ts` (3, forced via dev/test-only `/crash-test`).

### Topic 8 — Feature idea (ICEBOX, needs spec)

- **N-25** FEATURE — **Live-draft via Cesare**: ask Cesare to write the soggetto → opens a SplitDrawer with a blank sheet → user dictates, Cesare writes & applies live → "ok, caricalo" commits it. Cesare can also **upload/attach a document**. (img #8) → own spec, not now.

## Archived

### BUG-001/002/003 — narrative editor (Enter, counters, list button) — **Fixed, spec 04e (2026-04-18)**

Tiptap ↔ React 19 re-render coupling; replaced Tiptap with vanilla ProseMirror. Placeholder
fix: `Decoration.node` + CSS `::before`. E2E: `tests/documents/narrative-editor-regressions.spec.ts`.

### BUG-004 — "32 failing Playwright tests" (2026-04-18) — **Likely obsolete, revalidate**

Triaged as tech debt in April (screenplay pmDoc mount + title-page autosave race). The UI
had a full v3 redesign since and CI E2E (mock-ui) is green, so this snapshot is almost
certainly stale. Do NOT treat as open — if a specific spec is red today, log it as a fresh
BUG-NNN with a current repro.
