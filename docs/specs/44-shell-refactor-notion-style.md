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
- **Peek** — minimal floating bar bottom-right showing agent name + last activity. Replaces the dock pill while peeking.
- **AppShell Shell State** — `full` (rail 240px + topstrip + dock) | `collapsed` (rail 56px icons-only) | `focus` (rail + topstrip + dock hidden). Toggled via top-left chevron + `⌃⌥F`. Persisted per user.
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

- Refactor `CesareSheet.tsx` into the 4-state floating sub-window. Header includes embedded dock icons (bell/avatar/gear) when state ≠ closed.
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

- Bell drawer (in `BottomDock` when Cesare closed; in Cesare header when Cesare ≠ closed) — single notification centre.
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
