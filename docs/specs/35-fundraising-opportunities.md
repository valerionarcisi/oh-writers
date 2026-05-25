# Spec 35 — Fundraising Opportunities (RSS ingestion + Cesare classification)

## Goal

Curated inbox of fundraising opportunities (grants, bandi, calls, residencies, festivals) for IT screenwriters/directors. Ingested automatically from RSS feeds, classified and structured by Cesare, surfaced per-project with deadline tracking.

Anchor source: **Collettivo Incendio Substack** (`collettivoincendio.substack.com/feed`). Multi-source from v1, user-extensible.

## Why

- Italian indie filmmakers waste hours hunting bandi across scattered sources (Substack, IG, MiC site, regional film commissions).
- Deadlines slip, eligibility unclear, requirements buried in long-form posts.
- Oh Writers already has project context (genre, format, budget tier) → can match opportunities to project automatically.

## Non-goals

- No Instagram/social scraping (ToS + GDPR risk). Manual paste path covered separately in spec 36 (future).
- No payment/application submission. Surface + link out only.
- No multi-language v1 (IT sources only).

---

## Domain model

### `fundraising_sources`

| col                        | type                 | notes                                           |
| -------------------------- | -------------------- | ----------------------------------------------- |
| `id`                       | uuid pk              |                                                 |
| `name`                     | text                 | "Collettivo Incendio"                           |
| `feed_url`                 | text                 | RSS/Atom URL                                    |
| `kind`                     | enum                 | `substack` `wordpress` `generic_rss` `atom`     |
| `language`                 | text                 | `it` default                                    |
| `is_curated`               | boolean              | true = added by Oh Writers, false = user custom |
| `team_id`                  | uuid fk nullable     | null = global curated, set = user-private       |
| `last_fetched_at`          | timestamptz nullable |                                                 |
| `last_error`               | text nullable        |                                                 |
| `etag`, `last_modified`    | text nullable        | HTTP cache headers                              |
| `created_at`, `updated_at` | timestamptz          |                                                 |

### `fundraising_items`

Raw RSS entries, before classification.

| col                        | type        | notes                    |
| -------------------------- | ----------- | ------------------------ |
| `id`                       | uuid pk     |                          |
| `source_id`                | uuid fk     |                          |
| `guid`                     | text        | RSS `<guid>` — dedup key |
| `url`                      | text        | permalink                |
| `title`                    | text        |                          |
| `published_at`             | timestamptz |                          |
| `raw_html`                 | text        | full content             |
| `raw_text`                 | text        | stripped, for Cesare     |
| `fetched_at`               | timestamptz |                          |
| unique `(source_id, guid)` |             |                          |

### `fundraising_opportunities`

Cesare-classified structured output.

| col                        | type                 | notes                                                                                         |
| -------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `id`                       | uuid pk              |                                                                                               |
| `item_id`                  | uuid fk unique       | one opportunity per item (v1)                                                                 |
| `kind`                     | enum                 | `bando_pubblico` `call_festival` `residenza` `grant_privato` `workshop` `pitch_forum` `other` |
| `title`                    | text                 | clean title                                                                                   |
| `summary`                  | text                 | 2-3 sentences                                                                                 |
| `organization`             | text nullable        | issuing body                                                                                  |
| `deadline_at`              | timestamptz nullable | parsed deadline                                                                               |
| `deadline_text`            | text nullable        | original string ("entro il 30 settembre")                                                     |
| `amount_min`, `amount_max` | numeric nullable     | EUR                                                                                           |
| `amount_text`              | text nullable        | original ("fino a 50.000€")                                                                   |
| `eligibility`              | jsonb                | `{ formats: ["feature","short"], genres: [...], regions: [...], career_stage: [...] }`        |
| `requirements`             | text nullable        | what to submit                                                                                |
| `link`                     | text                 | apply URL (may differ from `item.url`)                                                        |
| `status`                   | enum                 | `active` `expired` `unknown`                                                                  |
| `confidence`               | numeric              | 0-1, Cesare self-rated                                                                        |
| `classified_at`            | timestamptz          |                                                                                               |

### `fundraising_saves`

User-saved/dismissed per project.

