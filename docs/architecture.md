# Architecture

## Stack

### Frontend

- **TanStack Start** — full-stack framework, SSR, file-based routing
- **TanStack Router** — type-safe routing with Zod-validated search params
- **TanStack Query** — server state, caching, optimistic updates
- **Monaco Editor** — screenplay editor with custom language extension (desktop). Planned migration to CodeMirror 6 for mobile. Fountain domain logic (`fountain-element-detector`, `fountain-element-transforms`, `fountain-constants`) is editor-agnostic; only the glue files (`fountain-keybindings`, `fountain-autocomplete`, `fountain-language`) are Monaco-specific.
- **Yjs** — CRDT for real-time collaboration (online only)
- **y-websocket** — WebSocket provider for Yjs sync between clients
- **CSS Modules** — styling with custom properties, zero runtime overhead

### Backend

- **TanStack Start `createServerFn`** — all server logic, co-located with features
- **Hono** — lightweight HTTP server for WebSocket (Yjs provider) and webhooks
- **Better Auth** — authentication, sessions, OAuth, team/org

### Database

- **PostgreSQL** — primary database
- **Drizzle ORM** — type-safe query builder, migration-first
- **Drizzle Kit** — CLI for migrations and seed
- **Redis** — sessions, cache, pub/sub for real-time presence

### AI

- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) — the transport to Claude (`generateText` / `streamText` / tool-calling). This is the model layer; we do not call raw `@anthropic-ai/sdk` from feature code.
- **Effect-TS** is the orchestration engine of the AI bounded context (`features/predictions` + the AI server fns of other features + the shared client). Effect *wraps* the AI SDK — it does not replace it — adding structured interruption, typed retry/timeout, resource lifecycle (Layers), and bounded concurrency. See [Spec 48](specs/48-effect-ai-context.md).
- **Layers**: `Db`, `Access` (session resolved from request headers — see Learnings), `AiClient` (single home for retry/timeout/rate-limit), `Observability` (Langfuse seam). An anti-corruption layer at the `createServerFn` boundary converts `Effect<A, E, R>` → the canonical `ResultShape`, so every server fn's external contract is unchanged and the rest of the app never sees Effect.
- Server-side calls only — Anthropic + Google Places keys never exposed to the client.

### Error Handling

- **Two coexisting models, one boundary.** Inside the AI bounded context: **Effect** (`Effect<A, E, R>`, typed error + requirement channels). Everywhere else: **neverthrow** (`Result<T, E>` / `ResultAsync<T, E>`). The `createServerFn` seam is the single translation point (Effect → `ResultShape`); callers always see `ResultShape`.
- Typed domain errors per feature with a `_tag` (`NotFoundError`, `ForbiddenError`, `ValidationError`, `DbError`, `CesareError`, `AnthropicError`, …).
- `try/catch` only for programming errors / unrecoverable states (and parsing 3rd-party I/O); never for expected failures.
- React Error Boundaries for UI-level errors.

### Infrastructure

- **Docker Compose** — PostgreSQL + Redis only in local dev (`docker-compose.dev.yml`). App + ws-server run natively via `pnpm dev` to keep Mac resources free.
- **Langfuse** (opt-in) — separate compose file `docker-compose.langfuse.yml`, started with `pnpm dev:up:langfuse`. `restart: 'no'` so containers do not auto-start on Docker / Mac boot.
- **Production** — `docker-compose.yml` ships the full containerised stack (app, ws-server, postgres, redis).
- **Node.js 22** — runtime
- **pnpm workspaces** — monorepo

---

## Runtime Targets

Oh Writers runs on three different surfaces that share the same backend. Priority order:

