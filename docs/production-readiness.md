# Production readiness — Oh Writers

This is the living gap analysis for taking Oh Writers from localhost to a real,
deployed instance (staging + prod). It is the source of truth behind the linked
GitHub issues. Keep this file in sync with those issues: when an item ships,
mark it below.

Mapped to the MVP roadmap item **infra/08 — Infrastructure / 08b — Cloud deploy**.

## Current state

A production `Dockerfile` (`docker/Dockerfile`, multi-stage) and
`docker/docker-compose.yml` exist and both `web` + `ws-server` targets build
and run (verified locally: both containers start and answer their health
checks). What is missing is the operational hardening required to run a live
system.

## Blockers (must-fix to run a real instance)

| #   | Gap                                                                                                                                                                                                        | Issue |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | **Migrations on deploy** — `docker-compose.yml` never runs `drizzle-kit migrate`; on first boot the DB is empty. Need a migration job/entrypoint before `web`/`ws-server` start.                           | #125  |
| 2   | ~~**`ws-server` has no deploy target**~~ — DONE. `tsup` now compiles it to `dist/`; the Docker `ws-server` target builds and serves a working image (verified: `/health` responds).                        | #125  |
| 3   | **No TLS / reverse proxy** — `web:3000` and `ws-server:1234` are published raw. Need a proxy (Caddy/Traefik/nginx) for HTTPS + WebSocket upgrade, otherwise auth cookies and Yjs sync travel in plaintext. | #125  |
| 4   | **Hand-managed secrets** — `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD` need a real secret store (Docker secrets / Vault / platform env), not `.env`.                                    | #125  |

## Reliability & operations

| #   | Gap                                                                                                                                     | Issue |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 5   | **Backups & PITR** — `db:backup` is dev-only; prod needs scheduled Postgres backup (+ a tested restore) and a Redis persistence policy. | #126  |
| 6   | **Observability / monitoring** — Langfuse is opt-in and dev-only; no Prometheus metrics integration or alerting.                        | #126  |
| 7   | **Error tracking / log aggregation** — structured Pino logs exist but nothing collects them centrally (no Sentry / OTel exporter).      | #126  |

## Product / platform

| #   | Gap                                                                                                                                                                                                                                                             | Issue |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 8   | **Email / SMTP** — Better Auth password reset, invites, and notifications need a mailer; not configured in compose.                                                                                                                                             | #127  |
| 9   | **Object storage** — location attachment uploads have no blob store (S3 / GCS / MinIO) in prod.                                                                                                                                                                 | #128  |
| 10  | **Rate limiting / AI-cost protection** — cost-smoke scripts exist but there is no per-user/service quota in prod (Anthropic spend). Related to #104.                                                                                                            | #129  |
| 11  | **Other systems in-repo have no deploy/auth story** — `landing` (Netlify — fine), `admin-contacts`, and the future mobile companion (the reason shared packages are framework-agnostic). Billing/i18n are already tracked on the roadmap (`core/16`, post-MVP). | #130  |

## Suggested order

1. Migrations on boot (#125)
2. TLS / reverse proxy (#125)
3. `ws-server` compiled + socket-secure (#125)
4. Backups / PITR (#126)
5. Secrets store (#125)
6. Monitoring, alerting, error tracking (#126)
7. Billing / monitoring hardening as you reach the pilot

## Definition of done (per item)

- Runs on an empty host via `docker compose -f docker/docker-compose.yml up --build` with no manual setup.
- CI + `fleet:check` green.
- A Playwright / manual gate confirms the touched surface still works.
