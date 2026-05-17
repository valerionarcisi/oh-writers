# Oh Writers — Project Overview & Strategic Design

## What Is Oh Writers

Oh Writers is a professional screenplay collaboration platform that unifies writing, narrative development, and AI-powered production intelligence in one place.

The film industry workflow is fragmented: screenwriters use Final Draft, ADs break down scripts on paper or Movie Magic, line producers budget in EP Budgeting, location scouts use spreadsheets. None of these tools talk to each other, and every handoff loses context.

Oh Writers collapses this pipeline:

```
Write screenplay → AI extracts production elements → AI estimates costs → AI suggests schedule → Humans refine everything
```

The key insight: a screenplay is structured data disguised as text. Fountain format is parseable. Scene headings encode locations and time of day. Character cues encode cast. Action lines encode props, vehicles, VFX. If you can parse it, you can automate the breakdown — and if you have the breakdown, budget and schedule flow from it.

### What Makes It Different

- **Final Draft / Highland** = writing only, no production intelligence
- **Movie Magic / EP** = production only, no writing environment
- **StudioBinder** = closest competitor, but no AI automation and weaker editor
- **Oh Writers** = writing + AI-powered production planning + funding intelligence in one place, real-time collaboration, modern web stack

### The Bet

Screenwriters and small production teams will value having writing, production planning, and funding discovery unified, with AI reducing the manual work between them.

---

## Tech Stack

| Layer          | Tool                                                      |
| -------------- | --------------------------------------------------------- |
| Framework      | TanStack Start (SSR, file-based routing)                  |
| Routing        | TanStack Router                                           |
| Server calls   | `createServerFn` — the only way to call server logic      |
| Data fetching  | TanStack Query (via `queryOptions` + `useSuspenseQuery`)  |
| ORM            | Drizzle + PostgreSQL                                      |
| Auth           | Better Auth (team/org support)                            |
| Editor         | Monaco (screenplay editing, custom Fountain tokenizer)    |
| Collaboration  | Yjs + y-websocket (real-time sync — planned)              |
| Styling        | CSS Modules — zero Tailwind, zero CSS-in-JS               |
| Validation     | Zod — single source of truth for all types                |
| Error handling | neverthrow — `Result` and `ResultAsync`, ts-pattern match |
| Testing        | Playwright only                                           |
| AI (text)      | Anthropic Claude API                                      |
| AI (images)    | TBD — image generation for storyboard sketches            |

### Why These Choices

**TanStack Start** — `createServerFn` replaces tRPC, API routes, and server actions in one primitive. Every feature is "client form → server validation → DB mutation → typed response." Clean fit.

**Monaco** — heavy, but the language extension system enables Fountain tokenization, Tab cycling, character/location autocomplete. Treating screenplay like source code. Trade-off: no mobile support.

**neverthrow** — `Result<T, E>` with typed error tags and exhaustive matching. Verbose but correct for a domain with many failure modes (permission denied, not found, version conflict, AI timeout). Silent failures would lose people's work.

**CSS Modules + design tokens** — contrarian (no Tailwind), but for a design-heavy app with a specific visual identity, owning the design system gives control that utility classes don't.

---

## Architecture

### Monorepo Structure

```
oh-writers/
├── apps/
│   ├── web/                    # TanStack Start app
│   └── ws-server/              # Hono WebSocket server (Yjs — planned)
├── packages/
│   ├── db/                     # Drizzle schema, migrations, seed
│   ├── shared/                 # Zod schemas, branded IDs, Result utilities, errors
│   └── ui/                     # Design tokens, shared CSS
├── tests/                      # Playwright E2E tests
└── docs/
    ├── architecture.md
    ├── data-model.md
    └── specs/                  # Feature specifications
```

### Key Patterns

**Feature colocation** — each feature is a vertical slice:

```
features/screenplay-editor/
├── components/
├── hooks/
├── server/        ← createServerFn definitions
├── styles/
└── index.ts       ← public API
```

No reaching across feature boundaries except through the public `index.ts`.

**Zod as source of truth** — schemas define types, Drizzle defines DB, they meet at the server function boundary. No hand-written TypeScript interfaces.

**ResultShape at the wire** — `toShape()` on server, `unwrapResult()` on client. Solves neverthrow serialization over JSON.