1. **Web app (desktop)** — primary product. Full feature set: editing, breakdown, budget, schedule, AI, locations.
2. **PWA (tablet, especially iPad)** — same codebase as web. Installable via browser. Targets the iPad-with-keyboard scenario where the editor experience is close to desktop.
3. **Expo companion app (iOS / Android)** — not a clone of the web, a purposeful companion. Read mode, quick capture via dictation, comments, mentions, approvals, push notifications, location scouting (camera + GPS + photo upload for Spec 13), strip board read-only. The full screenplay editor is intentionally out of scope for mobile because no production-grade Fountain editor exists for React Native.

### What this implies for the codebase

- **Shared packages (`packages/domain`, `packages/utils`)** must remain framework-agnostic — no React, no Monaco, no browser-only APIs. They will be consumed by the Expo app as well.
- **Editor layer is split** between pure Fountain logic (portable) and Monaco-specific glue. When CodeMirror 6 is introduced for mobile browsers, the glue is replaced; the logic stays.
- **Better Auth** must issue both cookie sessions (web) and bearer tokens (mobile). Server functions and middleware must not assume cookies.
- **An API client abstraction** (to be introduced when the Expo app starts) will wrap `createServerFn` on the web and typed `fetch` on mobile. Both use the same Zod schemas from `packages/domain`, so a schema change breaks both at compile time.
- **Real-time events** (comments, mentions, team updates) flow through a channel that both the web (Yjs / WebSocket) and a future Expo app (Expo Push Notifications) can subscribe to. The event source of truth is the backend, not the web client.

The Expo app does not exist yet. The rule is: **don't close doors**. No mobile-specific work happens now.

---

## Monorepo Structure

```
oh-writers/
├── CLAUDE.md
├── SPEC.md
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   └── specs/
│       ├── 01-auth.md
│       ├── 02-teams.md
│       ├── 03-projects.md
│       ├── 04-narrative-editor.md
│       ├── 05-screenplay-editor.md
│       ├── 06-versioning.md
│       ├── 07-ai-predictions.md
│       ├── 08-infrastructure.md
│       ├── 09-ws-server.md
│       ├── 10-breakdown.md
│       ├── 11-budget.md
│       ├── 12-schedule.md
│       └── 13-locations.md
├── apps/
│   ├── web/                        # TanStack Start app
│   │   ├── app/
│   │   │   ├── routes/             # File-based routing
│   │   │   ├── components/         # Shared UI components
│   │   │   ├── features/           # Feature folders (colocation)
│   │   │   │   ├── auth/
│   │   │   │   ├── teams/
│   │   │   │   ├── projects/
│   │   │   │   ├── documents/
│   │   │   │   ├── screenplay-editor/
│   │   │   │   ├── breakdown/
│   │   │   │   ├── budget/
│   │   │   │   ├── schedule/
│   │   │   │   ├── locations/
│   │   │   │   └── predictions/
│   │   │   └── styles/             # Global CSS vars and tokens
│   │   └── public/
│   └── ws-server/                  # Hono WebSocket server for Yjs
├── packages/
│   ├── db/                         # Drizzle schema + migrations + seed
│   │   ├── schema/
│   │   ├── migrations/
│   │   └── seed/
│   ├── shared/                     # Zod schemas, types, shared constants
│   │   ├── schemas/
│   │   └── types/
│   └── ui/                         # Shared component library
│       ├── components/
│       └── styles/
├── docker/
│   ├── docker-compose.yml               # production stack
│   ├── docker-compose.dev.yml           # dev core: postgres + redis only
│   ├── docker-compose.langfuse.yml      # opt-in AI tracing stack
│   └── Dockerfile
├── scripts/
│   ├── seed.ts
│   ├── migrate.ts
│   └── release.ts
└── package.json                    # pnpm workspace root
```

---

## Architectural Patterns

### Feature Folders

Each feature is self-contained. Never import directly across feature boundaries — always go through `index.ts`.

