# Spec 44 — Shell Refactor: Notion-style Cesare + Canva Left Rail

## Context

The current shell is read by users as "confusionario, poco agentic":

- Cesare lives as a bottom-sheet drawer scoped per page; chats are not resumable.
- The top bar tries to do too many things (project switch, section tabs, version, save state, scope chip).
- Per-page right panels (Breakdown `CATEGORIE/CESARE`, Soggetto margin notes, Sceneggiatura "Cesare sta leggendo…") duplicate state and rob horizontal space from the editor.
- Avatar, settings, bell, Cesare pill live in separate corners — no single command surface.

The refactor introduces:

- A **Canva-style Left Rail** that owns project identity, Document Type / Production View navigation, Cesare Sessions (when expanded), Recents, and tool icons.
- A **Notion-style Cesare floating sub-window** anchored bottom-right with four states (`closed` / `expanded` / `peek` / `full`). The editor NEVER reflows.
- A **slim Top Strip** that only holds per-page concerns (breadcrumb, scope chip, version, save). Sceneggiatura adds an Element Legend row.
- A **Bottom Dock** (`bell · avatar · gear · ✦ Cesare`) anchored bottom-right; hidden when Cesare is expanded/peek/full (its icons move into the Cesare header) so the user always has a single centre of gravity.
- A unified **AppShell collapse** (`full` / `collapsed` / `focus`) replacing the legacy per-page Focus mode.
- A new **shared `CollapsibleNote` primitive** powering both margin notes (writing pages) and Step Blocks (Cesare).

Reference HTML mockup: [`docs/specs/mockups/shell-canva-notion.html`](./mockups/shell-canva-notion.html) — this is the visual source of truth.

## Goals

1. Editor space wins. Editor never reflows when Cesare opens/closes.
2. One Cesare, one chat thread per session, multiple sessions per project. Resumable.
3. One command surface (Dock OR Cesare header — never both at once).
4. Per-page chrome ≤ 1 row (Top Strip) — except Sceneggiatura which adds an Element Legend row.
5. Single React primitive for collapsible note-style content (margin notes + Step Blocks).

## Non-goals

- Mobile / PWA narrow-viewport rail behavior (container queries cover it; not redesigned).
- Replacing Monaco / Yjs / Fountain logic.
- Reintroducing a reserved-column Cesare under any preference flag.
- Rebuilding any per-page view's body (Breakdown grid, Budget table, Locations map) beyond what each mitigation section requires.

## Glossary (canonical)

- **Left Rail** — fixed left column. Project identity + Document Type / Production View nav + Sessioni Cesare (visible only when Cesare expanded/full) + Recents + tool icons. Replaces old TopBar section tabs.
- **Top Strip** — slim per-page header above editor. Breadcrumb + scope chip + version pill + save state. NO project name, NO section tabs.
- **Element Legend** — second row of the Top Strip, only on Sceneggiatura. Hosts `SCENE · ACTION · CHARACTER · DIALOGUE · PAREN · TRANSITION` legend + Indice + Focus + Esporta.
- **Bottom Dock** — floating pill bottom-RIGHT: `🔔 · 👤 · ⚙ · │ · ✦ Cesare`. Hidden when Cesare ≠ closed.
- **Cesare Panel** — Notion-style floating sub-window bottom-right (max ~480×640px). Editor never reflows. States: `closed | expanded | peek | full`. Header order: agent name + context chip · sessions selector · | · bell · avatar · gear · `↗` · `↙` (only in full) · `−` · `×`.
- **Full-page** — Cesare drawer state covering the whole viewport (Notion `»` pattern). Rail + Top Strip + Dock all hide; Cesare gets a centred max-780px column.
- **Cesare Drawer** — Cesare-only floating panel anchored bottom-right (Notion AI chat pattern). States: `closed | peek | expanded | full`. **Never** anchors as a side column — Cesare always lives bottom-right. `expanded` = floating 480×640 sub-window; `full` = whole viewport. Owns: header (agent + context tags + session selector + window-control icons), body (messages + Step Blocks), sticky footer (quick prompts + composer with file/scope chips). The Drawer is the **only** Cesare surface in the app — there is no second chat container anywhere else.