| col                                   | type          | notes                         |
| ------------------------------------- | ------------- | ----------------------------- |
| `id`                                  | uuid pk       |                               |
| `opportunity_id`                      | uuid fk       |                               |
| `project_id`                          | uuid fk       |                               |
| `user_id`                             | uuid fk       |                               |
| `state`                               | enum          | `saved` `dismissed` `applied` |
| `notes`                               | text nullable |                               |
| `created_at`, `updated_at`            | timestamptz   |                               |
| unique `(opportunity_id, project_id)` |               |                               |

---

## RSS ingestion pipeline

### Library choice

`rss-parser` (npm, 2M+ DL/week, maintained). Handles Substack/Atom/RSS2 transparently. Pin version.

### Backfill (one-shot per source)

Substack `/feed` returns ~20 most-recent posts. Full archive via `?limit=N` not officially supported but `https://<sub>.substack.com/api/v1/archive?sort=new&limit=50&offset=N` returns paginated archive JSON.

Two-phase backfill for Substack:

1. **Archive scan** — paginate `/api/v1/archive` until empty. Extract slugs.
2. **Per-post fetch** — for each slug, hit `/feed?slug=<slug>` or `/p/<slug>` HTML, store as item.

For generic RSS (non-Substack), one-shot fetch of `/feed` is best-effort. If archive needed, document gap.

### Daily cron

- Schedule: `0 6 * * *` Europe/Rome (06:00 local).
- For each `fundraising_sources` row: fetch with `If-None-Match` / `If-Modified-Since` headers. 304 → skip.
- New items → insert into `fundraising_items` (dedup on `guid`).
- Mark `last_fetched_at`. Errors → `last_error`, never block other sources.

Cron runner: TanStack Start scheduled tasks via Node cron (`node-cron`) inside server. If hosting needs external trigger, expose `POST /api/cron/fundraising-ingest` protected by `CRON_SECRET`.

### Classification (Cesare)

After ingestion, fan-out queue: each new item → Cesare classification job.

Prompt (sketch):

```
You are Cesare. Classify this Italian fundraising post.
Input: title + raw_text.
Output JSON matching FundraisingOpportunitySchema.
If post is NOT about a fundraising opportunity (editorial, interview, news), return {kind: "other", confidence: 0}.
Extract: deadline (ISO), amount range (EUR), eligibility (formats/genres/regions/career_stage), requirements.
```

Use Anthropic structured output (tool-use forcing JSON). Cache classifications per `item_id`.

`status` derivation:

- `deadline_at < now` → `expired`
- `confidence < 0.5` → `unknown`
- else → `active`

---

## API surface

All via `createServerFn`, in `features/fundraising/`.

### Queries

- `listOpportunities({ projectId, filters: { kind?, status?, deadlineBefore?, region? } })` — paginated, joined with `fundraising_saves` for current user.
- `getOpportunity({ id })`
- `listSources({ teamId })` — curated globals + team-custom.

### Mutations

- `addCustomSource({ teamId, feedUrl, name })` — validates RSS by test-fetching first.
- `removeCustomSource({ sourceId })`
- `saveOpportunity({ opportunityId, projectId, state, notes? })`
- `triggerIngest({ sourceId })` — manual re-fetch, throttled 1/min per source.
- `reclassifyOpportunity({ itemId })` — admin/debug.

### Cron endpoint

- `POST /api/cron/fundraising-ingest` — header `x-cron-secret: $CRON_SECRET`. Iterates sources, queues classification.

All write paths via `withProjectAccess` where project-scoped; team-scoped sources use team membership check.

---

## UI

### Entry point

Sidebar item under project: **Opportunità** (badge with active count matching project genre/format).

### Page `/projects/$id/opportunities`

Layout: filter rail (left) + list (center) + detail drawer (right, opens on click).

Filters:

- Kind (multi-select)
- Status (active default, toggle expired)
- Deadline (next 30d / 90d / any)
- Match score with current project (toggle: show only matches)

List card:

- Title + organization
- Deadline countdown (`tra 12 giorni` / `scaduto`)
- Amount range
- Kind badge
- Source attribution ("via Collettivo Incendio")
- Save/dismiss/applied buttons

Detail drawer:

- Full `summary` + `requirements`
- "Apri sul sito" → `link`
- "Chiedi a Cesare" → opens Cesare with opportunity + project preloaded ("È adatto al mio progetto?")
- Notes field

### Settings page `/team/$id/fundraising-sources`

CRUD custom RSS feeds. Test-feed button before save.

---

## Cesare integration

Per spec 34 (Cesare agentic everywhere), opportunities page exposes tools:

