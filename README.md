# Oh Writers

Italian-first platform for the indie writer-director: screenplay editor, pre-production pipeline (breakdown, budget, schedule, locations, shot list), and an agentic AI copilot named Cesare. Scope: writing + pre-production + agentic AI.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Structure](#2-repository-structure)
3. [First-Time Setup](#3-first-time-setup)
4. [Environment Variables](#4-environment-variables)
5. [Daily Dev Workflow](#5-daily-dev-workflow)
6. [Database](#6-database)
7. [Available Scripts](#7-available-scripts)
8. [Testing](#8-testing)
9. [Code Conventions](#9-code-conventions)
10. [Adding a New Feature](#10-adding-a-new-feature)
11. [Docker](#11-docker)
12. [Deployment](#12-deployment)
13. [Troubleshooting](#13-troubleshooting)

---

## 0. What we're building

### TL;DR

Oh Writers is a SaaS that follows a film from the first line of the logline to a shoot-ready production plan. Screenwriting, 1st AD work, and production planning — all in one project, one team, one AI copilot named **Cesare**, working in Italian. Built for the indie writer-director who doesn't want to stitch together Final Draft, Excel, Movie Magic, StudioBinder/Filmustage and a moodboard tool just to make a movie.

**Scope:** writing + pre-production + agentic AI in Italian. The post-production / NLE bridge is exploratory roadmap, not part of the current product.

### The problem

Making a small-to-mid independent film today means working across a dozen disconnected tools. Final Draft for the screenplay, Google Docs for the treatment, Movie Magic for scheduling, StudioBinder or Filmustage for the set, then DaVinci or Premiere in the edit bay. Every hand-off is a manual copy-paste. Every rewrite breaks the schedule and the budget. AI — when present — is a side chatbot that knows nothing about the actual project.

The enterprise stack costs thousands of euros per seat. Indie production houses, film schools, and small teams either can't afford it or burn time they don't have holding it together.

### The solution — Oh Writers

One platform that walks with the production from the first idea to a shoot-ready plan, organized around three pillars:

1. **Write** — logline, synopsis, outline, treatment, screenplay. Universal versioning, comments, roles. Real-time co-writing (Yjs CRDT) is live.
2. **Pre-production** — automatic per-scene breakdown (cast, props, locations, VFX, vehicles, extras, sound FX); budget; shooting schedule composition; location scouting on a map; 2D shot-list and blocking. All draftable and kept in sync by Cesare.
3. **Agentic AI in Italian** — Cesare knows the whole project and acts across documents, breakdown, budget, schedule, locations, and the shooting plan. It proposes; the user accepts or rejects — every AI edit auto-creates a version first, so it's always reversible.

### Meet Cesare

Cesare is Oh Writers' AI copilot — not a chatbot parked on the side, but an agent that knows the project end-to-end. Cesare unblocks the blank page, reviews structure and beats, drafts breakdowns, composes shooting schedules, and flags cast/location conflicts when the script changes. One name, one voice, one memory spanning the production. AI usage is BYOK (bring your own OpenRouter key) — the platform never resells inference; a small one-time trial quota lets a new user try Cesare before connecting a provider.

### Who it's for

1. **The Italian indie writer-director (primary target).** Writes and directs the same film, budget €200K–2M. Today on Final Draft + Notion/Excel, suffering context-switching more than anyone.
2. **Small production houses (the Team segment).** 2–30 people, 1–5 projects a year — the Team tier of the same product, with real-time collaboration and roles.
3. **Film schools and screenwriting courses.** Annual institutional licenses, shared Cesare action pool.

### Market

- **Free.** Full screenplay editor (Fountain, PDF/FDX/Fountain export), soggetto/scaletta/treatment, manual breakdown/budget/schedule/locations/shot list, real-time co-writing, unlimited projects and versioning. Cesare available with a small trial quota, then requires connecting a provider.
- **International (EN) vs Italy (IT) market gating.** Some features are Italy-only (SIAE export, funding-application assistance) and hidden on the EN market — see `packages/domain/src/features/flags.ts`.

---

## 1. Prerequisites

| Tool           | Minimum version | Notes                        |
| -------------- | --------------- | ---------------------------- |
| Node.js        | 22              | Use `.nvmrc` or `nvm use 22` |
| pnpm           | 10              | `corepack enable pnpm`       |
| Docker Desktop | any recent      | For Postgres and Redis       |
| Git            | any             |                              |

Optional (only needed for full integration):

- Anthropic API key or an OpenRouter connection — AI narrative assistant, breakdown, and Cesare
- Google OAuth credentials — Google login
- GitHub OAuth credentials — GitHub login
- Google Places API key — Cesare's agentic location scouting

---

## 2. Repository Structure

```
oh-writers/
├── apps/
│   ├── web/                    # TanStack Start (SSR, file-based routing) — all UI, routes, server functions
│   ├── ws-server/              # Hono WebSocket server (Yjs real-time sync)
│   └── landing/                # Static investor/pre-demo landing page — no build step
├── packages/
│   ├── db/                     # Drizzle ORM schema, migrations, seed
│   ├── domain/                 # Zod schemas, branded types, feature flags, tagged consts
│   ├── auth/                   # Better Auth config, mailer
│   ├── utils/                  # Shared framework-agnostic utilities
│   └── ui/                     # Design tokens, shared component primitives
├── docker/
│   ├── docker-compose.dev.yml       # Postgres + Redis only (dev)
│   ├── docker-compose.langfuse.yml  # Optional AI observability stack (opt-in)
│   ├── Dockerfile.web               # Production image for apps/web
│   └── Dockerfile.ws-server         # Production image for apps/ws-server
├── tests/                      # Playwright tests (all E2E test types live here)
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── BACKLOG.md              # Frozen pre-2026-06-24 work-queue snapshot
│   ├── conventions/            # Per-topic coding conventions
│   └── specs/                  # Feature specs
├── fly.web.toml                # Fly.io deploy config — web app
├── fly.ws-server.toml          # Fly.io deploy config — ws-server
├── SPEC.md                     # Product overview and feature set
├── CLAUDE.md                   # Coding guidelines for Claude Code
├── playwright.config.ts
└── package.json                # Workspace root — all shared scripts
```

Bugs are tracked in **GitHub Issues** (`gh issue list`), not in a markdown file. The live work queue is the [GitHub Project board](https://github.com/users/valerionarcisi/projects/3).

### Package responsibilities

| Package                 | What it owns                                                                |
| ----------------------- | --------------------------------------------------------------------------- |
| `@oh-writers/web`       | All UI, routes, `createServerFn` calls, Better Auth client                  |
| `@oh-writers/ws-server` | WebSocket server, Yjs provider, room auth, Redis pub/sub for multi-instance |
| `@oh-writers/db`        | Drizzle schema, migrations, `db` client export                              |
| `@oh-writers/domain`    | Zod schemas, branded IDs, tagged consts, feature flag catalogue             |
| `@oh-writers/auth`      | Better Auth server config, SMTP mailer                                      |
| `@oh-writers/utils`     | Framework-agnostic shared utilities                                         |
| `@oh-writers/ui`        | `tokens.css` design tokens, shared CSS Module component primitives          |

---

## 3. First-Time Setup

```bash
# 1. Clone
git clone <repo-url> oh-writers
cd oh-writers

# 2. Install all dependencies (workspaces)
pnpm install

# 3. Copy environment file (the real one lives under apps/web/)
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env — see section 4 for details

# 4. Start infra + apply migrations + seed, in one step
pnpm dev:up

# 5. Start all apps (in a separate terminal)
pnpm dev
```

After that:

- Web app: http://localhost:3000
- WebSocket server: http://localhost:1234 (health check at `/health`)

---

## 4. Environment Variables

The canonical template is `apps/web/.env.example` — copy it to `apps/web/.env`. Highlights (see the file itself for the full annotated list):

```bash
# ── Database & Redis ─────────────────────────────────────────────────────
DATABASE_URL=postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_dev
REDIS_URL=redis://localhost:6379
# AUTH_USE_REDIS=true   # opt-in: Better Auth secondary session store for multi-instance ws-server

# ── Better Auth ───────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=change-me-in-production-min-32-chars
BETTER_AUTH_URL=http://localhost:3000

# ── SMTP (password reset, email verification) ────────────────────────────
# Without SMTP_HOST the app stays usable — the mailer logs and no-ops.
SMTP_HOST=
MAIL_FROM=Oh Writers <no-reply@example.com>

# ── OAuth (optional) ───────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GITHUB_CLIENT_ID=

# ── AI ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=
MOCK_AI=true          # develop without any AI key — fixture responses + scripted tool loop
AI_DAILY_BUDGET_USD=5 # platform-side spend cap (Spec 83)
AI_KEY_ENCRYPTION_SECRET=  # required to store per-user BYOK provider keys (Spec 84)

# ── WebSocket server ────────────────────────────────────────────────────
WS_PORT=1234
WS_SECRET=change-me-in-production-min-32-chars
VITE_WS_URL=ws://localhost:1234

# ── Google Places (Cesare location scouting, optional) ────────────────────
GOOGLE_PLACES_API_KEY=

# ── Dev-only ─────────────────────────────────────────────────────────────
DEV_AUTH_BYPASS=false  # true = skip auth, run every request as the seeded Test User (never set in production)
```

### Minimum viable `.env` for local dev

```bash
DATABASE_URL=postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_dev
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=dev-secret-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:3000
WS_SECRET=dev-secret-at-least-32-characters-long
VITE_WS_URL=ws://localhost:1234
MOCK_AI=true
```

---

## 5. Daily Dev Workflow

```bash
# Start infra + migrations + seed (idempotent, safe to re-run)
pnpm dev:up

# Start all apps in parallel (web on :3000, ws-server on :1234)
pnpm dev

# OR: same thing wrapped in automatic DB snapshots (pre/post session) —
# use this when working on real project data
pnpm dev:session

# In a separate terminal — run unit tests in watch mode
pnpm test:ui
```

`pnpm dev` runs `pnpm --parallel --filter './apps/*' dev` — both `web` (Vinxi) and `ws-server` (tsx watch) with hot reload. A standalone DB snapshot is `pnpm db:backup [label]` (dumps land in `backups/`, git-ignored).

### Ports

| Service           | Port                                 |
| ----------------- | ------------------------------------ |
| Web app           | 3000                                 |
| WebSocket server  | 1234                                 |
| Postgres          | 5432                                 |
| Redis             | 6379                                 |
| Langfuse (opt-in) | 3001                                 |
| Drizzle Studio    | 4983 (when running `pnpm db:studio`) |

---

## 6. Database

### Schema

All tables are defined in `packages/db/src/schema/`, one file per bounded context. Types are always inferred from Drizzle — never written manually:

```ts
import { users } from "@oh-writers/db";

type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;
```

### Migrations

**Never edit the database by hand.** Always go through migrations.

```bash
pnpm db:migrate:create   # generate a migration after changing a schema file
pnpm db:migrate          # apply pending migrations
pnpm db:migrate:status   # check migration status
```

Migrations live in `packages/db/drizzle/` and are committed to git. `pnpm check:migrations` verifies the journal stays consistent with the migration files — it runs as part of the pre-push hook.

### Seed data

```bash
pnpm db:seed          # load realistic sample data
pnpm db:seed:reset    # wipe and re-seed from scratch
pnpm db:psql          # open a psql shell against the dev DB
pnpm db:studio        # visual DB browser at http://local.drizzle.studio
```

---

## 7. Available Scripts

All scripts run from the workspace root.

### Development

| Script             | What it does                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`         | Start web (:3000) and ws-server (:1234) in parallel, hot reload                                                    |
| `pnpm dev:up`      | Start infra (Postgres/Redis), run migrations, seed — one command                                                   |
| `pnpm dev:down`    | Stop infra (data preserved)                                                                                        |
| `pnpm dev:reset`   | Reset the dev environment                                                                                          |
| `pnpm build`       | Build all packages then all apps (production artifacts)                                                            |
| `pnpm typecheck`   | `tsc --noEmit` across all workspaces                                                                               |
| `pnpm lint`        | ESLint (`apps/web/app`, `--max-warnings 0`)                                                                        |
| `pnpm fleet:check` | Guardrail scan (rogue hex, native dialogs, Tailwind classes, Italian identifiers, secrets in logs) — see CLAUDE.md |

### Testing

| Script            | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `pnpm test`       | Run all Playwright tests headlessly                    |
| `pnpm test:ui`    | Open Playwright UI (interactive, time-travel debugger) |
| `pnpm test:unit`  | Vitest unit tests (`web`, `ws-server`, `auth`)         |
| `pnpm test:setup` | Seed the dedicated Playwright test database            |

### Database

| Script                           | What it does                             |
| -------------------------------- | ---------------------------------------- |
| `pnpm db:migrate`                | Apply pending Drizzle migrations         |
| `pnpm db:migrate:create`         | Generate a migration from schema changes |
| `pnpm db:seed` / `db:seed:reset` | Load sample data / wipe and re-seed      |
| `pnpm db:studio` / `db:psql`     | Drizzle Studio / raw psql shell          |
| `pnpm db:backup [label]`         | Snapshot the dev DB to `backups/`        |

### AI cost tooling

| Script                      | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `pnpm ai:costs`             | Report real token spend from the `ai_usage` ledger                   |
| `pnpm cost:smoke:<feature>` | Manual real-API smoke test for a Cesare-touching feature (not in CI) |

---

## 8. Testing

Two test runners, each for its purpose:

- **Vitest** — fast unit tests for pure functions, parsers, reducers, schema validation. Co-located with the source file (e.g. `keymap.test.ts` next to `keymap.ts`). Run with `pnpm test:unit`.
- **Playwright** — browser and E2E tests for auth flows, page navigation, editor interactions, mutations. Lives in `tests/`. Run with `pnpm test`.

### Running tests

```bash
pnpm test                    # all Playwright tests, headless
pnpm test:ui                 # interactive Playwright UI
pnpm test:unit                # Vitest, watch mode
pnpm exec playwright test tests/schedule/schedule-export.spec.ts
```

Playwright starts a dedicated test server against a separate test database before the suite runs. Run `pnpm test:setup` once before the first run to seed it.

### QA Pipeline

Every push to `main` and every PR is validated by GitHub Actions (`.github/workflows/qa.yml`). Locally, a Husky pre-push hook (`.husky/pre-push`) runs the same fast gates before allowing the push — typecheck, migration-journal consistency, lint, and unit tests. `PRE_PUSH_FULL=1 git push` also runs `ci:repro` to reproduce the full CI E2E lane locally.

**Bypassing the hook (emergency only):**

```bash
git push --no-verify
```

Use sparingly — CI still blocks the merge if any job fails.

**Manual cost smoke** — for Cesare-touching features, run `pnpm cost:smoke:<feature>` locally with a real AI key to measure token costs. Not in CI (would burn real API credits).

---

## 9. Code Conventions

Read `CLAUDE.md` for the full guidelines, and the matching file in `docs/conventions/` for the topic you're touching. Key points:

### TypeScript

- **All types from Zod or Drizzle** — never write a `type`/`interface` for domain data by hand
- **Branded IDs** and **tagged const objects** from `packages/domain` — never a raw `string`/string literal for an ID, role, or enum-like value
- **neverthrow, never `try/catch`** for expected failures:

```ts
import { ResultAsync } from "neverthrow";

function parseScene(text: string) {
  if (!text) return err(new ParseError("empty"));
  return ok({ heading: text });
}
```

### CSS

- **CSS Modules only** — one `.module.css` per component, camelCase class names
- **Design tokens only** — never hardcode hex values, spacing, or radii. Tokens live in `packages/ui/src/styles/tokens.css`:

```css
/* Good */
.button {
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
}

/* Bad — gated by pnpm fleet:check */
.button {
  border-radius: 6px;
  padding: 8px 16px;
}
```

- No Tailwind, no CSS-in-JS, no `style` props — all gated by `pnpm fleet:check`

### File naming

| What            | Convention              | Example                       |
| --------------- | ----------------------- | ----------------------------- |
| React component | `PascalCase.tsx`        | `ScreenplayEditor.tsx`        |
| CSS module      | `PascalCase.module.css` | `ScreenplayEditor.module.css` |
| Hook            | `useCamelCase.ts`       | `useScreenplayEditor.ts`      |
| Server function | `domain.server.ts`      | `screenplay.server.ts`        |
| Zod schema      | `domain.schema.ts`      | `screenplay.schema.ts`        |

### Git commits

Format: `type: description` (no prefix bracket).

```
feat: add scene heading autocomplete
fix: prediction not invalidated after scene delete
chore: update drizzle-kit to 0.32
refactor: extract scene parser to pure function
test: add e2e for team invitation flow
```

No AI signatures in commits.

### PR target branch

Target `main` — there is no separate `develop` branch.

---

## 10. Adding a New Feature

### 1. Read the spec

Specs live in `docs/specs/`. A spec is required only when the work changes a product invariant, makes a hard-to-reverse decision (schema, API shape, dependency, pattern), needs to be shared across sessions, or designs a new domain — see `docs/conventions/specs.md`. Otherwise, straight to code.

### 2. Create the feature folder

```
apps/web/app/features/<feature-name>/
├── components/
│   └── MyComponent.tsx
│   └── MyComponent.module.css
├── hooks/
│   └── useMyFeature.ts
├── server/
│   └── myFeature.server.ts
└── index.ts
```

### 3. Add the Zod schema

```ts
// packages/domain/src/myFeature.schema.ts
import { z } from "zod";

export const MyFeatureSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
});

export type MyFeature = z.infer<typeof MyFeatureSchema>;
```

### 4. Update the Drizzle schema (if a new table is needed)

```bash
pnpm db:migrate:create   # generates SQL migration
pnpm db:migrate          # applies it
```

### 5. Write the server function

All client→server calls go through `createServerFn` — no tRPC, no raw fetch:

```ts
// features/myFeature/server/myFeature.server.ts
import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { toShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";

export const getMyFeature = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) =>
    toShape(
      await withProjectAccess(data.projectId, "view", ({ db, access }) =>
        findMyFeature(db, access.project.id),
      ),
    ),
  );
```

### 6. Write tests

```ts
// tests/myFeature/myFeature.spec.ts
import { test, expect } from "../fixtures";

test("can create a my feature", async ({ authenticatedPage: page }) => {
  await page.goto(`${BASE_URL}/projects/${PROJECT_ID}/my-feature`);
  // ...
});
```

Unit tests for pure functions go next to the source file.

### 7. Code-review before committing

Run the `/code-review` skill on the staged diff before every commit — see the Workflow section of `CLAUDE.md`.

---

## 11. Docker

### Dev (Postgres + Redis only)

Local dev keeps Docker minimal: only **Postgres + Redis** run in containers. The web app and ws-server run **natively** via `pnpm dev`.

```bash
pnpm dev:up      # start infra + migrations + seed
pnpm dev         # in a separate terminal — runs apps natively

pnpm dev:down    # stop infra (data preserved)
```

### Langfuse (AI tracing) — opt-in, off by default

The Langfuse stack (web + worker + ClickHouse + MinIO + Redis + Postgres) is heavy and lives in a separate compose file, not started by `pnpm dev:up`.

```bash
pnpm dev:up:langfuse         # dashboard → http://localhost:3001
pnpm dev:down:langfuse
pnpm dev:down:langfuse --clean   # also wipes Langfuse volumes
```

If `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` are unset, the app silently no-ops telemetry.

### Production images

`docker/Dockerfile.web` and `docker/Dockerfile.ws-server` each build a standalone image (they don't share a `--target` selector — see the comment at the top of each file for why). Used directly by the Fly.io deploy — see [Deployment](#12-deployment).

```bash
docker build -f docker/Dockerfile.web -t oh-writers-web .
docker build -f docker/Dockerfile.ws-server -t oh-writers-ws .
```

---

## 12. Deployment

Production runs on **Fly.io** — one provider for both the web app and the WebSocket server, chosen for pay-per-use pricing at near-zero traffic (see `docs/specs/infra/08b-cloud-deploy.md` for the full architecture rationale and `docs/specs/infra/08c-deploy-setup-log.md` for the concrete account/resource setup log).

| Component  | Host                                                            |
| ---------- | --------------------------------------------------------------- |
| Web (SSR)  | Fly.io (`fly.web.toml`) — scales to zero when idle              |
| WebSocket  | Fly.io (`fly.ws-server.toml`) — always-on, stateful connections |
| PostgreSQL | Neon (serverless, free tier)                                    |
| Redis      | Upstash (serverless, free tier)                                 |
| Email      | Resend (SMTP relay)                                             |
| DNS        | Cloudflare                                                      |

```bash
# Deploy the web app
fly deploy --config fly.web.toml

# Deploy the WebSocket server
fly deploy --config fly.ws-server.toml
```

Secrets are managed via `fly secrets set` — see `scripts/fly-secrets-set.sh` and `scripts/fly-secrets-set-smtp.sh` for the local-file-based helper flow that avoids pasting credentials into a shell command or chat history.

---

## 13. Troubleshooting

### `pnpm install` fails with peer dependency errors

The `better-call` package (a dependency of `better-auth`) requires `zod@^4.0.0`, but we use `zod@3`. This is silenced intentionally in `package.json`'s `pnpm.peerDependencyRules`. Safe to ignore.

### `drizzle-kit` fails with `Cannot find module './xxx.js'`

Drizzle Kit's bundler does not resolve `.js` extensions to `.ts` files. All imports inside `packages/db/src/` must use extension-less paths (`./users`, not `./users.js`).

### Postgres connection refused

```bash
docker compose -f docker/docker-compose.dev.yml ps
docker compose -f docker/docker-compose.dev.yml up -d   # if not running
```

If port 5432 is already in use by a local Postgres installation, either stop it or change the port mapping.

### Redis port 6379 already in use

```bash
lsof -i :6379   # find what's using the port
```

Either reuse the existing process by pointing `REDIS_URL` at it, or stop it.

### `routeTree.gen.ts` is stale after adding a new route

Generated by the TanStack Router Vite plugin when the dev server starts. After adding a file under `app/routes/`, restart `pnpm dev` once — it regenerates automatically. Never edit it manually.

### Realtime collaboration shows nothing

`VITE_WS_URL` must point at a running ws-server (`pnpm dev` starts one on `:1234`). An empty `VITE_WS_URL` disables realtime entirely with no on-screen explanation — check your `.env` first.
