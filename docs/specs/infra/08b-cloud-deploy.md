# Spec 08b — Cloud Deploy & Environments

Extends Spec 08 (local dev). Covers production hosting, CI/CD, monitoring, and environment strategy.

---

## Architecture Overview

```
                         ┌─────────────────────────────┐
                         │          Fly.io              │
                         │  ┌───────────┐ ┌───────────┐ │
                         │  │    web     │ │ ws-server │ │
                         │  │ (SSR,      │ │ (Hono+Yjs)│ │
                         │  │  scale-to-0│ │ always-on)│ │
                         │  └─────┬─────┘ └─────┬─────┘ │
                         └────────┼─────────────┼───────┘
                                  │             │
                    ┌─────────────┼─────────────┼──────────────┐
                    │             │             │              │
           ┌────────▼──────┐ ┌───▼────────┐  ┌─▼──────────┐  ┌▼──────────────┐
           │   Neon         │ │  Upstash   │  │  Anthropic │  │  OpenRouter    │
           │  PostgreSQL    │ │   Redis    │  │  Claude API│  │  (user BYOK)   │
           │  (serverless)  │ │(serverless)│  │            │  │                │
           └───────────────┘ └────────────┘  └─────────────┘  └────────────────┘
```

### Why This Split

| Component            | Host    | Reason                                                                                                                                                             |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Web app (SSR)**    | Fly.io  | Docker-native, no WebSocket limitation, pay-per-second with scale-to-zero when idle                                                                                |
| **WebSocket server** | Fly.io  | Same provider as web — one dashboard, one `flyctl` auth. Always-on (min 1 machine): WS connections are stateful, scale-to-zero would drop active realtime sessions |
| **PostgreSQL**       | Neon    | Serverless, free tier (0.5GB), branching for preview envs, auto-suspend when idle                                                                                  |
| **Redis**            | Upstash | Serverless, free tier (10K req/day), pay-per-request, no always-on cost                                                                                            |

Render was evaluated and rejected for this stage: flat per-service pricing (~$30/month before a single request) with no free tier that fits a pre-revenue, near-zero-traffic launch. `render.yaml` (superseded) had web+ws-server+Postgres+Redis all on Render — see git history if that config is ever needed again.

### Why Not Netlify

Netlify Functions don't support long-lived WebSocket connections, which `apps/ws-server` requires for Yjs realtime sync. That constraint pushed the original design to split web (Netlify) and ws-server (Fly.io) across two providers. Since Fly.io runs Docker containers natively, there's no reason to keep web on a second provider — both services live on Fly.io now, one `flyctl` account, one billing line for compute.

---

## Environments

No dedicated staging — Neon branching covers preview needs when added (see Preview Environment Flow below; not yet wired into CI).

| Environment    | Web                 | Database                | WS Server                | Purpose           |
| -------------- | ------------------- | ----------------------- | ------------------------ | ----------------- |
| **dev**        | `localhost:3000`    | Docker Postgres (local) | `localhost:1234`         | Local development |
| **production** | `app.ohwriters.com` | Neon main branch        | `ws.ohwriters.com` (Fly) | Live users        |

### Preview Environment Flow (future, not yet implemented)

```
Developer pushes PR
  → GitHub Actions: typecheck + lint + test
  → Fly.io: deploy preview app (fly deploy --app <branch>-oh-writers)
  → Neon: auto-creates DB branch from production (via GitHub integration)
  → PR comment: links to preview + DB branch
```

Not built yet — WIP=1 single-developer workflow doesn't need it today. Revisit when a second contributor joins or external QA needs a shareable preview link.

---

## Fly.io — Web App

### app.config.ts

No Fly-specific Nitro preset is required — Fly runs the Docker image built by `docker/Dockerfile.web` as a plain Node server (`vinxi build` / `vinxi start`), same as local dev.

### fly.web.toml

See `fly.web.toml` at the repo root. Key settings:

- `auto_stop_machines = "stop"`, `min_machines_running = 0` — scales to zero when idle, since HTTP requests are stateless
- Health check on `GET /`
- `shared-cpu-1x` / 512MB

---

## Fly.io — WebSocket Server

