# Spec 47 — Cesare Fix Fleet (iter-1)

Orchestrated multi-agent fix pass. Base branch: `integ/ux-notion-v3-qa-iter-1` (HEAD `b8da9cf`).
Each agent works in its **own git worktree**, writes code + unit + **E2E (prioritised)** tests,
verifies live with playwright/chrome-agent, then submits for the three judgements:
**Design → QA → Lead**. Any judge may bounce the work back with concrete reasons.

## Canonical references (read first)

- `docs/specs/44-shell-refactor-notion-style.md` — shell + CesareDrawer + SplitDrawer model
- `docs/specs/46-split-drawer.md` — `?peek=` routed side-peek + sessions route
- `CLAUDE.md` "Agentic Edit Pattern" + "Never Do"

## The six agents

### A1 — Chat message round-trip (msg appears + arrives)

Bug: user types → bubble does not appear immediately / unclear if it reaches server.

- Guarantee optimistic user bubble renders **synchronously** on submit, every page, even if `askCesare` is null or session is mid-swap (do not let a session reset wipe the just-sent bubble).
- Surface a clear in-flight state and a clear delivered/failed state.
- E2E: type on each Cesare-enabled page → bubble visible < 100ms; assistant reply or typed error always lands.
- Co-owned with A2 (same send path). A1 owns the **client message lifecycle**; A2 owns the **stream transport**.

### A2 — Live trace via real streaming (cross-page, cross-domain)

Bug: no live trace ("Cesare sta leggendo la sceneggiatura → sta scrivendo la v2 del soggetto → Fatto").
User requirement: **must work for EVERY page and EVERY request type, including cross-domain** (a request
on Sceneggiatura that writes the Soggetto, etc).

- `cesare.server.ts` is request/response today (no streaming). Add a **streamed transport** (SSE/ReadableStream
  via a `createServerFn` streaming response or a dedicated route) emitting typed step events:
  `reasoning | reading{entity} | writing{entity} | tool{name} | done{result}`.
- Step events render as the inline Step Block trace (`N passaggi › Thought › Aggiornato <Entity> › Fatto › result card`)
  using the existing `ChangeTrace` / `CollapsibleNote` primitives.
- Transport must be page-agnostic and domain-agnostic: the same stream contract serves Soggetto/Sinossi/Scaletta/
  Trattamento/Sceneggiatura/Breakdown/Budget/Calendario/Location and any tool that mutates any entity.
- Keep `<!--ohw:...-->` marker side-channels working (or migrate them into typed stream events).
- E2E: a write request shows reading→writing→done steps live before the final result card.

### A3 — Cesare header command trim (Notion-minimal)

Bug: too many icons in the Cesare chat header.