```
features/breakdown/
├── components/
│   ├── BreakdownSheet.tsx
│   └── ElementCard.tsx
├── hooks/
│   └── useBreakdown.ts
├── server/
│   └── breakdown.server.ts    ← createServerFn definitions
├── breakdown.errors.ts        ← typed error classes for this domain
├── breakdown.schema.ts        ← Zod schemas
├── styles/
│   └── breakdown.module.css
└── index.ts                   ← public API
```

### Data Flow

```
User Action
  → TanStack Query mutation (optimistic update)
  → createServerFn (server function, co-located with feature)
  → neverthrow ResultAsync chain
  → Drizzle query (PostgreSQL)
  → ok(result) | err(typedError)
  → Invalidate query cache
  → UI re-render
```

For real-time:

```
User typing
  → Yjs Doc update (local)
  → y-websocket sync (other clients via ws-server)
  → Awareness update (cursors, presence)
```

### Server Functions

All client→server interactions go through `createServerFn`. No tRPC, no raw fetch to internal endpoints.

```typescript
// Every server function follows this structure
export const doSomething = createServerFn({ method: "POST" })
  .validator(InputSchema)
  .handler(async ({ data }): Promise<Result<Output, DomainError>> => {
    // 1. auth check
    // 2. permission check
    // 3. business logic via ResultAsync chain
    // 4. return ok(result) or err(typedError)
  });
```

### Error Handling

Errors are values. `try/catch` is only for programming errors and unrecoverable states.

```typescript
// Domain errors — typed, per feature
export class NotFoundError extends Error {
  readonly _tag = 'NotFoundError'
  constructor(readonly resource: string, readonly id: string) {
    super(`${resource} not found: ${id}`)
  }
}

// ResultAsync chain — short-circuits on first error
const result = await findProject(id)
  .andThen(project => checkPermission(project, userId))
  .andThen(project => loadBreakdown(project.id))

// Exhaustive handling at the boundary
match(result)
  .with({ isOk: true }, ({ value }) => ...)
  .with({ isErr: true, error: { _tag: 'NotFoundError' } }, ({ error }) => ...)
  .with({ isErr: true, error: { _tag: 'ForbiddenError' } }, ({ error }) => ...)
  .exhaustive()
```

### Auth Flow

```
Login → Better Auth → Session cookie (httpOnly, SameSite=Strict)
Request → Middleware verifies session → User context in server functions
Team access → Check membership + role on every mutation
```

### WebSocket Auth Flow

```
Client connects → sends ?token=<session-token> as query param
ws-server → validates token against Redis session store
Invalid token → close connection (code 4001)
Valid token → attach userId to socket context
Every Yjs message → room access checked against team membership
```

---

## CSS Architecture

### Shell Model

The AppShell is a Notion-class composition that ships exactly four top-level surfaces. The editor area is pixel-stable when Cesare opens, closes, or resizes — nothing in the shell reserves a column for the assistant. See [Spec 44](./specs/44-shell-refactor-notion-style.md) for the authoritative state model.

**Surfaces:**

- **LeftRail** — 240px when shell is `full`, hidden when `collapsed` (a top-left hamburger button toggles it back in as a sliding overlay via `useRailOverlay` + `RailHamburger`; outside-click / ESC / hamburger again close it), hidden when `focus`. Owns project identity, Document Type / Production View nav, Cesare Sessions (visible only when Cesare is `expanded`/`full`), Recents, and tool icons.
- **Slim TopBar** — one row per page, with an optional `elementLegend` slot (Sceneggiatura only).
- **BottomDock** — `bell · avatar · gear · ✦ Cesare`, fixed bottom-right. Hidden when Cesare ≠ `closed` (its bell/avatar/gear icons move into the Cesare drawer header) OR when shell = `focus`.
- **Cesare Drawer** — Notion-class floating sub-window anchored bottom-right. Four user-facing states (`closed | peek | expanded | full`) plus one internal transient (`expanded-split`) used during the SplitDrawer cross-flow when both surfaces co-exist. The transient state collapses to `expanded` for the persisted `body[data-cesare]` flag and for the user-facing cycle button.