- **SplitDrawer** — separate shared `packages/ui` primitive for **right-anchored auxiliary panels** (the Notion `»` chevron pattern from Image 20). Used by features that need to occupy half the viewport while keeping the page reachable on the left. Has nothing to do with Cesare. States: `closed | open | full`. `open` = right column ~50% viewport (drag-resize left edge, min 360 max 60vw); `full` = whole viewport. The page reflows narrower when `open`. Consumers: `VersionsDrawer` (versions list + diff side-by-side), `NotificationCenterDrawer` (bell cronologia with click-to-jump-and-pulse), `DocumentBrowserDrawer` (future), `DiffViewer` (future). Each consumer is a thin wrapper around `SplitDrawer` that supplies its own header / body / footer JSX.
- **Peek** — minimal floating bar bottom-right showing agent name + last activity. Replaces the dock pill while peeking.
- **AppShell Shell State** — `full` (rail 240px locked open + topstrip + dock) | `collapsed` (rail hidden, **hover top-left edge reveals it as a temporary overlay** that auto-hides on mouseleave, like Notion's collapsed sidebar) | `focus` (rail + topstrip + dock hidden, NO hover-reveal). Toggled via `⌘\` (Notion shortcut) for full↔collapsed and `⌃⌥F` for focus. Persisted per user.

- **Hover-reveal**: when `data-shell="collapsed"`, the rail is hidden but a 4px-wide hover sentinel sits at the left viewport edge. Mouse enters → rail slides in as a temporary overlay (z-index above editor, NOT a grid column). A `»` chip in the rail header lets the user "lock open" (returns shell to `full`). Mouse leaves the rail (and any of its menus) → rail slides out after a 300ms grace period. Touch/keyboard equivalents: hamburger icon top-left (always visible in `collapsed`, hidden in `focus`) + `⌘\` shortcut.
- **Cesare Session** — one resumable chat thread per project. Persisted (`cesare_sessions` table). User can hold many sessions per project.
- **Step Block** — inline collapsible primitive inside an assistant message when Cesare runs tools. Lists steps (`Thought / Read / Tag / Update`) and exposes `Mostra modifiche / Annulla` on completed write actions.
- **CollapsibleNote** — shared `packages/ui` composite used by both margin notes and Step Blocks. `{ kind: 'cesare' | 'user', title, body?, actions?, defaultOpen? }`.

## Architecture

### New components / files

```
packages/ui/src/shell/LeftRail/                   ← new
  LeftRail.tsx + LeftRail.module.css

packages/ui/src/shell/BottomDock/                 ← new (replaces FloatingDock)
  BottomDock.tsx + BottomDock.module.css

packages/ui/src/composites/CollapsibleNote/       ← new
  CollapsibleNote.tsx + CollapsibleNote.module.css

packages/db/schema/cesare-sessions.ts             ← new table

apps/web/app/features/predictions/sessions/       ← new
  sessions.server.ts        (createServerFn list/create/rename/delete)
  sessions.schema.ts
  useSessions.ts            (TanStack Query hook)
```

### Modified components

```
apps/web/app/features/app-shell/components/AppShell.tsx        ← new layout wiring
apps/web/app/features/app-shell/components/AppShell.module.css
packages/ui/src/shell/TopBar/TopBar.tsx                        ← slim + Element Legend slot
apps/web/app/features/predictions/components/CesareSheet.tsx   ← 4-state floating sub-window
apps/web/app/features/predictions/components/CesareSheet.module.css
apps/web/app/features/breakdown/components/BreakdownPage.tsx   ← drop right panel, add recap strip
apps/web/app/features/predictions/components/RecapStrip.tsx    ← new (extract from current right panel)
apps/web/app/features/documents/components/MarginNotesColumn.tsx  ← refactor to CollapsibleNote
apps/web/app/features/screenplay-editor/components/ScreenplayPage.tsx  ← surface Element Legend via TopBar slot
apps/web/app/features/locations/components/LocationsPage.tsx   ← split-pane list + map
```

### Cesare sessions schema

```ts
// packages/db/schema/cesare-sessions.ts
export const cesareSessions = pgTable("cesare_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Server functions in `apps/web/app/features/predictions/sessions/sessions.server.ts`:

- `listSessions({ projectId })` → `ResultAsync<CesareSession[], DomainError>`
- `createSession({ projectId, title })` → `ResultAsync<CesareSession, DomainError>`
- `renameSession({ id, title })` → `ResultAsync<CesareSession, DomainError>`
- `deleteSession({ id })` → `ResultAsync<void, DomainError>`
- `touchSession({ id })` → bumps `lastMessageAt` after every assistant turn

Each Cesare message must record its `sessionId` (FK). Extend the existing chat persistence accordingly.

### AppShell state model

`body` carries four attributes (driven by AppShell context):

- `data-view="screenplay | soggetto | sinossi | scaletta | trattamento | breakdown | budget | calendario | locations | inquadrature"`
- `data-cesare="closed | expanded | peek | full"`
- `data-shell="full | collapsed | focus"`
- `data-cesare-thinking="true | false"` (existing — accelerates pill halo)

Shell + Cesare states persist per user in `localStorage`; view comes from the route.

### Per-page mitigations

- **Sceneggiatura**: Element Legend in the Top Strip second row. No right panel. Cesare reads scenes via sub-window.
- **Soggetto / Sinossi / Trattamento**: margin notes column to the right of the page. Each note is a `CollapsibleNote`. When Cesare ≠ closed, notes remain single-line collapsed to keep readability.
- **Breakdown**: `RecapStrip` (cost + category chips + "Aggiungi al budget") above the editor, always scene-aware. Deep cost breakdown lives in Cesare sub-window. Drop legacy `CATEGORIE 7 / CESARE 1 ALERT` panel.
- **Budget**: table fills the editor area; no right column. Cesare provides line-producer analysis on demand.
- **Locations**: split-pane (list left ~340px, map right). Cesare scouting tools update the list reactively.

## Implementation work-packages

The refactor is split into 4 parallel work-packages + 1 lead validator + 1 QA + 1 junior docs. Each gets its own worktree.

### WP-A — Shell primitives & layout

Owner: **shell-agent** · Branch: `refactor/ux-notion-v3-shell`

- Build `LeftRail` (with Sessioni section, react-aria buttons, collapsed mode).
- Build `BottomDock` (animated `✦ Cesare` icon, hides when Cesare ≠ closed).
- Slim `TopBar` to one row + add optional Element Legend slot.
- Wire `AppShell.tsx` to drive `data-view / data-cesare / data-shell` body attrs.
- Implement Focus toggle (`⌃⌥F`) and chevron button.
- Centralize nav mapping in `features/app-shell/nav.ts`.

### WP-B — Cesare sub-window & sessions

Owner: **cesare-agent** · Branch: `refactor/ux-notion-v3-cesare`

- Refactor `CesareSheet.tsx` to render the new `CesareDrawer` from WP-DESIGN. WP-B owns chat state (messages, streaming, tool calls); WP-DESIGN owns drawer chrome (header / footer / states / resize / animations). Header includes embedded dock icons (bell/avatar/gear) when state ≠ closed.
- Implement Sessions dropdown (popover in header + selector in Left Rail).
- New `cesare_sessions` Drizzle migration + server fns + `useSessions` hook.
- Persist `sessionId` on every Cesare message (extend existing chat persistence).
- Render assistant tool runs as Step Blocks using `CollapsibleNote`.
- Wire `Mostra modifiche` / `Annulla` to the existing proposal store.
- Remove the legacy bottom-sheet drawer styling.

### WP-C — Per-page mitigations & shared primitives

Owner: **pages-agent** · Branch: `refactor/ux-notion-v3-pages`

- New `CollapsibleNote` composite (consumed by WP-B and this WP).
- Refactor `MarginNotesColumn` to render `CollapsibleNote`s.
- Extract `RecapStrip` from current Breakdown right panel; mount above editor on Breakdown view.
- Drop legacy right panel from `BreakdownPage.tsx`.
- Sceneggiatura: surface Element Legend via the new TopBar slot; remove the legacy Cesare reading card on the page body.
- Locations: refactor to split-pane (list + map).
- Update Soggetto / Sinossi / Trattamento to host the collapsible notes column.

### WP-D — Cesare notifications & cleanup

Owner: **notifications-agent** · Branch: `refactor/ux-notion-v3-notifications`

- Bell drawer (in `BottomDock` when Cesare closed; in Cesare header when Cesare ≠ closed) — single notification centre. Rendered via `SplitDrawer` (right-anchored, collapses the page).
- Remove `CesareNotificationPill` (per-page floating pill).
- Repurpose `cesare-notification-context.tsx` for the drawer only.
- Delete the old per-page pill stack mention in `AppShell.tsx`.
- Keep `pulseAffectedEntities` jump-and-pulse intact.

### WP-LEAD — Mockup-coherence validation + QA gate

Owner: **lead-validator** · Branch: `refactor/ux-notion-v3` (merge target)

- Holds `docs/specs/mockups/shell-canva-notion.html` as visual truth.
- After each WP merge: launches the dev server, navigates each view with `chrome-agent`, screenshots vs. mockup screenshots. Flags deviations and posts review comments back to the responsible WP agent.
- Runs `pnpm test:unit`, `pnpm test:e2e`, and the Cesare cost smoke. Blocks merge to `refactor/ux-notion-v3` if anything red.
- Final merge into `refactor/ux-notion-v3`.

### WP-QA — Test harness

Owner: **qa-agent** · Branch: `refactor/ux-notion-v3-qa`

- New Vitest specs for `CollapsibleNote`, `LeftRail`, `BottomDock`, `CesareSheet` state machine.
- New Playwright tags `[OHW-044-A]` … `[OHW-044-E]` covering:
  - Cesare states: closed → expanded → peek → full → closed (no editor reflow at any transition).
  - Shell states: full → collapsed → focus → full (rail width transitions, dock visibility).
  - Sessions: create, switch, rename, delete; cross-page persistence.
  - Per-page: Sceneggiatura Element Legend; Breakdown RecapStrip; Soggetto margin notes collapse when Cesare ≠ closed.
- Cost smoke for Cesare (Spec 43 compatibility) under new state model.

### WP-DOCS — Junior docs sync

Owner: **docs-agent** · Branch: `refactor/ux-notion-v3-docs`

- Update `docs/architecture.md` shell section to reflect new model.
- Update `docs/conventions/loading-states.md`, `docs/conventions/react.md` references to `MarginNotes` / `CesareSheet` / `FloatingDock`.
- Update `README.md` only if dev setup changes (it does not).
- Add `docs/specs/44-shell-refactor-notion-style.md` cross-references inside related specs (25 react-aria, 29 cesare-ui, 34 cesare-agentic, 41 inline edits) — one-line "superseded by Spec 44 for shell concerns" pointer.
- Sync `CLAUDE.md` "Never do" list if any new prohibitions emerged (e.g. "Never reintroduce reserved-column Cesare").

### WP-DESIGN — Visual polish + Cesare Drawer (Notion-class)

Owner: **design-agent** · Branch: `refactor/ux-notion-v3-design`

The Cesare Drawer is upgraded from a "floating sub-window" to a **first-class Notion-style drawer component** with all the affordances users expect from Notion AI / ChatGPT Canvas. WP-DESIGN owns the drawer; WP-B consumes it.

#### Drawer states + transitions

| State            | Anchor                        | Size                                                     | Shell visibility                         | Animation in                                         |
| ---------------- | ----------------------------- | -------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `closed`         | — (dock pill at bottom-right) | n/a                                                      | rail+topstrip+dock visible               | dock pill spring-in                                  |
| `peek`           | bottom-right                  | `auto × 44px` bar (pill-shaped)                          | dock hidden, peek visible                | slide-up from dock origin                            |
| `expanded`       | bottom-right                  | `min(480, 40vw) × min(640, 76vh)` (user-resizable)       | dock hidden                              | expand-from-corner: scale + translate from dock pill |
| `full`           | viewport                      | `100vw × 100vh`                                          | rail+topstrip+dock all hidden            | scale-up + fade                                      |

Cesare NEVER becomes a side column. The right-anchored `»` pattern belongs to `SplitDrawer` (separate primitive). Header buttons:

- `↗` → cycles `expanded` → `full` → back to `expanded`
- `↙` → step back
- `−` → peek
- `×` → closed

All transitions use `--ds-ease` (250ms). View Transitions API (`document.startViewTransition`) when available, CSS fallback otherwise.

#### Drawer header (sticky)

```
┌─────────────────────────────────────────────────────────┐
│ ✦ Cesare  ⌄ Sessione · BREAKDOWN          🔔 V ⚙  ↗ ↙ − × │
└─────────────────────────────────────────────────────────┘
```

- Agent name + sparkle.
- Session selector: dropdown popover listing the project's sessions; "+ Nuova" creates a new one. Active session title shown next to the agent name.
- Context tags: chip showing current page scope (`BREAKDOWN · Sc.2` etc.) + any pinned context (`📌 Atto II`). Tags are dismissible.
- Window-control icons rightmost: bell, avatar, gear (carried from Dock when state ≠ closed), then drawer-state controls (`↗ ↙ − ×`).

#### Drawer body

- Conversation: user bubbles (clay-50 background) right-aligned + assistant content (no bubble) left-aligned, max-width 92%.
- Step Blocks via `CollapsibleNote` — sticky timeline left-rail (`│ · ✓ · ✓ · ✓`) for the run, header collapsible.
- Inline action affordances: `[Mostra modifiche] [Annulla]` (leaf-themed buttons).
- Scroll-anchor: stays pinned to bottom unless user scrolls up; once user scrolls up, anchor releases and a "Vai alle nuove risposte" floating pill appears.
- Empty state: minimal "Chiedi qualunque cosa su [scope]" + 3 quick-prompt suggestions.

#### Drawer footer (sticky composer)

```
┌─────────────────────────────────────────────────────────┐
│ 📎 Soggetto · 🎬 Scena 2                       (chips)   │
│ Chiedi a Cesare…                                  ↑ ↓ ✦ │
└─────────────────────────────────────────────────────────┘
```

- **Scope chips** above input: shows the auto-attached context (current page, current scene). User can `×` a chip to drop that context, or `+` to attach more (file picker → other docs).
- Input: single-line growing textarea, `cmd+enter` submits, `/` opens a slash-command menu (future).
- Right side: voice (`↓`), submit (`↑`), magic (`✦` opens prompt enhancer).
- When Cesare is thinking: input greyed, send button replaced by `⏸ Stop`.

#### Drag-to-resize

- `expanded`: top edge handle resizes height (min 320px, max 76vh); bottom-left corner resizes both. Position is sticky bottom-right.
- Size persists in `localStorage` per user (`ohw.cesare.size`).

#### Visual rules (clean + minimal)

- **Backgrounds**: use ONLY `--ds-bg` (`#f5f3ee` warm linen) on shell-level surfaces and `--ds-surface` (`#ffffff`) on raised cards. NO custom grays, NO `#fafafa` variants. Cesare drawer surface = `--ds-surface`; drawer shadow `--ds-shadow-4` (`expanded` and `peek`). SplitDrawer in `open` state uses a left border + `--ds-shadow-2` (it's anchored, not floating).
- **Borders**: `--ds-line` (linen-300) for static borders, `--ds-line-soft` for ghost dividers. No 2px borders anywhere except active session in selector.
- **Typography**: drawer body uses `--ds-font-sans` (Inter). Agent name + session title in `--ds-font-display` (Fraunces) at 14px. Eyebrows in 10.5px caps `--ds-text-faint`.
- **Spacing**: padding inside drawer = `var(--ds-space-4)` body, `var(--ds-space-3)` header/footer. Gap between messages = `var(--ds-space-4)`.
- **Radii**: drawer corner = `var(--ds-radius-lg)` (12px) in `expanded`; squared in `full`; full pill in `peek`. Buttons inside drawer = `var(--ds-radius-md)` or `var(--ds-radius-pill)` for chips.
- **Motion**: every transition `var(--ds-duration-3) var(--ds-ease)`. No JS animation libraries. `prefers-reduced-motion` skips all transforms.

#### Cross-page visual audit

The agent runs `chrome-agent screenshot` on every view (Sceneggiatura / Soggetto / Sinossi / Scaletta / Trattamento / Breakdown / Budget / Calendario / Locations / Inquadrature) in the seed state and compares with the mockup. Reports a checklist of:

- backgrounds match `--ds-bg` (no rogue `#xxx` shades)
- text contrast ≥ WCAG AA on every surface
- editor pixel-stable across `data-cesare` and `data-shell` toggles
- no orphan borders, double dividers, or duplicate chrome
- typography hierarchy intact

Findings become inline PR comments on the WP-A/B/C/D branches; design-agent does NOT directly fix per-page bodies — it flags + provides token replacements.

#### SplitDrawer (Notion `»` pattern — separate primitive)

`SplitDrawer` is a SECOND, completely separate primitive from Cesare. It powers right-anchored auxiliary panels that occupy roughly half the viewport while the page reflows narrower on the left (Image 20 in the conversation).

States: `closed | open | full`.
- `closed`: not rendered.
- `open`: right column, `min(640, 50vw) × 100vh`, drag-resize left edge (min 360px, max 60vw). Page reflows narrower. Left border + `--ds-shadow-2`.
- `full`: viewport. Rail + Top Strip + Dock all hidden (same Focus behavior as Cesare `full`).

Header buttons:
- `↗` → `open` → `full`
- `↙` → step back
- `×` → closed

Public API: `<SplitDrawer state, onStateChange, header, children, footer?, size?, onSizeChange? />`. WP-DESIGN ships it as a packages/ui composite. WP-D wires the bell `NotificationCenterDrawer` to it. Versions/Document Browser/Diff are future consumers.

#### Cross-component flow: Cesare full-page → SplitDrawer with target page + trace

The most important interaction the user wants to support (per Image 14 + Image 20):

1. User opens Cesare to `full` (chat centred, max-780px column, rail/topstrip/dock hidden).
2. While reading an assistant message that ran a write tool, the user clicks the inline `[Mostra modifiche]` affordance inside the Step Block.
3. A `SplitDrawer` opens to the RIGHT (state `open`), containing:
   - **Header**: target page name + scope (e.g. `Soggetto · Atto II`) + window controls (`↗` full · `↙` step back · `×` close).
   - **Body**: the target page rendered in a read-only `mode="trace"` embedded view, with a **Trace overlay** highlighting Cesare's edits (additions `--ds-diff-add-*`, deletions `--ds-diff-remove-*`, intra-line `--ds-diff-intra`). A trace timeline pinned to the drawer's left edge: `│ ✓ replace · ✓ append · ✓ rename` — clicking a node scrolls the body to that edit.
   - **Footer**: `[Accetta tutto] [Rifiuta tutto]` + pending-edits count.
4. The Cesare full-page chat narrows automatically to make room — it stops being `100vw` and becomes the left column. Rail/topstrip/dock stay hidden (still `full` mode), but the viewport is now `[chat | SplitDrawer]`.
5. User clicks the SplitDrawer's `↗` → SplitDrawer becomes `full`, Cesare chat retreats to `peek` bottom-right.
6. User closes the SplitDrawer → Cesare returns to `full` chat.

Same mechanism powers:
- **VersionsDrawer** → pick a version → SplitDrawer renders the doc at that version + diff vs current.
- **NotificationCenterDrawer** → click a Cesare notification → SplitDrawer renders the affected page with the same trace.

Shared contract: `<TargetPagePreview pageRef, traceMarkers, onAccept, onReject />` — a thin wrapper around the route's component in `mode="trace"`. WP-C surfaces this mode in each per-page body.

#### Deliverables

- `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx` + `.module.css` — the Cesare bottom-right drawer (WP-B consumes it).
- `packages/ui/src/composites/CesareDrawer/use-drawer-state.ts` — `ts-pattern` reducer for the 4 Cesare states.
- `packages/ui/src/composites/CesareDrawer/use-drawer-resize.ts` — drag-to-resize hook (top edge only; uses `react-aria` `useMove`).
- `packages/ui/src/composites/SplitDrawer/SplitDrawer.tsx` + `.module.css` — the right-anchored panel primitive.
- `packages/ui/src/composites/SplitDrawer/use-split-drawer-state.ts` — `ts-pattern` reducer for the 3 SplitDrawer states.
- `packages/ui/src/composites/SplitDrawer/use-split-drawer-resize.ts` — drag-to-resize hook (left edge only).
- A short `docs/specs/44-design-notes.md` companion documenting the token decisions + visual audit findings.

## Tests

| Tag           | What                                                                     | File                                             |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| `[OHW-044-A]` | Cesare 4-state transitions; editor width pixel-stable across all states  | `apps/web/tests/e2e/shell-cesare-states.spec.ts` |
| `[OHW-044-B]` | Shell 3-state transitions; Focus mode keyboard shortcut                  | `apps/web/tests/e2e/shell-collapse.spec.ts`      |
| `[OHW-044-C]` | Cesare sessions CRUD; cross-page thread persistence                      | `apps/web/tests/e2e/cesare-sessions.spec.ts`     |
| `[OHW-044-D]` | Per-page mitigations: legend, recap strip, margin notes collapse         | `apps/web/tests/e2e/shell-per-page.spec.ts`      |
| `[OHW-044-E]` | BottomDock visibility rules; bell drawer single source                   | `apps/web/tests/e2e/shell-dock.spec.ts`          |
| Vitest        | `CollapsibleNote`, `LeftRail`, `BottomDock`, `CesareSheet` state reducer | colocated `.test.ts` next to source              |

## Verification

1. `pnpm dev` (docker-compose.dev.yml for postgres + redis).
2. Navigate `/projects/<seed-id>/breakdown` — confirm rail left, slim Top Strip, recap strip above editor, no legacy right panel, dock bottom-right.
3. Click `✦ Cesare` in dock → sub-window appears bottom-right; verify editor width unchanged (pixel-stable). Click `↗` → full-page; rail + topstrip + dock hide. Click `↙` → restore.
4. Open Sessions selector → create new → previous remains in list with timestamp; switch back → chat restores.
5. Trigger a write tool (Soggetto: "espandi atto II") → Step Block in chat; `Mostra modifiche` opens version diff overlay; `Annulla` reverts.
6. `⌃⌥F` → focus mode; rail + topstrip + dock hidden; Cesare peek visible bottom-right.
7. Navigate Sceneggiatura → confirm Element Legend row in Top Strip; no right panel; Cesare available via dock.
8. `chrome-agent screenshot` each view → compare with `docs/specs/mockups/shell-canva-notion.html` rendered states; lead validator gate.
9. `pnpm test:unit && pnpm test:e2e` → green.

## Risks & mitigations

- **Cesare floating covers part of editor** → editor scrolls under; users do most editing at top of page; documented as accepted trade-off. Peek state lets users park Cesare while writing.
- **Session migration for existing chats** → seed all existing messages into a single "default" session per project × user on migration. New sessions opt-in.
- **State explosion (view × cesare × shell)** → 10 × 4 × 3 = 120 combos. Reduce risk via reducer with `ts-pattern` exhaustive matching for transitions; Vitest covers the reducer.
- **chrome-agent visual diff is fuzzy** → lead validator augments visual screenshots with explicit DOM assertions (data-testid presence, computed CSS values for editor width).