The `apps/ws-server` (Hono + Yjs + y-websocket) runs on Fly.io as a long-running process.

### fly.ws-server.toml

See `fly.ws-server.toml` at the repo root. Key settings:

- `auto_stop_machines = "off"`, `min_machines_running = 1` — always-on; Yjs rooms are stateful, a cold stop would drop active realtime sessions
- Health check on `GET /health`
- `shared-cpu-1x` / 512MB

### Scaling

- **Start**: 1 shared-cpu-1x, 512MB, always-on
- **When needed**: scale to 2+ instances with sticky sessions (Yjs rooms are stateful — a room's connections must land on the same machine, or move state coordination to Redis pub/sub, already used for multi-instance in `apps/ws-server`)

---

## Neon — PostgreSQL

### Setup

- **Project**: `ohwriters`
- **Region**: `aws-eu-central-1` (Frankfurt — EU data residency, low latency to Italy)
- **Main branch**: `main` (production)
- **Compute**: Auto-suspend after 5 min idle (free tier), auto-scaling 0.25→2 CU (paid, when traffic justifies it)

### Connection Strings

```
# Pooled (for Fly.io — many short-lived connections under load)
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/ohwriters?sslmode=require&pgbouncer=true

# Direct (for migrations only — needs direct connection for DDL)
DATABASE_URL_DIRECT=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/ohwriters?sslmode=require
```

### Branching Strategy (future, once preview envs are wired)

Neon branches are copy-on-write forks of the database — instant, zero-cost until written.

- **PR opened** → create branch from `main` → seed with test data → set as preview env DB
- **PR merged/closed** → delete branch
- **Migration workflow**: run `pnpm db:migrate` against `DATABASE_URL_DIRECT` in the deploy pipeline

---

## CI/CD — GitHub Actions

### Pipeline

```
push / PR
  ├── typecheck     (parallel)
  ├── lint          (parallel)
  ├── test:unit     (parallel)
  ├── test:e2e      (needs DB — Docker Postgres in CI)
  └── build         (depends on all above)
        └── [main] → flyctl deploy (web + ws-server)
```

### .github/workflows/ci.yml (skeleton)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: oh-writers
          POSTGRES_PASSWORD: oh-writers
          POSTGRES_DB: oh-writers_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
        env:
          DATABASE_URL: postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test
          MOCK_AI: true

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: [check, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.web.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      - run: flyctl deploy --config fly.ws-server.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

---

## Monitoring & Observability

### Sentry (error tracking)

- **Package**: `@sentry/node` (server) + `@sentry/react` (client)
- **Setup**: init in app entry point, wrap `createServerFn` handlers
- **Source maps**: uploaded during build via Sentry Vite plugin
- **Free tier**: 5K errors/month, 1 team member

### Health Checks

```
GET /       → web app health (Fly.io http_service check)
GET /health → ws-server health (Fly.io http_service check)
```

### Logging

- **Dev**: console output
- **Production**: structured JSON logs via `console.log` (Fly.io captures these in `fly logs`)
- **No external logging service initially** — Fly.io has a built-in log viewer
- **When needed**: Axiom or Datadog (both have free tiers)

---

## Database Migrations in Production

Migrations run **before the deploy goes live**, not as part of the running application.

### Strategy

1. GitHub Actions runs `pnpm db:migrate` against `DATABASE_URL_DIRECT` (Neon direct connection) before `flyctl deploy`
2. Only if migrations succeed does the deploy continue
3. Rollback: Neon point-in-time recovery (restore to timestamp before migration)

### Destructive Migration Safety

- Never drop a column in the same deploy that stops using it
- Step 1: deploy code that stops using the column
- Step 2: deploy migration that drops the column
- This two-step approach prevents downtime during deploy overlap

---

## Secrets Management

| Where      | Tool                        | Scope             |
| ---------- | --------------------------- | ----------------- |
| Local dev  | `.env` file (git-ignored)   | Developer machine |
| Production | `fly secrets set` (per app) | Per-service       |
| CI         | GitHub Actions secrets      | Pipeline          |

### Rotation

- `BETTER_AUTH_SECRET`: rotate quarterly, invalidates all sessions
- `ANTHROPIC_API_KEY`: rotate on suspected exposure (deliberately absent from prod until AI surfaces are enabled — see cost notes below)
- `WS_INTERNAL_SECRET`: rotate with coordinated deploy (web + ws-server both need the same value)
- `DATABASE_URL`: managed by Neon, rotate via Neon dashboard

---

## Custom Domain

```
app.ohwriters.com     → Fly.io (web app)
ws.ohwriters.com      → Fly.io (ws-server)
```

DNS via Cloudflare or the registrar's own DNS. SSL is automatic on Fly.io (`force_https = true`).

Domain purchase itself: `ohwriters.com` and `ohwriters.it` were confirmed available (checked 2026-09-04) but not yet purchased — separate decision from this spec.

---

## Cost Estimate

### Early stage (pre-revenue, near-zero traffic) — verified 2026-09-04

| Service            | Plan                              | Cost/month      |
| ------------------ | --------------------------------- | --------------- |
| Fly.io — web       | Pay-per-second, scale-to-zero     | ~$0-3           |
| Fly.io — ws-server | Pay-per-second, always-on (min 1) | ~$3.19          |
| Neon               | Free (0.5 GB, auto-suspend)       | $0              |
| Upstash Redis      | Free (10K req/day)                | $0              |
| Sentry             | Free (5K errors)                  | $0              |
| Domain             | .com registration                 | ~$1             |
| **Total**          |                                   | **~$4-7/month** |

Fly.io no longer has a free tier for new accounts (removed October 2024) — every VM is billed per second from the start. The low total above comes from scale-to-zero on the web service and the two databases staying on their own free tiers, not from Fly.io itself being free.

Render was estimated at ~$30/month for the equivalent footprint (web $7 + ws-server $7 + Postgres 256mb $6 + Redis $10) — no free tier fits a near-zero-traffic launch, so it was rejected for this stage. Revisit if the multi-provider setup (Fly.io + Neon + Upstash) becomes an operational burden that outweighs the ~$25/month saved.

### Growth stage (paying customers, < 1000 users)

| Service       | Plan                                            | Cost/month        |
| ------------- | ----------------------------------------------- | ----------------- |
| Fly.io        | Pay-per-use                                     | $15-40            |
| Neon          | Launch ($19)                                    | $19               |
| Upstash Redis | Pay-per-use                                     | $5-15             |
| Sentry        | Team ($26)                                      | $26               |
| AI (BYOK)     | User's own OpenRouter account, not billed to us | $0                |
| **Total**     |                                                 | **$65-100/month** |

AI inference is not a platform cost at any stage: the product ships BYOK (users connect their own OpenRouter account). The only platform-side AI spend is a small, capped trial quota per new user (~€1) and any ambient/background flows not yet migrated to BYOK — see `project_ai_cost_gateway` history for what's still platform-keyed.

---

## What This Spec Does NOT Cover

- Multi-tenancy and dedicated instances → Spec 16 (note: a single Fly.io app per environment doesn't map cleanly to Spec 16's per-customer dedicated instance model — that will need its own provisioning script, not a Blueprint-style single config)
- Billing and subscription management → Spec 16
- CDN for media/uploads (PDF, storyboard images) → future spec when needed
- Horizontal scaling beyond single instances → future, when traffic demands it
- Preview-per-PR environments → not built; revisit when a second contributor joins

---

## Implementation Order

1. `fly launch --config fly.web.toml` and `fly launch --config fly.ws-server.toml` (creates the two Fly apps)
2. Create Neon project and connect (`DATABASE_URL`, `DATABASE_URL_DIRECT`)
3. Create Upstash Redis and connect (`REDIS_URL`)
4. `fly secrets set` for `BETTER_AUTH_SECRET`, `WS_INTERNAL_SECRET`, `DATABASE_URL`, `REDIS_URL` on both apps
5. First deploy: web app only, verify `/` health check
6. Deploy ws-server, verify `/health` and a live Yjs round-trip
7. Set up GitHub Actions CI pipeline (deploy job above)
8. Add Sentry integration
9. Point `app.ohwriters.com` / `ws.ohwriters.com` DNS at the two Fly apps