**SplitDrawer** is a separate `packages/ui` composite for right-anchored auxiliary panels (`closed | open | full`). It reflows the page narrower on the left. Consumers ship via `SplitDrawerProvider` + `SplitDrawerHost` (mounted once at the shell level): `NotificationCenterDrawer` (bell), and future `VersionsDrawer`, `DocumentBrowserDrawer`, `DiffViewer`.

**Trace flow** (Cesare full → SplitDrawer with affected page): the Cesare Step Block's `[Mostra modifiche]` affordance calls `useShowChangesInSplitDrawer({ pageRef, traceMarkers, onAccept, onReject, onAcceptAll, onRejectAll })`. The SplitDrawer renders `<TargetPagePreview/>` of the affected page with a trace overlay and accept/reject footer. Cesare narrows automatically; promoting the SplitDrawer to `full` retreats Cesare to `peek`.

**Body data-attributes** (driven by AppShell, the only mechanism shell-aware CSS may key off):

- `data-view` — current route segment
- `data-cesare` — `closed | expanded | peek | full` (the `expanded-split` runtime state is collapsed to `expanded` here)
- `data-shell` — `full | collapsed | focus`
- `data-cesare-thinking` — `true` while an agentic run is in progress
- `data-split-drawer` — `open | full` when the SplitDrawer is mounted (absent when `closed`)
- `data-rail-overlay` — `open` only while the collapsed rail is shown as an overlay (toggled by the hamburger / dismissed by outside-click / ESC / close button)

**Persistence** (per user, in `localStorage`):

- `data-shell` persists `full` and `collapsed` only; `focus` is transient
- `data-cesare` persists `closed` and `expanded` only; `peek`, `full`, and the internal `expanded-split` are runtime-only

**Shortcuts:** `⌘K` opens the command palette, `⌘\` toggles `full ↔ collapsed`, `⌃⌥F` toggles `focus`.

### Design Philosophy — Dark Modern SaaS

Clean, warm dark aesthetic with depth and polish. Content-first — the editor area is the hero.

- Dark warm backgrounds (not pure black — warm undertones `#0f0f0d`)
- Three font families: sans (Inter) for UI, serif (Lora) for content headings, mono (Courier Prime) for screenplay
- Color used semantically (breakdown categories, status indicators) with subtle background variants
- `--radius-md` (8px) default — soft edges everywhere except the screenplay page itself (`--radius-none`)
- Layered elevation via `--shadow-*` tokens — surfaces feel stacked, not flat
- Micro-animations for state changes, always behind `prefers-reduced-motion`

### Design Tokens