- `find_matching_opportunities(project_id)` — return ranked list.
- `compare_opportunity_to_project(opportunity_id, project_id)` — eligibility check.
- `save_opportunity(opportunity_id, state)` — Cesare can save on user behalf with confirmation.

RAG context (spec 32) includes saved opportunities of project.

---

## Mock mode

`MOCK_AI=true`:

- RSS fetch hits local fixtures in `apps/web/app/features/fundraising/_mocks/collettivo-incendio.rss.xml` + others.
- Cesare classification returns scripted JSON keyed by item title regex (per `cesare-tool-loop.mock.ts` pattern).
- Cron endpoint callable in tests via `triggerIngest` helper.

---

## Initial curated sources (seed)

Seed `fundraising_sources` with `is_curated=true`:

1. **Collettivo Incendio** — `https://collettivoincendio.substack.com/feed` (anchor)
2. **MiC – Bandi DGCA** — verify RSS exists, else fallback to scraping landing
3. **Lazio Innova / Lazio Cinema** — feed RSS sito ufficiale
4. **Film Commission Torino Piemonte** — news feed
5. **Lombardia Film Commission** — news feed
6. **Apulia Film Commission** — news feed
7. **Biennale College Cinema** — RSS o newsletter archive
8. **Sentieri Selvaggi** — RSS (editoriale, low signal but covers calls)
9. **FilmTV.press** — RSS bandi
10. **Premio Solinas** — RSS o page-monitor fallback

Seed file: `packages/db/src/seeds/fundraising-sources.ts`. Idempotent.

---

## Implementation phases

### Phase 1 — schema + ingestion (3-4 days)

- Migration: 4 new tables
- `rss-parser` integration
- Substack archive backfill script
- Daily cron + manual trigger endpoint
- Curated source seed
- Unit tests for parser + dedup

### Phase 2 — Cesare classification (2-3 days)

- Anthropic structured-output classifier
- Background job (in-process queue or DB-polled worker)
- Confidence + status derivation
- Mock-mode fixtures

### Phase 3 — UI (3-4 days)

- Opportunities page (list + filters + drawer)
- Save/dismiss/applied flow
- Custom sources settings
- Cesare tools (spec 34 extension)

### Phase 4 — backfill Collettivo Incendio (1 day)

- Run archive script in prod
- Reclassify all items
- QA: spot-check 20 random items for classification accuracy

---

## Risks

- **Substack archive API undocumented** → may break. Mitigation: HTML scrape `/archive` page as fallback (lecito, public page).
- **Cesare false positives** (editorial posts classified as opportunity) → `confidence` field + manual dismiss; tune prompt with real examples in phase 4.
- **Deadline parsing IT** ("entro il 30 settembre 2026", "fino a esaurimento fondi") → store both parsed + original text; never hide opportunity if parse fails (status=unknown).
- **GDPR**: RSS content is public, no personal data ingested. Document in privacy notice.

---

## Tests

E2E tags `OHW-350` → `OHW-359`.

| Tag     | Scenario                                  | File                                     |
| ------- | ----------------------------------------- | ---------------------------------------- |
| OHW-350 | RSS ingest happy path (Substack fixture)  | `tests/fundraising-ingest.spec.ts`       |
| OHW-351 | Dedup on re-fetch (same guid)             | same                                     |
| OHW-352 | 304 Not Modified short-circuit            | same                                     |
| OHW-353 | Cesare classification → opportunity row   | `tests/fundraising-classify.spec.ts`     |
| OHW-354 | Non-opportunity post → kind=other, hidden | same                                     |
| OHW-355 | Expired deadline → status=expired filter  | `tests/fundraising-ui.spec.ts`           |
| OHW-356 | Save/dismiss/applied state per project    | same                                     |
| OHW-357 | Custom RSS source CRUD + validation       | `tests/fundraising-sources.spec.ts`      |
| OHW-358 | Cron endpoint secret enforcement          | unit                                     |
| OHW-359 | Cesare tool `find_matching_opportunities` | `tests/cesare-fundraising-tools.spec.ts` |

Unit tests (vitest):

- RSS parser edge cases (missing pubDate, malformed CDATA)
- Italian deadline parser (`entro il N mese YYYY`, `30/09/2026`, `30-09-26`)
- Amount parser (`€50.000`, `50mila`, `fino a 100k`)
- Status derivation
