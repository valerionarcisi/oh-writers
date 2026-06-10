# Oh Writers

Italian-first platform for the indie writer-director: screenplay editor, pre-production pipeline (breakdown, budget, schedule, locations, shot list), and an agentic AI copilot named Cesare. Scope: writing + pre-production + agentic AI.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Structure](#2-repository-structure)
3. [First-Time Setup](#3-first-time-setup)
4. [Environment Variables](#4-environment-variables)
5. [Development Modes](#5-development-modes)
6. [Daily Dev Workflow](#6-daily-dev-workflow)
7. [Database](#7-database)
8. [Available Scripts](#8-available-scripts)
9. [Testing](#9-testing)
10. [Code Conventions](#10-code-conventions)
11. [Adding a New Feature](#11-adding-a-new-feature)
12. [Docker](#12-docker)
13. [Troubleshooting](#13-troubleshooting)

---

## 0. What we're building

### TL;DR

Oh Writers is a SaaS that follows a film from the first line of the logline to a shoot-ready production plan. Screenwriting, 1st AD work, and production planning — all in one project, one team, one AI copilot named **Cesare**, working in Italian. Built for the indie writer-director who doesn't want to stitch together Final Draft, Excel, Movie Magic, StudioBinder/Filmustage and a moodboard tool just to make a movie.

**Scope:** writing + pre-production + agentic AI in Italian. The post-production / NLE bridge is exploratory roadmap, not part of the current product.

**Status:** pre-demo. Actively seeking early design partners.

### The problem

Making a small-to-mid independent film today means working across a dozen disconnected tools. Final Draft for the screenplay, Google Docs for the treatment, Movie Magic for scheduling, StudioBinder or Filmustage for the set, then DaVinci or Premiere in the edit bay. Every hand-off is a manual copy-paste. Every rewrite breaks the schedule and the budget. AI — when present — is a side chatbot that knows nothing about the actual project.

The enterprise stack costs thousands of euros per seat. Indie production houses, film schools, and small teams either can't afford it or burn time they don't have holding it together.

### The solution — Oh Writers

One platform that walks with the production from the first idea to a shoot-ready plan, organized around three pillars:

1. **Write** — logline, synopsis, outline, treatment, screenplay. Universal versioning, comments, roles. Real-time co-writing (2 users on Free, unlimited on Team) is in progress — the Yjs scaffold is ready, the UI is being built.
2. **Pre-production** — automatic per-scene breakdown (cast, props, locations, VFX, vehicles, extras, sound FX); budget; shooting schedule composition with **calendar templates per country of production** (working days, national holidays, allowed hours, night shifts, minimum rest); location scouting on a map; 2D shot-list and blocking. All draftable and kept in sync by Cesare. For small and mid productions, this is enough to stop needing Movie Magic; complex productions can still export and integrate with it.
3. **Agentic AI in Italian** — Cesare knows the whole project and acts on six pages: documents, breakdown, budget, schedule, locations, shooting plan. It proposes; the user accepts or rejects.

### Meet Cesare

Cesare is Oh Writers' AI copilot — not a chatbot parked on the side, but an agent that knows the project end-to-end. Cesare unblocks the blank page, reviews structure and beats, drafts breakdowns, composes shooting schedules under the labor constraints of the country you're shooting in, estimates per-scene cost from pure functions over the DB, and flags cast/location conflicts when the script changes. One name, one voice, one memory spanning the production. The model: Cesare reasons, deterministic tools execute — numbers come from the DB and pure functions, never hallucinated.

### Why now

- **AI finally understands narrative.** Modern models genuinely grasp structure, beats, and scene-level conflict. An AI copilot is useful, not decorative.
- **Agentic AI is cheap enough to ship.** Prompt caching, lazy RAG and a model-tier router bring the cost per active user to ~$0.30/day. LLM prices fall ~50% a year, so the economics only improve.
- **Live collaboration is solvable.** CRDT (Yjs) makes a Google-Docs-class experience native to screenwriting; the scaffold is in place, the UI is in progress.
- **The market gap is wide.** The Italian indie writer-director has no vertical platform in their language — only English enterprise suites or generic tools.

### Who it's for

1. **The Italian indie writer-director (primary target).** Writes and directs the same film, budget €200K–2M. Today on Final Draft + Notion/Excel, suffering context-switching more than anyone. The whole product is built for this person. They sign up on the Solo plan.
2. **Small production houses (the Team segment).** 2–30 people, 1–5 projects a year. Not a separate target audience — the Team tier of the same product, with real-time collaboration, roles, and export branding.
3. **Film schools and screenwriting courses (a product of their own).** Annual institutional licenses, shared Cesare action pool, faculty onboarding. Students touch the full writing + pre-production pipeline without per-seat enterprise costs.

### Competitive landscape

| Stage                | Incumbents                                 | Oh Writers                                                                                          |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Screenwriting        | Final Draft, WriterDuet, Arc Studio, Celtx | Modern editor, Cesare as agentic story doctor, Italian-first                                        |
| Breakdown & pre-prod | StudioBinder, Filmustage                   | Breakdown auto-generated from the live script, country-aware schedules                              |
| Scheduling           | Movie Magic Scheduling                     | Cesare handles scheduling natively for small-to-mid productions; export path kept for complex cases |
| Location scouting    | Trello + Google Maps stitch-up             | Map + Google Places + Cesare candidates, all in one app                                             |
| Shot list & blocking | StudioBinder shot lists                    | 2D blocking + parallel coverage plans, drafted by Cesare                                            |

No single competitor covers writing through pre-production in one tool. Most don't speak to each other. None has an agentic AI copilot that knows the whole project and works in Italian. (A post-production / NLE round-trip is exploratory roadmap — see below — not a current claim.)

### Business model

Writing is free, forever, even for two. Cesare is the conversion — flat rate with a usage cap, not pay-as-you-go.

- **Free — €0.** Full screenplay editor (Fountain, PDF/FDX/Fountain export), soggetto/scaletta/treatment, manual breakdown/budget/schedule/locations/shot list, real-time co-writing up to 2 users, unlimited projects and versioning. No Cesare.
- **Solo — €15/month.** Everything in Free plus Cesare everywhere; 300 Cesare actions/month (enough for a full feature), inline autocomplete unlimited.
- **Team — €25/seat/month (min 2 seats).** Everything in Solo plus unlimited Cesare (fair use), unlimited real-time collaboration, roles & permissions, export branding.
- **Scuola — custom annual license.** Indicative €40/student/year, shared Cesare action pool, faculty onboarding.

Annual billing: 2 months free. Margin is ~80% gross weighted across paying users (78–83% at typical usage); the Solo 300-action cap is the guardrail. A pay-as-you-go add-on may come post-launch as a Free→Solo bridge, but is not in the launch pricing.

### The NLE bridge — exploratory roadmap (not in scope today)

The current product is writing + pre-production + agentic AI in Italian. A post-production round-trip is a longer-term idea, not a current capability and not part of the pitch. If pursued, it would work through agents inside **DaVinci Resolve** and **Adobe Premiere**:

1. Oh Writers exports the approved scene plus markers (scene number, beat, dialogue).
2. The NLE agent assembles a rough cut from tagged clips, guided by the beats of the script.
3. The cut returns as a timeline in the platform, driving scene status: `written → shot → assembled → locked`.

This would extend Oh Writers from "writing + pre-production" toward a full indie production platform. It is explicitly deferred — see the Post-MVP roadmap below — and should not be communicated as a shipped or near-term differentiator.

---

## 0.1 Roadmap — Done / MVP / Post-MVP

_Mirror of [`docs/specs/`](docs/specs/). Keep this in sync: move items from MVP → Done as they ship, and add new rows whenever a new idea lands, even before a spec file exists._

### Done — already shipped

**Auth & teams**

- **core/01 + 01b — Auth**: email/password, OAuth Google + GitHub, sessions
- **core/02 — Teams & roles**: Owner / Editor / Viewer
- **core/03 — Projects**

**Narrative & screenplay editor**

- **core/04 + 04e + 04f — Narrative editor** on ProseMirror (logline, synopsis, outline, treatment, soggetto)
- **core/04c — Narrative export** (logline + synopsis + treatment → PDF, opt-in cover page, preview tab)
- **core/05 + 05b–05k — Screenplay editor**: custom ProseMirror editor, heading slots, scene numbering, inline scene-number edit, autocomplete (character, transition, extension), Tab/Enter flow matrix, `⌘+Number` shortcuts, element toolbar, revision coloring, draft color cross-document
- **core/05j — Screenplay PDF export** (Fountain → industry-standard PDF via afterwriting)
- **core/05k — Production export formats** (5 formats — Standard, Sides, AD copy, Reading copy, One scene per page — single Export dropdown; Sides modal with scene multi-select)
- **core/06 + 06b/c/d — Universal versioning**: panel, row popover, toolbar popover, drawer
- **core/08 — Scene renumber** (shipped with 05h heading slot refactor)
- **core/09 — Save indicator** (Cmd/Ctrl+S)
- **core/14 / 07b — Title page + front-page import** (PDF import Pass 0: screenplay body + front page extracted; silent apply or "replace?" confirm)
- **core/20 — Shooting script PDF import**

**Breakdown**

- **core/10 — Scene Breakdown** (14 categories, Cesare ghost suggestions, PDF/CSV export, version-aware 3-tier stale awareness, auto-clone on new screenplay version)
- **core/10c — Inline scene tagging** (read-only ProseMirror reader in center column, inline highlight, ghost dashed underline, floating toolbar, TOC scroll-to-scene)
- **core/10e — Auto-spoglio via RegEx** (zero-click population on first open: 9 categories, confidence-based status, idempotent via `text_hash`)
- **core/10f — Breakdown table view** (EditableCell + MatrixGrid DS components; Per-progetto tab with in-place editing, bulk select/archive/recategorize; Matrice tab = scene×element crossplot with heatmap toggle)
- **core/10h — Breakdown read-only UX** (scene headings without menu trigger; TOC auto-scroll)
- **core/10i — Breakdown dictionary pass** (WordNet artifact whitelist EN+IT; `projects.locale`; locale select in Settings)

**Budget, schedule, shooting plan**

- **core/11 — Budget** (Cast/Crew/Equipment/Misc widgets, scene chip filter, editable settings, AI-estimated line items, CSV/PDF export, E2E tests OHW-390–393)
- **core/12 — Shooting schedule** (strip board, Italy calendar, greedy generator, drag-and-drop, scene drawer, week/day toggle, day drawer with capacity bar, scene effort per day, CSV/PDF export, E2E tests OHW-380–386)
- **core/27 + 27b — Shooting plan** (per-scene shot list editor, parallel scenarios, blocking canvas, blocking editor, scene effort 1–5, shot list CSV/PDF export, E2E tests OHW-395–398)
- **core/28 — Export audit** (unified export UX across budget, schedule, shooting plan; CSV + PDF for all three)

**Locations**

- **core/13 — Locations & scouting** (location candidates, notes, scouting map, Cesare agentic search via Google Places)

**Cesare AI assistant**

- **ai/17 + 29 — Cesare v1** (universal in-page assistant; breakdown drafting; narrative structure review; schedule drafting; contextual popover with DOM highlight; agentic location scouting)
- **spec 44 — Notion-style shell** (Canva-style LeftRail, floating CesareDrawer with state machine, slim TopBar, BottomDock; the editor never reflows when Cesare opens)
- **spec 44 + 47a — agentic streaming** (`/api/cesare/stream` NDJSON; live step tracer reading→reasoning→writing→done; cross-domain — a request on one page can write another entity)
- **spec 43 + 47b — universal tool dispatch** (every Cesare tool available on every page, not gated per-page)
- **spec 47c — unified logline** (single source of truth; writable/editable from a free prompt via `write_logline`)
- **spec 47d + 47e — live diff** (word-level green/red highlight inline in the document, transient flash on Mostra/Nascondi; the doc always keeps the change; rollback lives in the Versions SplitDrawer)
- **spec 46 + 49 — Versions SplitDrawer** (routed `?peek` side-peek; vs-current + side-by-side Confronta; deep-linkable; rolled out to soggetto/sinossi/scaletta/trattamento)
- **spec 44/46 + A5 — resumable sessions** (`cesare_sessions`, central `/sessions/:id` route, rail entry)
- **spec 51 — message persistence + history markdown** (`cesare_messages`; sessions survive reload; per-edit changelog + per-session transcript markdown DERIVED on-read; bounded history fed back as context)
- **spec 50 — write-from-zero** (next-step suggestion chip derived from existing docs; one generation per click, no wizard, no auto-chain)
- **spec 52 — new-session landing** (full-screen glowy Notion-AI-style centred input, focus mode, single chat container)

**Design system & infra**

- **infra/07b — Design system v2** (DS Dialog migration, primitives unification, ambient dark theme, react-aria adoption for all interactive primitives)
- **infra/23 — Server pipeline refactor** (`withProjectAccess` canonical pattern; `toShape`/`unwrapResult` at all server/client boundaries)
- **infra/12d — DS primitives unification** (FloatingDock, SheetPanel, unified tokens)
- **spec 48 — Effect-TS AI engine** (the AI bounded context — `features/predictions` + AI server fns — runs on Effect: `Db`/`Access`/`AiClient`/`Observability` Layers, structured stream interruption, typed retry/timeout on a single client, `acquireRelease` auto-versioning, bounded concurrency on context assembly; Effect wraps the Vercel AI SDK, never replaces it; an anti-corruption layer keeps `ResultShape` at every `createServerFn` so the rest of the app — still neverthrow + Zod — is untouched). See `docs/architecture.md` Learnings.

### MVP — the minimum viable pilot product

Goal: one film school and one indie production using Oh Writers on a real project, end-to-end, within 6 months. Everything outside this list is cut or deferred.

**Core platform**

- **core/09b — Realtime WebSocket server** (Yjs co-writing needs it; ws-server scaffold exists, full implementation pending)
- **core/12 — Call sheet generation** from schedule + breakdown
- **core/16 — Multi-tenancy & billing** — Teams tier only, Enterprise handled manually in pre-demo phase

**AI — Cesare**

- **ai/17b — Story doctor** — deeper narrative critique, beat analysis, scene-level suggestions

**Infra**

- **infra/08 — Infrastructure** + **08b — Cloud deploy** (staging + prod)
- **infra/07c — Docker E2E** (needed to keep CI green during the push)

### Post-MVP — after the first two design partners

Once the pilot loop is working, in priority order:

- **ai/19a — Moodboard** (upload + organize visual references, no AI generation yet)
- **agents/NLE round-trip (DaVinci first)** — minimal export of scene + beat markers, re-import FCPXML, scene status `written → shot → assembled → locked`
- **ai/07 — Predictions engine** — cost & risk prediction (sells the Enterprise tier)
- **ai/14 — Narrative generation (unified)** — auto-logline, auto-synopsis, auto-outline, logline→scaletta
- **ai/32 — Cesare RAG context** — project-scoped retrieval over all documents for richer Cesare answers
- **ai/30 — Finanziamenti** — Cesare-assisted search and drafting of Italian/EU film funding applications
- **ai/19b — Storyboard generation** (AI frame generation from screenplay + moodboard)
- **agents/Premiere** — parity with DaVinci round-trip
- **agents/Industry interchange** — FDX, FCPXML, EDL, `.mms` import/export
- **agents/MCP server** — expose Oh Writers to Claude Desktop, Cursor, ChatGPT
- **core/18 — i18n** — Italian + English, triggered by the first non-IT customer
- **infra/07 — Core refactor** (triggered only if scaling hurts)

### Archived / absorbed / won't do

- **core/04b — Outline drag & drop** — absorbed into core/04 narrative editor
- **core/04d — Tiptap rich-text editor** — superseded by 04e ProseMirror, spec retired
- **core/10b — Version viewing marker** — absorbed into core/06 versioning
- **core/11b — Versions row popover** — absorbed into core/06 versioning
- **core/12b — Versions drawer** — absorbed into core/06 versioning
- **core/15 — Timeline / scaletta** — absorbed into core/04 outline + core/12 schedule
- **ai/14b — Auto-outline** — merged into unified ai/14
- **ai/16 — Logline → scaletta** — merged into unified ai/14

---

## 1. Prerequisites

| Tool           | Minimum version | Notes                        |
| -------------- | --------------- | ---------------------------- |
| Node.js        | 22              | Use `.nvmrc` or `nvm use 22` |
| pnpm           | 10              | `corepack enable pnpm`       |
| Docker Desktop | any recent      | For Postgres and Redis       |
| Git            | any             |                              |

Optional (only needed for full integration):

- Anthropic API key — AI narrative assistant and scene predictions
- Google OAuth credentials — Google login
- GitHub OAuth credentials — GitHub login

---

## 2. Repository Structure

```
oh-writers/
├── apps/
│   ├── web/                    # TanStack Start (SSR, file-based routing)
│   └── ws-server/              # Hono WebSocket server (Yjs real-time sync)
├── packages/
│   ├── db/                     # Drizzle ORM schema, migrations, seed
│   ├── shared/                 # Zod schemas, branded types, constants
│   └── ui/                     # Design tokens, shared CSS
├── docker/
│   ├── docker-compose.dev.yml  # Postgres + Redis only (dev)
│   └── docker-compose.yml      # Full production stack
├── tests/                      # Playwright tests (all test types live here)
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   └── specs/                  # Feature specs 01–09
├── SPEC.md                     # Product overview and feature set
├── CLAUDE.md                   # Coding guidelines for Claude Code
├── playwright.config.ts
├── tsconfig.base.json
└── package.json                # Workspace root — all shared scripts
```

### Package responsibilities

| Package                 | What it owns                                               |
| ----------------------- | ---------------------------------------------------------- |
| `@oh-writers/web`       | All UI, routes, `createServerFn` calls, Better Auth client |
| `@oh-writers/ws-server` | WebSocket server, Yjs provider, room auth                  |
| `@oh-writers/db`        | Drizzle schema, migrations, `db` client export             |
| `@oh-writers/shared`    | Zod schemas, branded IDs, tagged consts, Result type       |
| `@oh-writers/ui`        | `tokens.css` design tokens, shared component stubs         |

---

## 3. First-Time Setup

```bash
# 1. Clone
git clone <repo-url> oh-writers
cd oh-writers

# 2. Install all dependencies (workspaces)
pnpm install

# 3. Copy environment file
cp .env.example .env
# Edit .env — see section 4 for details

# 4. Start Postgres and Redis
docker compose -f docker/docker-compose.dev.yml up -d

# 5. Apply database migrations
pnpm db:migrate

# 6. (Optional) Seed with realistic sample data
pnpm db:seed

# 7. Start all apps
pnpm dev
```

After step 7:

- Web app: http://localhost:3000
- WebSocket server: http://localhost:1234
- Health check: http://localhost:1234/health

---

## 4. Environment Variables

Copy `.env.example` to `.env`. All variables and their meaning:

```bash
# ── Database ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_dev
# Connection string for Drizzle and the web app.
# Must match the credentials in docker-compose.dev.yml.

# ── Redis ─────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
# Used for session caching and real-time presence (pub/sub).

# ── Better Auth ───────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=change-me-in-production-min-32-chars
# Must be at least 32 characters. Generate with: openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
# The public URL of the web app. Used for OAuth redirect URIs.

# ── OAuth: Google (optional) ──────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Leave empty to disable Google login.
# Create credentials at: console.cloud.google.com → APIs & Services → Credentials

# ── OAuth: GitHub (optional) ──────────────────────────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# Leave empty to disable GitHub login.
# Create an OAuth App at: github.com/settings/developers

# ── Anthropic (optional) ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=
# Required for AI narrative assistant, scene predictions, and Cesare
# breakdown suggestions. Leave empty and set MOCK_AI=true to develop
# without it. The `@anthropic-ai/sdk` package is dynamically imported
# only when MOCK_AI is unset, so it is an optional install — run
# `pnpm install @anthropic-ai/sdk` in `apps/web` before disabling
# MOCK_AI in production.

# ── WebSocket server ──────────────────────────────────────────────────────
WS_PORT=1234
# Port the Hono ws-server listens on.
WS_SECRET=change-me-in-production-min-32-chars
# Shared secret used to validate session tokens between web and ws-server.

MOCK_AI=false
# Set to true to serve AI responses from mocks/ai-responses.ts.
# No Anthropic API key needed when MOCK_AI=true.
```

### Minimum viable `.env` for local dev

```bash
DATABASE_URL=postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_dev
BETTER_AUTH_SECRET=dev-secret-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:3000
MOCK_AI=true
```

Redis and the WebSocket server are only needed for real-time collaboration (Spec 09, not yet implemented).

---

## 5. Development Modes

The app requires a real PostgreSQL database. Start the dev Postgres container, apply migrations, then run the dev server.

```bash
docker compose -f docker/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm dev
```

Set `MOCK_AI=true` if you don't have an Anthropic key. Redis and the WebSocket server are only required for real-time collaboration (not yet implemented).

---

## 6. Daily Dev Workflow

```bash
# Start infrastructure (if not already running)
docker compose -f docker/docker-compose.dev.yml up -d

# Start all apps in parallel (web on :3000, ws-server on :1234)
pnpm dev

# OR: same thing wrapped in automatic DB snapshots (pre/post session)
pnpm dev:session

# In a separate terminal — run tests in watch mode
pnpm test:ui
```

The `pnpm dev` command runs `vinxi dev` (web) and `tsx watch` (ws-server) in parallel. Both support hot reload.

`pnpm dev:session` is the recommended wrapper when working on real project data: it snapshots the dev database before starting the stack and again on exit (Ctrl+C included). A standalone snapshot is `pnpm db:backup [label]` — dumps land in `backups/` (git-ignored); the restore command is documented in `scripts/backup-dev-db.sh`.

### Ports

| Service          | Port                                 |
| ---------------- | ------------------------------------ |
| Web app          | 3000                                 |
| WebSocket server | 1234                                 |
| Postgres         | 5432                                 |
| Redis            | 6379                                 |
| Drizzle Studio   | 4983 (when running `pnpm db:studio`) |

---

## 7. Database

### Schema

All tables are defined in `packages/db/src/schema/`. One file per entity:

```
packages/db/src/schema/
├── users.ts          # users, sessions, accounts, verifications (Better Auth)
├── teams.ts          # teams, team_members, team_invitations
├── projects.ts       # projects
├── documents.ts      # documents (logline, synopsis, outline, treatment)
├── screenplays.ts    # screenplays, screenplay_versions, screenplay_branches
├── scenes.ts         # scenes, characters
└── predictions.ts    # ai_predictions
```

Types are always inferred from Drizzle — never written manually:

```ts
import { users } from "@oh-writers/db";

type User = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;
```

### Migrations

**Never edit the database by hand.** Always go through migrations.

```bash
# After changing a schema file, generate a migration
pnpm db:migrate:create

# Apply pending migrations
pnpm db:migrate

# Check migration status
pnpm db:migrate:status
```

Migrations are stored in `packages/db/drizzle/` and committed to git. The migration applied on every CI run and deployment.

### Seed data

```bash
# Load realistic sample data (users, teams, projects, screenplays)
pnpm db:seed

# Wipe all data and re-seed from scratch
pnpm db:seed:reset
```

The seed creates:

- 3 users: `admin`, `writer1`, `writer2`
- 1 team: "Brutalist Studio" with all 3 members
- 2 projects: one short film, one feature film
- A sample screenplay with ~15 scenes and mock AI predictions

### Drizzle Studio

Visual database browser, useful for inspecting data during development:

```bash
pnpm db:studio
# Opens at http://local.drizzle.studio
```

---

## 8. Available Scripts

All scripts are run from the workspace root.

### Development

| Script           | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | Start web (:3000) and ws-server (:1234) in parallel with hot reload |
| `pnpm build`     | Build all packages then all apps (production artifacts)             |
| `pnpm typecheck` | Run `tsc --noEmit` across all packages                              |
| `pnpm lint`      | Run ESLint across all packages                                      |

### Testing

| Script         | What it does                                                  |
| -------------- | ------------------------------------------------------------- |
| `pnpm test`    | Run all Playwright tests headlessly                           |
| `pnpm test:ui` | Open Playwright UI (interactive test runner with time-travel) |

### Database

| Script                     | What it does                                 |
| -------------------------- | -------------------------------------------- |
| `pnpm db:migrate`          | Apply all pending Drizzle migrations         |
| `pnpm db:migrate:create`   | Generate a new migration from schema changes |
| `pnpm db:migrate:status`   | Show which migrations have been applied      |
| `pnpm db:migrate:rollback` | Rollback last migration (use with caution)   |
| `pnpm db:seed`             | Load sample data                             |
| `pnpm db:seed:reset`       | Wipe and re-seed                             |
| `pnpm db:studio`           | Open Drizzle Studio                          |

### Releases

| Script                 | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `pnpm release`         | Bump patch version, tag, update CHANGELOG              |
| `pnpm release:minor`   | Bump minor version                                     |
| `pnpm release:major`   | Bump major version                                     |
| `pnpm release:dry-run` | Preview what a release would do without touching files |

---

## 9. Testing

Two test runners, each for its purpose:

- **Vitest** — fast unit tests for pure functions, parsers, reducers, schema validation. Co-located with the source file (e.g. `keymap.test.ts` next to `keymap.ts`). Run with `pnpm test:unit`.
- **Playwright** — browser and E2E tests for auth flows, page navigation, editor interactions, mutations. Lives in `tests/`. Run with `pnpm test`.

### Test location

```
tests/
├── fixtures.ts                    # authenticatedPage fixture (pre-logged-in browser context)
├── helpers.ts                     # shared: BASE_URL, waitForEditor, goToNewLine
├── auth/                          # Login, registration, OAuth flows
├── projects/                      # Project CRUD
├── screenplay-editor/             # Editor UX — keyboard flow, toolbar, autocomplete
├── breakdown/                     # Breakdown tagging and export
├── budget/                        # Budget generation and CSV/PDF export
├── schedule/                      # Schedule generation, drag-and-drop, export
├── shooting-plan/                 # Shot list editor and export
└── locations/                     # Location scouting
```

### Running tests

```bash
# All Playwright tests (headless, against test DB on :3002)
pnpm test

# Interactive Playwright UI — time-travel debugger
pnpm test:ui

# Vitest unit tests (watch mode)
pnpm test:unit

# A single Playwright file
pnpm exec playwright test tests/schedule/schedule-export.spec.ts

# A specific test by tag
pnpm exec playwright test --grep "\[OHW-380\]"
```

### Test naming convention

Every Playwright test name starts with a tag referencing the feature spec:

```ts
test("[OHW-380] exports schedule as CSV", async ({
  authenticatedPage: page,
}) => {
  // ...
});
```

Tags are globally unique integers. `OHW-380` maps to spec `core/28-export-audit.md`, schedule section.

### Test infrastructure

`playwright.config.ts` starts a dedicated test server on port 3002 against the `oh_writers_test` database before the suite runs. The `authenticatedPage` fixture in `tests/fixtures.ts` provides a pre-authenticated browser context (logged in as `test@ohwriters.dev`), so individual tests don't need to handle login.

Tests require a seeded test database. Run once before the first test run:

```bash
pnpm db:seed:test   # seeds oh_writers_test DB
```

### QA Pipeline

Every push to `main` and every PR is validated by GitHub Actions (`.github/workflows/qa.yml`). Locally, a Husky pre-push hook (`.husky/pre-push`) runs the same checks before allowing the push, so what passes locally also passes CI.

**What gets checked**

1. **Typecheck** — `pnpm typecheck` (recursive `tsc --noEmit` across all workspaces)
2. **Lint** — `pnpm lint` (ESLint, `--max-warnings 0`)
3. **Unit tests** — `pnpm test:unit` (Vitest in `@oh-writers/web`)
4. **Mock E2E** — `MOCK_AI=true pnpm test:e2e -- --project=mock-ui` (Cesare agentic Playwright suite against the test DB)
5. **Production build** — `pnpm build` (packages + web app)

**Bypassing the hook (emergency only)**

```bash
git push --no-verify
```

Use sparingly. CI will still block the merge if any job fails. Branch protection on `main` requires every QA job to be green.

**Manual cost smoke (Cesare-touching features only)**

For Cesare-touching features, run `pnpm cost:smoke:<feature>` locally with `ANTHROPIC_API_KEY` set to measure real token costs. This is **not** in CI (would burn real API credits). See the vernissage report for each feature.

---

## 10. Code Conventions

Read `CLAUDE.md` for the full guidelines. Key points:

### TypeScript

- **All types from Zod** — never write a `type` or `interface` for domain data manually. Infer from Zod schemas in `packages/shared/`.
- **Branded IDs** — use `UserId`, `TeamId`, `ScreenplayId`, etc. from `@oh-writers/shared`. Never pass a raw `string` where an ID is expected.
- **Result pattern** — functions that can fail return `Result<T, E>`:

```ts
import { ok, err } from "@oh-writers/shared";

function parseScene(text: string): Result<Scene, ParseError> {
  if (!text) return err(new ParseError("empty"));
  return ok({ heading: text });
}
```

- **Tagged const objects** — use `TeamRoles`, `Genres`, `Formats`, etc. from `@oh-writers/shared` instead of string literals:

```ts
import { TeamRoles } from "@oh-writers/shared";
member.role === TeamRoles.OWNER;
```

### CSS

- **CSS Modules only** — one `.module.css` per component, camelCase class names
- **Custom properties only** — never hardcode hex values or arbitrary `px`. Use tokens from `packages/ui/src/styles/tokens.css`:

```css
/* Good */
.button {
  border: var(--border);
  color: var(--color-black);
  padding: var(--space-2) var(--space-4);
}

/* Bad */
.button {
  border: 2px solid #0a0a0a;
  padding: 8px 16px;
}
```

- **No Tailwind**, no CSS-in-JS, no styled-components, no `style` props
- **Border radius: 0** — brutalist design, no rounded corners anywhere

### File naming

| What            | Convention              | Example                       |
| --------------- | ----------------------- | ----------------------------- |
| React component | `PascalCase.tsx`        | `ScreenplayEditor.tsx`        |
| CSS module      | `PascalCase.module.css` | `ScreenplayEditor.module.css` |
| Hook            | `useCamelCase.ts`       | `useScreenplayEditor.ts`      |
| Server function | `domain.server.ts`      | `screenplay.server.ts`        |
| Zod schema      | `domain.schema.ts`      | `screenplay.schema.ts`        |

### Git commits

Format: `[OHW] type: description`

```
[OHW] feat: add scene heading autocomplete
[OHW] fix: prediction not invalidated after scene delete
[OHW] chore: update drizzle-kit to 0.32
[OHW] refactor: extract scene parser to pure function
[OHW] test: add e2e for team invitation flow
```

Do not add `Co-Authored-By: Claude` or any AI signature.

### PR target branch

Always target `develop`. Main is production-only.

---

## 11. Adding a New Feature

### 1. Read the spec

All features are specced in `docs/specs/`. Start there before writing any code.

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

In `packages/domain/src/`, add or extend a schema file:

```ts
// packages/domain/src/myFeature.schema.ts
import { z } from "zod";

export const MyFeatureSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
});

export type MyFeature = z.infer<typeof MyFeatureSchema>;
```

### 4. Update the Drizzle schema (if new table needed)

Add or edit a file in `packages/db/src/schema/`, then:

```bash
pnpm db:migrate:create   # generates SQL migration
pnpm db:migrate          # applies it
```

### 5. Write the server function

All client→server calls go through `createServerFn`. No tRPC, no raw fetch.

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

test("[OHW-0XX] can create a my feature", async ({
  authenticatedPage: page,
}) => {
  await page.goto(`${BASE_URL}/projects/${PROJECT_ID}/my-feature`);
  // ...
});
```

Unit tests for pure functions go next to the source file:

```ts
// features/myFeature/server/myFeature.server.test.ts
import { describe, it, expect } from "vitest";
```

---

## 12. Docker

### Dev (Postgres + Redis only)

Local dev keeps Docker minimal: only **Postgres + Redis** run in containers.
The web app and ws-server run **natively** via `pnpm dev` — lighter on Mac
RAM/CPU than running them inside Docker.

```bash
# Recommended: scripted flow (start infra + migrations + seed)
pnpm dev:up
pnpm dev          # in a separate terminal — runs app natively

# Stop infra (data preserved)
pnpm dev:down

# Or raw compose
docker compose -f docker/docker-compose.dev.yml up -d
docker compose -f docker/docker-compose.dev.yml down
docker compose -f docker/docker-compose.dev.yml down -v   # wipe volumes
```

### Langfuse (AI tracing) — opt-in, off by default

The Langfuse stack (web + worker + ClickHouse + MinIO + Redis + Postgres) is
heavy (~6 containers, RAM-hungry). It lives in a **separate compose file**
and is **not started by `pnpm dev:up`**. Containers use `restart: 'no'` so
they do **not** auto-start when Docker Desktop boots — keeps the Mac quiet
until you actually need traces.

```bash
# Start Langfuse only when debugging AI calls
pnpm dev:up:langfuse        # dashboard → http://localhost:3001

# Stop it again
pnpm dev:down:langfuse
pnpm dev:down:langfuse --clean   # also wipes Langfuse volumes
```

If `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` are unset in
`apps/web/.env`, the app silently no-ops telemetry — you can develop without
Langfuse running.

### Production (full stack)

```bash
# Build and start all services
docker compose -f docker/docker-compose.yml up --build -d
```

The production compose starts four services: `postgres`, `redis`, `web`, `ws-server`.

### Dockerfile

Multi-stage build with named targets:

| Target      | What it produces                                      |
| ----------- | ----------------------------------------------------- |
| `web`       | Compiled TanStack Start app (`node server/index.mjs`) |
| `ws-server` | Compiled Hono ws-server (`node index.js`)             |

```bash
# Build only the web image
docker build --target web -t oh-writers-web .

# Build only the ws-server image
docker build --target ws-server -t oh-writers-ws .
```

---

## 13. Troubleshooting

### `pnpm install` fails with peer dependency errors

The `better-call` package (a dependency of `better-auth`) requires `zod@^4.0.0`, but we use `zod@3`. This is silenced intentionally:

```json
"pnpm": {
  "peerDependencyRules": { "ignoreMissing": ["zod"] }
}
```

If you see this warning, it is safe to ignore. The runtime behaviour is unaffected.

### `drizzle-kit` fails with `Cannot find module './xxx.js'`

Drizzle Kit's bundler does not resolve `.js` extensions to `.ts` files. All imports inside `packages/db/src/` must use extension-less paths (`./users`, not `./users.js`).

### `pnpm typecheck` fails on `baseUrl` warning in VS Code

VS Code shows a deprecation hint for `baseUrl` in `tsconfig.base.json`. This is a future TypeScript 7.0 deprecation — the compiler in TypeScript 5.x still accepts it fully. `pnpm typecheck` passes without errors. No action required.

### Postgres connection refused

Make sure the dev compose is running:

```bash
docker compose -f docker/docker-compose.dev.yml ps
# If not running:
docker compose -f docker/docker-compose.dev.yml up -d
```

If port 5432 is already in use by a local Postgres installation, either stop it or change the port mapping in `docker-compose.dev.yml`.

### Redis port 6379 already in use

An existing Redis container or local process is already running. Either reuse it by pointing `REDIS_URL` at it, or stop the existing process:

```bash
# Find what's using the port
lsof -i :6379
```

### `routeTree.gen.ts` is stale after adding a new route

The file is generated by the TanStack Router Vite plugin when the dev server starts. After adding a new file under `app/routes/`, restart `pnpm dev` once. The file will be regenerated automatically and should not be edited manually.

### WS server returns 426 on `/room/:roomId`

This is expected during scaffold. The full Yjs WebSocket implementation is described in `docs/specs/09-ws-server.md` and will be implemented in the ws-server feature sprint.