```css
/* packages/ui/styles/tokens.css */
:root {
  /* --- Backgrounds --- */
  --color-bg-base: #0e0e0c; /* main app background — warm dark */
  --color-bg-surface: #1a1917; /* cards, panels */
  --color-bg-elevated: #242320; /* modals, dropdowns */
  --color-bg-subtle: #2e2d2a; /* hover states, input backgrounds */

  /* --- Text --- */
  --color-text-primary: #f0ede6; /* main text — warm white */
  --color-text-secondary: #9e9b94; /* secondary, metadata */
  --color-text-muted: #5c5a55; /* placeholders, disabled */
  --color-text-inverse: #0e0e0c; /* text on light backgrounds */

  /* --- Borders --- */
  --color-border: #2e2d2a; /* default border */
  --color-border-strong: #4a4845; /* emphasized borders */
  --color-border-focus: #f0ede6; /* focus rings */

  /* --- Semantic / Status --- */
  --color-accent: #d4a843; /* amber — primary actions, highlights */
  --color-error: #c94040;
  --color-warning: #c97a30;
  --color-success: #5a8a5a;

  /* --- Breakdown Category Colors (semantic) --- */
  --color-breakdown-cast: #8b3333; /* red */
  --color-breakdown-extras: #8b5e2a; /* orange */
  --color-breakdown-props: #7a7a2a; /* yellow */
  --color-breakdown-costumes: #5a3a7a; /* purple */
  --color-breakdown-locations: #2a5a2a; /* green */
  --color-breakdown-vehicles: #2a4a7a; /* blue */
  --color-breakdown-vfx: #2a6a6a; /* cyan */
  --color-breakdown-sfx: #7a3a5a; /* pink */
  --color-breakdown-sound: #6a6a6a; /* grey */

  /* --- Typography --- */
  --font-serif: "Lora", "Georgia", serif; /* creative content, headings */
  --font-mono:
    "Courier Prime", "Courier New", monospace; /* screenplay, production data */
  --font-sans: "Inter", system-ui, sans-serif; /* UI chrome, labels */

  --font-size-xs: 0.75rem; /* 12px */
  --font-size-sm: 0.875rem; /* 14px */
  --font-size-base: 1rem; /* 16px */
  --font-size-lg: 1.125rem; /* 18px */
  --font-size-xl: 1.25rem; /* 20px */
  --font-size-2xl: 1.5rem; /* 24px */
  --font-size-3xl: 2rem; /* 32px */

  --line-height-tight: 1.1;
  --line-height-base: 1.5;
  --line-height-relaxed: 1.75;

  /* --- Spacing --- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* --- Borders --- */
  --border-width: 1px;
  --border: var(--border-width) solid var(--color-border);
  --border-strong: var(--border-width) solid var(--color-border-strong);
  --radius-sm: 4px;
  --radius-md: 8px; /* default */
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  --radius-none: 0; /* screenplay page only */
}
```

### CSS Modules Convention

- One `.module.css` per component
- CSS nesting for variants and states
- Container queries for component responsiveness — not viewport media queries
- Logical properties (`margin-inline`, `padding-block`) over physical directions
- Modern selectors (`:has()`, `:is()`, `:where()`) to reduce duplication
- Transitions in CSS only — no Framer Motion, no JS animations
- Always include `prefers-reduced-motion` for any transition

```css
/* Example: component using modern CSS */
.strip {
  container-type: inline-size;
  border: var(--border);
  background: var(--color-bg-surface);
  padding: var(--space-2) var(--space-3);

  &:hover {
    background: var(--color-bg-subtle);
  }

  &.isLocked {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @container (min-width: 200px) {
    display: grid;
    grid-template-columns: auto 1fr auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .strip {
    transition: none;
  }
}
```

---

## Local-First Development

The entire app runs 100% locally with no external services required.

- `MOCK_API=true` → MSW intercepts all server function calls; no PostgreSQL or Redis needed
- `MOCK_AI=true` → AI responses from mock files; no Anthropic API key needed
- Docker Compose provides PostgreSQL and Redis for full local runs
- No offline mode for end users — the app requires a connection

---

## Security

- httpOnly cookie sessions, SameSite=Strict
- CSRF protection via Better Auth
- Zod validation on every `createServerFn` via `.validator()`
- Role-based permission check on every mutation
- Rate limiting on auth endpoints (Hono middleware)
- Output sanitization to prevent XSS
- AI API keys never exposed to the client
- WebSocket connections authenticated before any Yjs message is processed

---

## Testing Strategy

Two layers:

- **Vitest** (`pnpm test:unit`) — pure functions, parsers, reducers, Effect Layers/ACL, server-fn logic. ~1500 tests; the fast inner loop.
- **Playwright E2E** (`pnpm test:e2e`) — critical user flows. The `mock-ui` project runs with `MOCK_AI=true` against a seeded test DB on port 3002 (Playwright manages its own server). Tag format `[OHW-NNN]`.

Both must be green before any commit (pre-commit hook runs lint `--max-warnings 0` + typecheck; the full suites gate the merge).

## Learnings

Hard-won lessons from the Cesare shell refactor + the Effect-TS migration. Read these before
touching the AI context, the shell, or running a multi-agent wave.

