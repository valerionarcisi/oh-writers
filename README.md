# Oh Writers

Professional screenplay collaboration platform. Real-time co-writing, AI-assisted narrative development, and production cost/risk predictions.

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

Oh Writers is a SaaS that follows a film from the first line of the logline to the first cut of the edit. Screenwriting, 1st AD work, production planning, and post hand-off — all in one project, one team, one AI copilot named **Cesare**. Built for indie production houses and film schools that don't want to stitch together Final Draft, Movie Magic, StudioBinder, Filmustage and an NLE plug-in just to make a movie.

**Status:** pre-demo. Actively seeking early design partners.

### The problem

Making a small-to-mid independent film today means working across a dozen disconnected tools. Final Draft for the screenplay, Google Docs for the treatment, Movie Magic for scheduling, StudioBinder or Filmustage for the set, then DaVinci or Premiere in the edit bay. Every hand-off is a manual copy-paste. Every rewrite breaks the schedule and the budget. AI — when present — is a side chatbot that knows nothing about the actual project.

The enterprise stack costs thousands of euros per seat. Indie production houses, film schools, and small teams either can't afford it or burn time they don't have holding it together.

### The solution — Oh Writers

One platform that walks with the production from first idea to rough cut, organized around five pillars:

1. **Write** — logline, synopsis, outline, treatment, screenplay. Real-time co-writing, universal versioning, comments, roles.
2. **Plan (with the 1st AD)** — automatic per-scene breakdown (cast, props, locations, VFX, vehicles, extras, sound FX); shooting schedule composition; **calendar templates per country of production** (working days, national holidays, allowed hours, night shifts, minimum rest); call sheets; budget. All generated and kept in sync by Cesare. For small and mid productions, this is enough to stop needing Movie Magic; complex productions can still export and integrate with it.
3. **Previsualize** — moodboards built from visual references and the treatment, then storyboards generated scene by scene from screenplay and breakdown, with shot lists tied to the shooting schedule. Cesare proposes frames, the director refines them. Replaces the Milanote + Boords + StudioBinder-shotlist stitch-up.
4. **Shoot** — locked scenes, director's notes, location scouting, version tracking on every take and rewrite.
5. **Edit** — scene markers and a rough cut assembled by our **DaVinci Resolve and Adobe Premiere agents**, returning into the platform as a living part of the project.

### Meet Cesare

Cesare is Oh Writers' AI copilot — not a chatbot parked on the side, but an agent that knows the project end-to-end. Cesare unblocks the blank page, reviews structure and beats, drafts breakdowns, composes shooting schedules under the labor constraints of the country you're shooting in, flags cast/location conflicts when the script changes, and — once the material is on the edit timeline — maps cuts back to the written scenes. One name, one voice, one memory spanning the whole production.

### Why now

- **AI finally understands narrative.** Modern models genuinely grasp structure, beats, and scene-level conflict. An AI copilot is useful, not decorative.
- **Agents can talk to professional software.** MCP and adjacent protocols let our platform integrate natively with DaVinci, Premiere, and other AI agents — no brittle file exports, no plug-in zoo.
- **Live collaboration is solved.** CRDT (Yjs) makes a Google-Docs-class experience native to screenwriting.
- **The market gap is wide.** The indie + school + small-production segment has no vertical platform — only enterprise suites or generic tools.

### Who it's for

1. **Small production houses (priority 1).** 2–30 people, 1–5 projects a year. Today bleeding budget on fragmented enterprise licenses. Oh Writers replaces the stack with one team subscription.
2. **Film schools and screenwriting courses (priority 2).** Annual institutional licenses, multi-student access, Cesare as integrated tutor. Students touch the full pipeline — logline to rough cut — without per-seat enterprise costs.
3. **Professional screenwriters and writing teams (priority 3).** Individual or team plans, editor plus Cesare as a shared story doctor. Viral entry point: writers bring the platform into the productions they work with.
4. **1st ADs and independent directors.** Natural extension from the screenwriter's project — already inside Oh Writers, no new tool to buy.

