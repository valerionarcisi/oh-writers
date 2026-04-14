# Spec 08b — Cloud Deploy & Environments

Extends Spec 08 (local dev). Covers production hosting, CI/CD, monitoring, and environment strategy.

---

## Architecture Overview

```
                         ┌─────────────────────────────┐
                         │        Netlify CDN           │
                         │   (static + edge functions)  │
                         └──────────┬──────────────────┘
                                    │
                         ┌──────────▼──────────────────┐
                         │     Netlify Functions        │
                         │  (TanStack Start SSR)        │
                         │  Nitro preset: netlify       │
                         └──────────┬──────────────────┘
                                    │
                    ┌───────────────┼───────────────────┐
                    │               │                   │
           ┌────────▼──────┐ ┌─────▼──────┐  ┌────────▼────────┐
           │   Neon         │ │  Fly.io    │  │   Anthropic     │
           │  PostgreSQL    │ │  ws-server │  │   Claude API    │
           │  (serverless)  │ │  (Hono+Yjs)│  │                 │
           └───────────────┘ └────────────┘  └─────────────────┘
```

### Why This Split

| Component            | Host    | Reason                                                                                           |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| **Web app (SSR)**    | Netlify | Preview deploys per PR, CDN, zero-config SSL, Nitro preset                                       |
| **WebSocket server** | Fly.io  | Persistent connections required (Yjs), Netlify doesn't support WebSocket                         |
| **PostgreSQL**       | Neon    | Serverless (fits Netlify Functions), branching for preview envs, auto-backup, connection pooling |
| **Redis**            | Upstash | Serverless Redis, pay-per-request, no always-on cost. Used for rate limiting and session cache   |

---

## Environments

Three environments. No dedicated staging — preview deploys replace it.

| Environment    | Web                              | Database                   | WS Server               | Purpose                      |
| -------------- | -------------------------------- | -------------------------- | ----------------------- | ---------------------------- |
| **dev**        | `localhost:3000`                 | Docker Postgres (local)    | `localhost:1234`        | Local development            |
| **preview**    | `<branch>.ohwriters.netlify.app` | Neon branch (auto-created) | Shared dev Fly instance | PR review, design review, QA |
| **production** | `app.ohwriters.com`              | Neon main branch           | Dedicated Fly instance  | Live customers               |

### Preview Environment Flow

```
Developer pushes PR
  → GitHub Actions: typecheck + lint + test
  → Netlify: auto-deploys preview at <branch>.ohwriters.netlify.app
  → Neon: auto-creates DB branch from production (via GitHub integration)
  → PR comment: links to preview + DB branch
```

Preview databases are **read-write copies** of production schema with seed data. They auto-delete when the PR is merged or closed.

---

## Netlify Configuration

### app.config.ts

```typescript
import { defineConfig } from "@tanstack/start/config";

export default defineConfig({
  server: {
    preset: "netlify",
  },
  // ... existing vite config
});
```

### netlify.toml

```toml
[build]
  command = "pnpm build"
  publish = ".output/public"
  functions = ".output/server"

[build.environment]
  NODE_VERSION = "22"
  PNPM_VERSION = "10"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

### Environment Variables (Netlify UI)

```
DATABASE_URL          # Neon connection string (pooled)
DATABASE_URL_DIRECT   # Neon direct connection (for migrations)
BETTER_AUTH_SECRET
BETTER_AUTH_URL       # https://app.ohwriters.com (prod) or preview URL
ANTHROPIC_API_KEY
WS_URL                # wss://ws.ohwriters.com (prod Fly instance)
WS_SECRET
SENTRY_DSN
```

---

## Fly.io — WebSocket Server

The `apps/ws-server` (Hono + Yjs + y-websocket) runs on Fly.io as a long-running process.

### Dockerfile (apps/ws-server/Dockerfile)

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ws-server/package.json apps/ws-server/
COPY packages/domain/package.json packages/domain/
COPY packages/utils/package.json packages/utils/
RUN corepack enable && pnpm install --frozen-lockfile --prod

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/ws-server/node_modules ./apps/ws-server/node_modules
COPY apps/ws-server/ ./apps/ws-server/
COPY packages/domain/ ./packages/domain/
COPY packages/utils/ ./packages/utils/

EXPOSE 1234
CMD ["node", "apps/ws-server/dist/index.js"]
```

### fly.toml

```toml
app = "ohwriters-ws"
primary_region = "cdg"  # Paris — closest to Italian users

[build]

[http_service]
  internal_port = 1234
  force_https = true

[checks]
  [checks.health]
    port = 1234
    type = "http"
    interval = "30s"
    timeout = "5s"
    path = "/health"
```

### Scaling

- **Start**: 1 shared-cpu-1x, 256MB (Fly free tier)
- **When needed**: scale to 2+ instances with sticky sessions (Yjs rooms are stateful)
- Fly supports auto-stop (scale to zero when idle) for dev costs

---

## Neon — PostgreSQL

### Setup

- **Project**: `ohwriters`
- **Region**: `aws-eu-central-1` (Frankfurt — EU data residency, low latency to Italy)
- **Main branch**: `main` (production)
- **Compute**: Auto-suspend after 5 min idle (free tier), auto-scaling 0.25→2 CU (paid)