**Error classes as value objects** — plain objects with `_tag` field for ts-pattern discrimination. No `extends Error` (non-enumerable properties don't survive JSON).

---

## What's Been Built

### Spec 01-01b: Authentication

- Email/password, OAuth stubs (Google/GitHub)
- Better Auth sessions, `requireUser()` guard
- Login/register pages

### Spec 02: Teams

- Owner/editor/viewer roles
- Permission checks on all mutations

### Spec 03: Projects

- CRUD with title, genre, format, logline
- Auto-creates 4 narrative documents + 1 screenplay on project creation
- Archive and soft-delete

### Spec 04: Narrative Editor

- Logline, synopsis, outline, treatment
- Free mode and assisted mode (AI sidebar)
- Auto-save every 30 seconds

### Spec 05 + 05b + 05c + 05d: Screenplay Editor

- Monaco with custom Fountain tokenizer
- Tab cycling between elements
- Smart Enter keybindings (CHARACTER → DIALOGUE → ACTION)
- Character/location autocomplete
- PDF import
- Page counter (55 lines = 1 page)

### Spec 06: Versioning

- Auto-snapshots every 5 minutes
- Manual versions with labels
- Visual diff (green/red)
- Restore

### Spec 30 + 30b: Bandi & Finanziamenti + Centro Notifiche

The Italian audiovisual funding landscape is deeply fragmented: 19 regional Film Commissions, MiC national calls, Creative Europe MEDIA, Eurimages, tax credit, broadcaster pre-sales, co-production funds, crowdfunding, private investment, and festival residencies. No filmmaker knows all the channels available to their project.

Oh Writers solves this with a structured funding catalog and AI-powered matching:

- **Funding profile**: user fills 5–6 fields (production phase, estimated budget, region, production company, co-production) — Oh Writers computes compatibility scores against all opportunities
- **Match score (0–100)**: deterministic formula — no LLM in the scoring loop. Hard gates (format mismatch, budget out of range, missing production company) exclude incompatible opportunities. Soft score rewards regional match, genre compatibility, budget fit, urgency
- **Catalog (seed: ~30 opportunities)**: MiC Sviluppo/Produzione/Distribuzione, Creative Europe MEDIA Development/Production/Distribution, Tax Credit (rolling, 40% of production costs), Eurimages, Apulia Film Fund, Sardegna Film Commission, Torino Film Lab, Biennale College Cinema, and more
- **Content management**: admin-curated entries + selective semi-automation from stable RSS feeds (MiC, Creative Europe) — no fragile scraping of 19 regional HTML portals
- **Notification center**: bell icon in TopBar with badge. Proactive alerts: new compatible opportunity (score ≥ 70), deadline in 7 days (warning), deadline tomorrow (urgent). Deduplication prevents flood. Configurable preferences per user

Tax credit has special logic: `deadlineType = rolling`, always visible, shown as "not yet available" if the user lacks a production company rather than hidden.

The real moat: Oh Writers already holds the project data (logline, genre, format, budget, phase, regions) from the screenplay and breakdown features. The funding match is a zero-friction output of data the user already provided.

**Future**: Cesare pre-fills funding application forms using project data already in Oh Writers. No filmmaker has this today.

### Spec 07b: Design System

- Dark modern SaaS palette
- Inter (UI) / Lora (content) / Courier Prime (screenplay)
- 11 UI components, design tokens, shadow elevation

---

## What's Ahead — Build Order

The remaining features are ordered by dependency and strategic value. AI-first, collaboration-after.

### Phase 1 — Complete the Writer Experience

| #   | Spec                | What It Unlocks                              | Complexity | Risk |
| --- | ------------------- | -------------------------------------------- | ---------- | ---- |
| 1   | **08 — PDF Export** | Writers can share their work outside the app | Low        | Low  |

### Phase 2 — AI Pipeline

| #   | Spec                            | What It Unlocks                                                                                            | Complexity | Risk   |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| 2   | **07 — AI Predictions**         | AI infrastructure, cost/risk per scene                                                                     | Medium     | Medium |
| 3   | **10 — Breakdown**              | Gateway to all production features — AI extracts cast, props, costumes, vehicles, VFX, locations per scene | High       | High   |
| 4   | **14 — Storyboard**             | Visual shot planning with AI-generated sketches                                                            | High       | Medium |
| 5   | **11 — Budget**                 | Cost estimation from breakdown data                                                                        | Medium     | Medium |
| 6   | **12 — Schedule / Strip Board** | Shooting day planning, scene ordering                                                                      | High       | Low    |
| 7   | **13 — Locations**              | Scouting workflow, candidates, photos, map                                                                 | Medium     | Low    |
| 8   | **15 — Calendar & OdG**         | Daily call sheet — the operational document for each shooting day                                          | Medium     | Low    |

### Phase 3 — Funding Intelligence

| #   | Spec                              | What It Unlocks                                                    | Complexity | Risk |
| --- | --------------------------------- | ------------------------------------------------------------------ | ---------- | ---- |
| 9   | **30 — Bandi & Finanziamenti**    | AI match between project and Italian/EU funding opportunities      | Medium     | Low  |
| 10  | **30b — Centro Notifiche**        | Proactive deadline alerts and new match notifications in-app       | Medium     | Low  |

### Phase 4 — Multiplayer

| #   | Spec                     | What It Unlocks                             | Complexity | Risk   |
| --- | ------------------------ | ------------------------------------------- | ---------- | ------ |
| 11  | **09 — WebSocket / Yjs** | Real-time collaboration on everything above | High       | Medium |

### Why This Order

**PDF Export first** — smallest spec, highest immediate value. Writers need output.

**AI Predictions before Breakdown** — lighter AI feature that lets you build the infrastructure (Anthropic API integration, caching, rate limiting, mock mode) before the heavier extraction work.

**Breakdown is the gateway** — specs 11-15 all consume breakdown data. Nothing in the production intelligence layer works without it.

**Storyboard after Breakdown** — needs scene data (characters, location, props) to generate meaningful sketches. Placed before budget/schedule because number of shots per scene influences shooting time estimates.

**Calendar & OdG last in the AI pipeline** — it's the output document that consumes data from all previous specs (breakdown elements + schedule days + location addresses = complete call sheet).

**Funding Intelligence before Multiplayer** — Bandi & Finanziamenti (Spec 30/30b) is low-complexity but high strategic value. It makes Oh Writers useful outside active production — a filmmaker checks funding options before committing to a project. This expands the addressable moment in the user's workflow from "writing" to "development and financing." It also deepens the moat: the more production data Oh Writers holds, the more accurate the funding match becomes.

**WebSocket/Yjs at the end** — real-time collaboration is a multiplier, not a differentiator. When it ships, users collaborate on a full production platform, not just a text editor.

---

## Spec 14: Storyboard — New Feature

### Vision

Replaces the paper-based storyboard workflow. The user sits on a single scene and "unpacks" it into shots — exactly as they would on paper, but with AI-generated sketches instead of hand-drawn stick figures.

### Core Flow

1. User selects a scene (already broken down via Spec 10)
2. AI generates an initial sketch for each suggested shot — style: production storyboard sketch (pencil/ink style, not photorealistic, not stick figures)
3. User reviews the sequence: adds, removes, or reorders shots
4. For each shot, user can annotate: camera movement, angle, framing notes
5. User can regenerate any individual sketch with refined description
6. Result: a strip of frames with notes — the digital equivalent of a hand-drawn storyboard

### Key Design Decisions

- **Scene-centric, not batch** — you work on one scene at a time, not the whole screenplay
- **Conversational** — AI proposes, user refines. Not "generate all and review"
- **Style B: production sketch** — stylized pencil/ink illustrations with recognizable figures, perspective, light/shadow. Not stick figures (that's what the user already does on paper — the AI should do better), not photorealistic (overkill and uncanny)
- **Annotations are text, not drawn** — camera movement, angle, notes are text fields per shot, not drawn arrows on the image
- **Image generation model TBD** — requires integration with an external image generation service (not Claude). Decision deferred to implementation.

### Dependencies

- Spec 10 (Breakdown) — needs scene elements (characters, location, props) for context-aware sketch generation
- External image generation API — new infrastructure dependency

---

## Spec 15: Calendar & OdG — New Feature

### Vision

The OdG (Ordine del Giorno / call sheet) is the operational document for a single shooting day. It pulls data from breakdown, schedule, and locations to produce the document that cast and crew receive the night before shooting.

Reference: real OdG from "Non fa ridere" (2/12/2025) — used as the target format.

### What an OdG Contains

- **Header**: film title, director, DOP, shooting date, location address
- **Scenes to shoot**: in shooting order (not narrative order), with environment notes
- **Cast call times**: staggered by costume/makeup needs — who arrives when, when they're camera-ready
- **Props/fabbisogno**: what needs to be on set for the day's scenes
- **Costume/makeup notes**: special requirements (aging, period costumes, etc.)
- **General notes**: weather contingencies, parking, meals, safety

### Core Flow

1. User selects a shooting day from the schedule (Spec 12)
2. System assembles the OdG automatically from:
   - Schedule → scenes assigned to this day, shooting order
   - Breakdown → cast, props, costumes, VFX for each scene
   - Locations → address, contact, permits
3. User adjusts: call times, notes, order refinements
4. Export as PDF for distribution to cast/crew

### Dependencies

- Spec 10 (Breakdown) — elements per scene
- Spec 12 (Schedule) — which scenes on which days
- Spec 13 (Locations) — addresses and logistics
- Spec 08 (PDF Export) — OdG must be exportable

---

## Risks

### 1. Scope

15 specs is ambitious for a personal project. Mitigation: each spec produces something visible and usable. The pipeline is designed so you can stop after any spec and still have a useful product.

### 2. AI Quality

Breakdown and storyboard depend on AI output quality. Mitigation: human review loop on every AI-generated element. The AI proposes, the user confirms. Never trust blindly.

### 3. Schema Drift

Database tables for unbuilt features exist in the schema but have never been exercised. Expect migrations when implementing specs 10-15.

### 4. Image Generation Dependency

Storyboard (Spec 14) requires an external image generation service — a new infrastructure dependency with its own costs, rate limits, and quality variance.

### 5. Funding Catalog Freshness

The funding catalog is admin-curated. Stale entries (expired deadlines not updated) erode trust. Mitigation: `lastVerifiedAt` field + UI banner after 60 days without verification + `sourceUrl` always visible. A weekly cron auto-expires records with passed deadlines. Semi-automation from MiC RSS reduces the manual burden for national calls.

### 6. No Deployment Story

Docker Compose for dev exists. No CI/CD, hosting, or production config. Becomes urgent before any real users.

---

## Guiding Principle

**AI-first, funding-second, collaboration-after.** Build the production intelligence that makes Oh Writers unique, surface the funding opportunities that the production data unlocks, then let people collaborate on it. The data moat deepens at every step.