- Reduce to the Notion AI set (see Image #1): agent name + session selector ⌄ · share/export · new-chat · open-as-page · `…` overflow · `−` minimise · (state controls). Bell/avatar/gear stay ONLY when carried from the dock per spec 44 — audit whether they belong here or move to `…`.
- Move secondary actions into a `…` overflow popover (react-aria `useMenu`).
- Pure chrome; do not touch chat/stream logic. E2E: header shows only the allowed primary icons; overflow opens.

### A4 — Drawer → Notion split-drawer refactor

Bug (Image #2): the current drawer should become a Notion-style **split drawer** that **collapses the page**
to give Cesare a dedicated column. Use the `SplitDrawer` primitive + `?peek=` host (spec 46) — main lane
`min-width:0; flex:1`, drawer lane token width ~50%, page reflows narrower (NOT a floating overlay for this mode).

- This is the routed side-peek surface. Reconcile with the floating `CesareDrawer` (spec 44): floating = quick chat;
  split = dedicated column. Define which is authoritative; do not duplicate chat containers.
- E2E (OHW-046 style): open split → main lane width drops >0; ×/ESC/back restore.

### A5 — Sidebar "Cesare" entry + sessions route

Bug (Image #3): add a LeftRail entry dedicated to Cesare that opens the **full Cesare page**
(`/projects/:id/sessions` or the Notion-AI landing). Clicking a **session** opens its full chat
(`/projects/:id/sessions/:sessionId`, spec 46 sessions route — a real central route, not a peek).

- LeftRail "Agents/Cesare" section listing sessions; "+ Nuova".
- E2E: click rail Cesare → lands on sessions page; click a session → full conversation; deep-link works; sad path (foreign session id) → not-found, no leak.

### A6 — "Mostra / Nascondi modifiche" end-to-end (Notion)

Bug (Image #4): the show/hide-changes button must work end-to-end. The discriminant
is **which Cesare SURFACE** is open, not an internal drawer-state enum:

- **Cesare bottom-right (floating drawer)** → the document is visible, so the toggle
  shows/hides the **diff inline on the live document** (verde aggiunte / rosso rimozioni,
  word-level, in-place). NOT a generic ring — a real coloured diff on the open doc.
- **Cesare full-page session** (opened by clicking a session in the sidebar →
  `/sessions/:sessionId`, where the chat fills the view and the doc is NOT visible) →
  the toggle opens the **SplitDrawer** with the target page + diff beside the chat.
  The SplitDrawer is **routed** (`?peek=<target>`, deep-linkable/shareable) per Spec 49.

Why the branch (not Notion-identical): Notion AI is always a small side drawer, so it
can always diff inline. We additionally have a full-page session surface where the doc
is covered — there the inline toggle would show nothing, so it opens the routed split.

- `↩ Annulla` reverts the auto-created version in BOTH surfaces.
- Depends on A2 (real trace markers) + A4 (split-drawer) + A5 (sessions full page). Wave 2.
- **Note (re-QA at gate):** the merged A6 keyed the branch on `surface`/`drawer.state`
  and painted a ring on `<main>`. Verify against THIS contract — the inline case must be a
  real word-level coloured diff, and the full-page case must be the routed `?peek` split.
- E2E: bottom-right Cesare → toggling shows/hides the inline coloured diff; full-page
  session → opens the routed split with diff; Annulla reverts (version restored) in both.

## Waves & dependencies

- **Wave 1 (parallel):** A1+A2 (one worktree, streaming foundation), A3, A4, A5
- **Wave 2:** A6 (blockedBy A2, A4)
- After each wave: **Design judge → QA judge → Lead judge**. Bounce-backs re-open the agent's task.

## Judges (every wave)

- **Design judge** — knows how oh-writers + Notion look; approves or rejects a graphic fix and sends it back. Compares against `docs/specs/mockups/shell-canva-notion.html` + the four reference screenshots in the brief.
- **QA judge** — runs `pnpm test:unit`, `pnpm test:e2e` (the new OHW-047 tags), Cesare cost smoke; verifies happy+sad paths; bounces on red or missing tests.
- **Lead judge** — orchestrates series/parallel, verifies E2E functionality end-to-end and that codebase quality matches the conventions (deep modules, neverthrow, Zod, react-aria, CSS Modules, English identifiers). Final authority on merge to `integ/ux-notion-v3-qa-iter-1`. **MANDATORY: the Lead's final end-to-end pass runs against the REAL, NON-MOCKED Cesare (live Anthropic API, `MOCK_AI` unset/false).** Agents and the QA judge may use `MOCK_AI=true` for fast dev, but the Lead must prove the streaming trace, cross-domain writes, and Mostra/Nascondi flow all work with the real model before merging. Mock-only green is not sufficient to pass the Lead gate. Use the existing `ANTHROPIC_API_KEY` already configured in `apps/web/.env` — do not request or add a new key, and never log it. **Cost discipline: keep the non-mocked pass to a minimal smoke — ~4 targeted Cesare requests total (one streaming trace, one cross-domain write, one Mostra/Nascondi floating, one full-page split), short prompts, cheapest viable model.** Do NOT run the full E2E suite or cost smoke against the live API — those stay on `MOCK_AI=true`. Live Cesare is only for the few things the mock cannot prove.

Each agent (and each judge) has authority to send a sub-agent back when the requested thing is not actually functional or the design is wrong.

## Test tags

`[OHW-047-A1]` … `[OHW-047-A6]`. Prioritise E2E over unit. Every agent ships both.