### AI / Effect

- **Effect wraps the AI SDK; it does not replace it.** The Vercel AI SDK stays the model transport (`generateText`/`streamText`/tools). Effect adds interruption / retry / lifecycle *around* it. Name the Layer for the role (`AiClient`), not the raw vendor SDK.
- **The boundary is the value.** Keeping `ResultShape` at every `createServerFn` made the whole AI migration (6 waves) invisible to callers — each wave was independently revertible. Translate Effect ↔ neverthrow in exactly ONE place (the ACL).
- **Concurrency belongs to independent reads, not the tool loop.** Parallelising the Cesare tool loop would break the tracer step ordering (a product invariant) and race the auto-version-then-apply on the same entity. `Effect.all({concurrency})` is safe only for the context-assembly DB fan-out (read-only, order-independent) — prove equivalence (same result when reads complete out of order).
- **`acquireRelease` makes "version before apply, rollback on error" impossible to forget.** The agentic-edit invariant is now structural, not a convention.
- **Retry only transient failures.** Classify at the SDK boundary (`APICallError.isRetryable`): retry 429/5xx/timeout, never auth/validation. Cap retries (2) for cost discipline.

### Auth / SSR

- **`getWebRequest()` is not reliably populated inside an API file route's POST handler** (it is inside a `createServerFn`). The Cesare stream silently 403'd every browser request until access was resolved from the route's own `request.headers` instead of the ambient context. When an API route needs the session, pass `request.headers` explicitly.
- **A "loading failed" UI symptom can be a server-side auth resolution bug**, not the client. E2E hid it because the test fixture always attaches the session cookie; the real browser `fetch` exposed it.
- **Hydration mismatches hide in unexpected components.** A `/locations` mismatch attributed to the map was actually `aria-valuemax="9999"` on the drawer-resize handles (SSR placeholder vs client viewport value). Stabilise SSR-time values; render viewport-dependent widgets client-only.

### UI / Cesare

- **"Maximum update depth" is usually an unstable effect dependency, not the obvious component.** The Mostra/Nascondi loop was NOT in the diff component — it was three shell publishers depending on a context object whose reference changes every render, and a hook listing a per-render `search` object as a dep. Depend on the stable `setX` callback / read through a ref.
- **Transient flash > persistent toggle state.** Modelling the diff highlight as a fire-and-forget flash (start on click → auto-clear via timer) removed the reconciliation loop by construction and matched the desired UX (green on Mostra, red on Nascondi, both fade; the document always keeps the change; no inline Annulla — true rollback lives in the Versions SplitDrawer).
- **Disambiguate accessible names across surfaces.** Two buttons named "Apri Cesare" (dock pill + rail entry) broke ~10 E2E specs and assistive tech. One name per action.
- **`document.title` per route** via TanStack Router `head` — was empty everywhere; easy to forget.

### Multi-agent waves (process)

- **Agent worktrees start from a STALE local branch ref.** Several waves reset to an old HEAD (e.g. W-E1 only) instead of the latest merge, silently building on outdated foundations. Always instruct agents to `git fetch` + `git reset --hard <integ>` and to CONFIRM specific marker files exist (e.g. `ai.layer.ts` not `anthropic.layer.ts`) before starting.
- **`pnpm install` after every merge that touched `package.json`** — a merged dependency (`effect`) is not in `node_modules` until you install, and typecheck fails confusingly otherwise.
- **The orchestrator is the Lead; merges and conflict resolution stay with it.** 3-way merges between an Effect-converted file and a stale-base fix are resolvable by hand when the overlaps are small — typecheck is the truth test after each resolution.
- **Live-verify every UI change yourself.** "Tests pass" missed the empty session page, the 403 stream, and the update-depth loop; driving the real app with a browser caught all three. The first attempt often flakes (lost session) — re-login before concluding a feature is broken.