### Competitive landscape

| Stage                  | Incumbents                                 | Oh Writers                                                                                          |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Screenwriting          | Final Draft, WriterDuet, Arc Studio, Celtx | Modern editor, real-time co-writing, Cesare as story doctor                                         |
| Breakdown & pre-prod   | StudioBinder, Filmustage                   | Breakdown auto-generated from the live script, country-aware schedules                              |
| Scheduling             | Movie Magic Scheduling                     | Cesare handles scheduling natively for small-to-mid productions; export path kept for complex cases |
| Moodboard & storyboard | Milanote, Boords, StudioBinder shot lists  | Moodboard + storyboard + shot list generated by Cesare from script + breakdown                      |
| Post-production bridge | Manual exports, per-NLE plug-ins           | DaVinci Resolve & Adobe Premiere agents, script ⇄ rough cut round-trip                              |

No single competitor covers the full arc. Most don't speak to each other. None has an AI copilot that remembers the project across phases.

### Business model

Two tiers from day one:

- **Oh Writers SaaS — Teams & Schools.** Simple subscription, self-serve sign-up. For indie productions, film schools, writing collectives, and individual pros. Designed to replace the generalist stack at a fraction of the cost.
- **Oh Writers Enterprise.** Custom deployment for larger production houses, studios, or institutions with compliance and procurement needs. Dedicated onboarding, custom integrations, SLA.

Exact pricing is being defined during the pre-demo / design-partner phase.

### The NLE bridge — our competitive moat

No competitor in the indie tier closes the loop from script to rough cut. Oh Writers will, through agents running inside **DaVinci Resolve** and **Adobe Premiere**:

1. Oh Writers exports the approved scene plus markers (scene number, beat, dialogue).
2. The NLE agent assembles a **rough cut** from tagged clips, guided by the beats of the script.
3. The cut returns as a timeline in the platform, driving scene status: `written → shot → assembled → locked`.

This is the piece that turns Oh Writers from "writing + pre-production" into a **full indie production platform** — and justifies a premium positioning over StudioBinder, Filmustage, and the generalist scheduling stack. None of them have a native AI round-trip with the edit.

---

## 0.1 Roadmap — Done / MVP / Post-MVP

_Mirror of [`docs/specs/`](docs/specs/). Keep this in sync: move items from MVP → Done as they ship, and add new rows whenever a new idea lands, even before a spec file exists._

### Done — already shipped

- **core/01 + 01b — Auth**: email/password, OAuth Google + GitHub, sessions
- **core/02 — Teams & roles**: Owner / Editor / Viewer
- **core/03 — Projects**
- **core/04 foundations + 04e — Narrative editor** on vanilla ProseMirror (logline, synopsis, treatment) — closes BUG-001..003
- **core/05 + 05b–05i — Screenplay editor**: custom editor, autocomplete, scene numbering, heading slots, inline scene number edit
- **core/06 + 06b/c/d — Universal versioning**: panel, row popover, toolbar popover, drawer (all UI sub-specs absorbed)
- **core/08 — Scene renumber** (shipped with 05h heading slot refactor)
- **core/09 — Save indicator** (Cmd/Ctrl+S shipped)
- **core/14 — Title page**
- **core/20 — Shooting script PDF import**
- **core/04c — Narrative export** (logline + synopsis + treatment → PDF, opt-in cover page, preview tab)
- **core/05j — Screenplay export** (Fountain → industry-standard PDF via afterwriting, opt-in cover page, preview tab)
- **core/05k — Production export formats** (5 industry formats — Standard, Sides, AD copy, Reading copy, One scene per page — via single Export dropdown; per-format pre-processing pipeline + custom `awc-runner.cjs` for nested print-profile overrides; Sides modal with scene multi-select; filename slug per format)
- **core/10 — Scene Breakdown** (cast/props/locations/VFX/vehicles/extras/sound/wardrobe/SPFX/stunts/animals/makeup/set-dressing/notes per scene + per project, Cesare ghost suggestions with rate-limit, PDF/CSV export, version-aware with 3-tier stale awareness, auto-clone on new screenplay version)
- **core/10c — Inline scene tagging in middle column** (read-only ProseMirror reader of the full screenplay in the breakdown center column, inline highlight per category, ghost dashed underline for pending Cesare suggestions, floating selection toolbar with 14 categories, TOC scroll-to-scene)
- **core/10e — Auto-spoglio via RegEx** (zero-click breakdown population on first open: pure-function extractors over 9 categories — cast, locations, vehicles, animals, sound, atmosphere, makeup, stunts, extras — confidence-based default status, idempotent via `text_hash`, fan-out from the breakdown page)
- **core/07c — PDF import Pass 0 (title-page extraction)** (closes the residual MVP work on 07b: imported PDFs now feed both the screenplay body AND the front page; silent apply when front page is empty, "replace?" confirm via DS `<Dialog>` otherwise; OHW-FP30/31/32 verdi)
- **infra/07b sub — Design-system Dialog migration** (DS `Dialog` esteso con `size`/`showCloseButton`; 7 modali bespoke + 4 inline confirm migrati al componente unico; -721/+407 LOC, 102/102 Playwright verdi)

