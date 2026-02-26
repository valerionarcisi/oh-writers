# Spec 08 — Infrastructure & DevOps

## Docker Compose

- **Dev**: only `postgres:16-alpine` + `redis:7-alpine` containerized; app and ws-server run locally with hot reload
- **Prod**: postgres, redis, app (port 3000), ws-server (port 1234) all containerized

## Environment Variables

```bash
DATABASE_URL=postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_dev
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ANTHROPIC_API_KEY=
WS_PORT=1234
WS_SECRET=              # shared secret between web app and ws-server for token validation
MOCK_API=false
MOCK_AI=false
```

## Scripts

```bash
pnpm db:migrate           # apply pending migrations
pnpm db:migrate:create    # create new migration
pnpm db:migrate:status    # migration status
pnpm db:migrate:rollback  # rollback last migration
pnpm db:seed              # full dev seed
pnpm db:seed:reset        # drop + recreate + seed
pnpm db:seed:minimal      # essential data only
pnpm release              # bump patch, changelog, git tag
pnpm release:minor
pnpm release:major
pnpm release:dry-run
```

## Seed Data

- admin@oh-writers.dev / password123
- marco@oh-writers.dev / password123
- giulia@oh-writers.dev / password123
- Team "Brutalist Studio" with all 3 members
- Project "The Weight of Emptiness" (feature drama) — complete with ~20 scenes
- Project "Candy" (short drama) — partial
- Versions and mock AI predictions for the first project

## Mock Mode

- `MOCK_API=true` → MSW intercepts tRPC, in-memory data, no DB/Redis
- `MOCK_AI=true` → AI responses from mock file, no Anthropic API

## Health Check

```
GET /health → { status: 'ok', db: 'ok', redis: 'ok', ws: 'ok', version: '1.0.0' }
```

## Development Commands

```bash
pnpm install && cp .env.example .env
docker-compose -f docker-compose.dev.yml up -d
pnpm db:migrate && pnpm db:seed
pnpm dev          # starts web + ws-server in parallel
pnpm typecheck
pnpm lint
pnpm test         # Playwright only
pnpm test:ui      # Playwright with UI mode
pnpm db:studio    # Drizzle Studio GUI
```

## CI/CD (GitHub Actions — future)

- on: push, pull_request
- jobs: typecheck, lint, test (Playwright), build, docker build
