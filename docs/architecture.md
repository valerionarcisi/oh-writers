# Architecture

## Stack

### Frontend

- **TanStack Start** — full-stack framework, SSR, file-based routing
- **TanStack Router** — type-safe routing with Zod-validated search params
- **TanStack Query** — server state, caching, optimistic updates
- **Monaco Editor** — screenplay editor with custom language extension
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

- **Anthropic Claude API** — narrative development, breakdown extraction, cost prediction, schedule optimization, location suggestions
- Server-side calls only — API key never exposed to the client

### Error Handling

- **neverthrow** — `Result<T, E>` and `ResultAsync<T, E>` for all operations that can fail
- Typed domain errors per feature (`NotFoundError`, `ForbiddenError`, `ValidationError`, `AiError`, `DbError`)
- React Error Boundaries for UI-level errors

### Infrastructure

- **Docker Compose** — PostgreSQL, Redis, app, ws-server
- **Node.js 22** — runtime
- **pnpm workspaces** — monorepo

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
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
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

All tests use **Playwright** exclusively — no Vitest, no Cypress, no Jest.

- **Unit-style**: pure functions, parsers, reducers — Playwright Node runner
- **Component**: UI components via Playwright component testing
- **E2E**: critical user flows (auth, project creation, screenplay editing, breakdown, scheduling)
- Tag format: `[OHW-001]`