### MVP — the minimum viable pilot product

Goal: one film school and one indie production using Oh Writers on a real project, end-to-end, within 6 months. Everything outside this list is cut or deferred.

**Core platform**

- **core/09b — Realtime WebSocket server** (moved here from infra, Yjs co-writing needs it)
- **core/10f — Breakdown table view** (Movie-Magic-style editable table + scene × element matrix; in-place editing, bulk operations, URL-persisted filters)
- **core/11 — Budget** (line items from breakdown, totals — no AI risk prediction yet)
- **core/12 — Shooting schedule** with **one country template (Italy)** — working days, holidays, night shifts, minimum rest
- **core/12 — Call sheet generation** from schedule + breakdown (absorbed from "Ideas" list)
- **core/16 — Multi-tenancy & billing** — Teams tier only, Enterprise handled manually in pre-demo phase

**AI — Cesare MVP**

- **ai/17 — Cesare assistant v1** — structure review on narrative docs, breakdown drafting, schedule drafting (human approves)

**Infra**

- **infra/07b — Design system** — prerequisite for demo without shame
- **infra/08 — Infrastructure** + **08b — Cloud deploy** (staging + prod)
- **infra/07c — Docker E2E** (needed to keep CI green during the push)

### Post-MVP — after the first two design partners

Once the pilot loop is working, in priority order:

- **core/13 — Locations & scouting** (notes, photos, attachments)
- **ai/17b — Story doctor** — deeper narrative critique, beat analysis
- **ai/19a — Moodboard only** (upload + organize visual references, no AI generation yet)
- **agents/NLE round-trip (DaVinci first)** — minimal export of scene + beat markers, re-import FCPXML, scene status `written → shot → assembled → locked`
- **ai/07 — Predictions engine** — cost & risk prediction (sells the Enterprise tier — not needed to close the first schools/indies)
- **ai/14 — Narrative generation (unified)** — auto-logline, auto-synopsis, auto-outline, logline→scaletta (old ai/14 + 14b + 16 merged into one spec)
- **ai/19b — Storyboard generation** (AI frame generation from screenplay + moodboard — depends on image model quality being good enough)
- **agents/Premiere** — parity with DaVinci round-trip
- **agents/Industry interchange** — FDX, FCPXML, EDL, `.mms` import/export (for migration & pro workflows)
- **agents/MCP server** — expose Oh Writers to Claude Desktop, Cursor, ChatGPT
- **core/18 — i18n** — Italian + English, triggered by the first non-IT customer
- **infra/07 — Core refactor** (triggered only if scaling hurts)

### Archived / absorbed / won't do

- **core/04b — Outline drag & drop** — absorbed into core/04 narrative editor, nice-to-have
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