### Connection Strings

```
# Pooled (for Netlify Functions — serverless, many short-lived connections)
DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/ohwriters?sslmode=require&pgbouncer=true

# Direct (for migrations only — needs direct connection for DDL)
DATABASE_URL_DIRECT=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/ohwriters?sslmode=require
```

### Branching Strategy

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
  ├── test:e2e      (needs DB — uses Neon branch or Docker)
  └── build         (depends on all above)
        ├── [PR] → Netlify preview deploy (automatic)
        └── [main] → Netlify production deploy (automatic)
                   → Fly.io ws-server deploy (via fly deploy)
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

  deploy-ws:
    if: github.ref == 'refs/heads/main'
    needs: [check, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config apps/ws-server/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Netlify deploys are handled by Netlify's own GitHub integration (not in this workflow).

---

## Monitoring & Observability

### Sentry (error tracking)

- **Package**: `@sentry/node` (server) + `@sentry/react` (client)
- **Setup**: init in app entry point, wrap `createServerFn` handlers
- **Source maps**: uploaded during build via Sentry Vite plugin
- **Free tier**: 5K errors/month, 1 team member

### Health Checks

```
GET /health          → web app health (DB connectivity, Redis ping)
GET /health          → ws-server health (on Fly.io, separate endpoint)
```

Netlify Functions don't have persistent health checks — rely on Sentry for error alerting.

### Logging

- **Dev**: console output
- **Production**: structured JSON logs via `console.log` (Netlify captures these in function logs)
- **No external logging service initially** — Netlify and Fly.io both have built-in log viewers
- **When needed**: Axiom or Datadog (both have free tiers and Netlify/Fly integrations)

---

## Database Migrations in Production

Migrations run **before the deploy goes live**, not as part of the running application.

### Strategy

1. GitHub Actions runs `pnpm db:migrate` against `DATABASE_URL_DIRECT` (Neon direct connection)
2. Only if migrations succeed does the deploy continue
3. Rollback: Neon point-in-time recovery (restore to timestamp before migration)

### Destructive Migration Safety

- Never drop a column in the same deploy that stops using it
- Step 1: deploy code that stops using the column
- Step 2: deploy migration that drops the column
- This two-step approach prevents downtime during deploy overlap

---

## Secrets Management

| Where      | Tool                              | Scope             |
| ---------- | --------------------------------- | ----------------- |
| Local dev  | `.env` file (git-ignored)         | Developer machine |
| Preview    | Netlify env vars (auto-injected)  | Per-deploy        |
| Production | Netlify env vars + Fly.io secrets | Per-service       |
| CI         | GitHub Actions secrets            | Pipeline          |

### Rotation

- `BETTER_AUTH_SECRET`: rotate quarterly, invalidates all sessions
- `ANTHROPIC_API_KEY`: rotate on suspected exposure
- `WS_SECRET`: rotate with coordinated deploy (web + ws-server)
- `DATABASE_URL`: managed by Neon, rotate via Neon dashboard

---

## Custom Domain

```
app.ohwriters.com     → Netlify (web app)
ws.ohwriters.com      → Fly.io (WebSocket server)
```

DNS via Netlify DNS or external provider (Cloudflare). SSL is automatic on both Netlify and Fly.io.

---

## Cost Estimate

### Early stage (pre-revenue, < 100 users)

| Service       | Plan                        | Cost/month      |
| ------------- | --------------------------- | --------------- |
| Netlify       | Free / Pro ($19)            | $0-19           |
| Fly.io        | Free tier (3 shared VMs)    | $0              |
| Neon          | Free (0.5 GB, auto-suspend) | $0              |
| Sentry        | Free (5K errors)            | $0              |
| Upstash Redis | Free (10K req/day)          | $0              |
| Domain        | .com registration           | ~$1             |
| **Total**     |                             | **$0-20/month** |

### Growth stage (paying customers, < 1000 users)

| Service       | Plan         | Cost/month        |
| ------------- | ------------ | ----------------- |
| Netlify       | Pro          | $19               |
| Fly.io        | Pay-per-use  | $5-15             |
| Neon          | Launch ($19) | $19               |
| Sentry        | Team ($26)   | $26               |
| Upstash Redis | Pay-per-use  | $5                |
| Anthropic API | Pay-per-use  | $20-100           |
| **Total**     |              | **$95-185/month** |

---

## What This Spec Does NOT Cover

- Multi-tenancy and dedicated instances → Spec 16
- Billing and subscription management → Spec 16
- CDN for media/uploads (PDF, storyboard images) → future spec when needed
- Horizontal scaling beyond single instances → future, when traffic demands it

---

## Implementation Order

1. Add `netlify.toml` and set `preset: "netlify"` in `app.config.ts`
2. Create Neon project and connect
3. First deploy to Netlify (web app only, no WS)
4. Set up GitHub Actions CI pipeline
5. Add Sentry integration
6. Deploy ws-server to Fly.io (when Spec 09 — WebSocket is implemented)