| Package                 | What it owns                                         |
| ----------------------- | ---------------------------------------------------- |
| `@oh-writers/web`       | All UI, routes, tRPC client, Better Auth client      |
| `@oh-writers/ws-server` | WebSocket server, Yjs provider, room auth            |
| `@oh-writers/db`        | Drizzle schema, migrations, `db` client export       |
| `@oh-writers/shared`    | Zod schemas, branded IDs, tagged consts, Result type |
| `@oh-writers/ui`        | `tokens.css` design tokens, shared component stubs   |

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

# In a separate terminal — run tests in watch mode
pnpm test:ui
```

The `pnpm dev` command runs `vinxi dev` (web) and `tsx watch` (ws-server) in parallel. Both support hot reload.

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

All tests use **Playwright exclusively**. No Vitest, no Jest, no Cypress.

### Test location

```
tests/
├── smoke.spec.ts           # Health checks for web + ws-server
├── auth/                   # Login, registration, OAuth flows
├── teams/                  # Team creation, invitations, roles
├── projects/               # Project CRUD, archive
├── screenplay-editor/      # Editor interactions, save, export
└── collaboration/          # Real-time co-editing with multiple browser contexts
```

### Running tests

```bash
# All tests (headless)
pnpm test

# Interactive UI — recommended during development
pnpm test:ui

# A single file
pnpm exec playwright test tests/smoke.spec.ts

# A specific test by name
pnpm exec playwright test --grep "\[OHW-001\]"
```

### Test naming convention

Every test name starts with a tag referencing the feature spec:

```ts
test("[OHW-001] user can register with email and password", async ({
  page,
}) => {
  // ...
});
```

Tags match spec numbers: `OHW-001` = `docs/specs/01-auth.md`.

### What Playwright tests replace

| Purpose                  | How we test it                                                  |
| ------------------------ | --------------------------------------------------------------- |
| Pure functions / parsers | Playwright Node context (no browser needed)                     |
| UI components            | Playwright component test with `page.goto` to a dedicated route |
| Full flows               | Playwright E2E with real browser                                |
| tRPC procedures          | Playwright `request` context (HTTP calls, no browser)           |

### Test infrastructure

`playwright.config.ts` at the root starts both servers automatically before tests run:

```ts
webServer: [
  {
    command: "pnpm --filter @oh-writers/web dev",
    url: "http://localhost:3000",
  },
  {
    command: "pnpm --filter @oh-writers/ws-server dev",
    url: "http://localhost:1234/health",
  },
];
```

Tests require a live database. Run `pnpm db:seed` before the first test run.

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
| tRPC router     | `domain.router.ts`      | `screenplay.router.ts`        |
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
│   └── myFeature.router.ts
└── index.ts
```

### 3. Add the Zod schema

In `packages/shared/src/schemas/`, add or extend a schema file:

```ts
// packages/shared/src/schemas/myFeature.schema.ts
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
pnpm db:migrate:create   # generates SQL
pnpm db:migrate          # applies it
```

### 5. Build the tRPC router

```ts
// features/myFeature/server/myFeature.router.ts
import { router, protectedProcedure } from "~/server/trpc";
import { MyFeatureSchema } from "@oh-writers/shared";

export const myFeatureRouter = router({
  create: protectedProcedure
    .input(MyFeatureSchema.pick({ name: true }))
    .mutation(async ({ ctx, input }) => {
      // ctx.user is always available in protectedProcedure
      return ctx.db
        .insert(myFeatureTable)
        .values({ ...input, userId: ctx.user.id });
    }),
});
```

Register it in the root tRPC router at `apps/web/app/server/trpc.ts`.

### 6. Write Playwright tests

```ts
// tests/myFeature/myFeature.spec.ts
import { test, expect } from "@playwright/test";

test("[OHW-0XX] can create a my feature", async ({ page }) => {
  await page.goto("/");
  // ...
});
```

---

## 12. Docker

### Dev (Postgres + Redis only)

```bash
# Start
docker compose -f docker/docker-compose.dev.yml up -d

# Stop
docker compose -f docker/docker-compose.dev.yml down

# Wipe volumes (full reset of DB and Redis)
docker compose -f docker/docker-compose.dev.yml down -v
```

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
