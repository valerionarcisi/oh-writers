# Spec 08c — Deploy Setup Log

Working log for the actual production setup (domain, Fly.io, Neon, Upstash).
Companion to [Spec 08b](./08b-cloud-deploy.md), which documents the target
architecture — this file tracks what has actually been done, with the real
names/IDs, so a session can resume without re-deriving state.

Update this file as each step completes. Do not put secrets here — only
references to where they live (Fly secrets, password manager, etc).

---

## GitHub branch protection

`main` and `beta` both require 6 QA jobs green before merge: Typecheck,
Lint, Guardrails, Unit (Vitest), E2E (Mock, Playwright), Production build.
No force-push, no branch deletion.

**Migrated from classic branch protection to repository rulesets** on
2026-09-04, same day it was first set up — the classic API has no bypass
mechanism, and `release.yml`'s bump-commit push (via `@semantic-release/git`)
was rejected every run with "failed to push some refs" even though the
job declared `permissions: contents: write`. Root cause: **the default
`GITHUB_TOKEN` can never push to a protected branch, full stop** — that's a
GitHub-side limit, not something a workflow's `permissions:` block can lift
(confirmed against community discussions on this exact semantic-release +
protected-branch combination). A ruleset with a `RepositoryRole` (Admin,
`actor_id: 5`) bypass actor does not help either — that bypasses for human
admins, not for a bot token.

**Fix**: `RELEASE_TOKEN`, a fine-grained PAT (repo-scoped to `oh-writers`,
Contents/Issues/Pull-requests read-write, 1-year expiry), saved as a repo
secret. `release.yml`'s checkout step and the `semantic-release` run both
use it instead of `secrets.GITHUB_TOKEN` — it authenticates as the repo
owner, which the ruleset's `RepositoryRole: Admin` bypass actor does cover.
**Rotate `RELEASE_TOKEN` before 2027-09-04** (or whenever the PAT expires)
or the release workflow will start failing the same way again.

Rulesets created via `gh api repos/.../rulesets` (classic
`branches/{main,beta}/protection` deleted first — one system, not two kept
in sync by hand).

**`E2E (Full, Playwright chromium)` deliberately excluded** from required
checks — it runs as a 4-way build matrix (`strategy.matrix.shard: [1,2,3,4]`
in `qa.yml`), so it produces 4 differently-named checks
(`... chromium (1)`, `(2)`, etc.), never one named exactly `E2E (Full,
Playwright chromium)`. Requiring that literal name would block every merge
forever waiting on a check that can never report with that name. It still
runs on every push/PR — just not a merge gate. Revisit if the shard count
ever needs to be a hard gate (list all 4 shard names explicitly, and update
this list whenever the shard count changes).

---

## Domain

- **Registered**: `ohwriters.com` on Namecheap, 2026-09-04 (order 213122647)
- **WHOIS privacy**: enabled (free, "WithheldforPrivacy")
- **`.it` defensive registration**: not purchased — was available at check time (2026-09-04), revisit if desired
- **DNS**: moved to Cloudflare (Free plan)
  - Nameservers set on Namecheap: `mario.ns.cloudflare.com`, `natasha.ns.cloudflare.com`
  - Status as of 2026-09-04: **active** — nameservers propagated same day
  - Cloudflare zone: `ohwriters.com`, Account ID `748ddfccb401b86ce89f7e77ead3a00a`
  - AI Crawl Control: Search=Allow, Agent=Allow, Training=Block on pages with ads, robots.txt block=on
- **DNS records** (all CNAME, Proxy status = DNS only — proxied would break the
  WebSocket persistent connection and interfere with Fly's own TLS):
  - `app.ohwriters.com` → `oh-writers-web.fly.dev`
  - `ws.ohwriters.com` → `oh-writers-ws-server.fly.dev`
  - `beta.ohwriters.com` → `oh-writers-web-beta.fly.dev`
  - `ws-beta.ohwriters.com` → `oh-writers-ws-server-beta.fly.dev`

## Beta (staging) environment

- **Purpose**: gate between a feature branch and production — PRs land on
  `beta` first, get a real deployed environment + E2E run, then a second
  PR (`beta`→`main`) promotes to prod. See the branch/release strategy
  discussion in the session that created this environment.
- **Fly apps**: `oh-writers-web-beta` (`fly.web.beta.toml`),
  `oh-writers-ws-server-beta` (`fly.ws-server.beta.toml`) — same
  shared-cpu-1x/512mb as prod, both scale to zero when idle (beta doesn't
  hold real user realtime sessions, unlike prod's ws-server)
- **Neon**: `beta` branch off `production` (copy-on-write — includes real
  prod data as of branch-creation time, not anonymized; keep that in mind if
  `beta` is ever used for public demos or destructive test runs)
- **Upstash**: separate database `ohwriters_redis_beta` (Upstash free tier
  is 1 free database per account — a payment method was added to create a
  second one; each DB still gets its own free-tier quota independently)
- **Secrets**: set via `scripts/fly-secrets-set-beta.sh` — same shape as
  prod's script, points `BETTER_AUTH_URL`/`WS_URL` at the beta domains,
  reuses the same Resend API key (no need for a second one for staging email)
- **Found and fixed while wiring this up**: `VITE_WS_URL` (Vite/Vinxi
  build-time env var, baked into the client bundle) was never passed to
  `docker build` — every deploy, prod included, would have silently shipped
  with realtime collaboration disabled (`isRealtimeEnabled()` always false).
  Fixed: `docker/Dockerfile.web` now takes `ARG VITE_WS_URL`, each
  `fly.web*.toml` passes its own value via `[build.args]`.

## Fly.io

- **Account**: `valerio.narcisi@gmail.com`, org `valerio-narcisi` ("Valerio Narcisi")
- **CLI**: installed via `brew install flyctl` (v0.4.99)
- **Payment method**: added 2026-09-04
- **Apps created** (`--no-deploy`, not yet actually deployed):
  - `oh-writers-web` — `oh-writers-web.fly.dev`, region `fra`, config `fly.web.toml`
  - `oh-writers-ws-server` — `oh-writers-ws-server.fly.dev`, region `fra`, config `fly.ws-server.toml`
- **High availability**: off (Fly auto-disabled it — no payment method at the time of `fly launch`; revisit once billing is confirmed active, or leave off, it's not needed at this traffic level)
- **Grafana/metrics**: included free at `fly-metrics.net`, no setup needed — auto-collects CPU/RAM/requests for every app, ~15 day retention
- **Not yet done**: first real `fly deploy` (secrets are set, see below)

## Neon (Postgres)

- **Project**: `ohwriters`, org slug `org-tiny-boat-32564575`, project id `crimson-morning-48044499`
- **Region**: AWS Europe Central 1 (Frankfurt) — matches Fly.io `fra`
- **Plan**: Free (0.5GB storage, autoscale to 2 CU, scale-to-zero when idle, 10 branches)
- **Neon Auth**: left off — Better Auth is the app's auth system, no need for Neon's
- **Connection string**: copied by Valerio, not stored in this file — goes straight into `fly secrets set`
- **Migrations**: ✅ run 2026-09-04 against both `production` and `beta`
  branches via `scripts/migrate-neon.sh` (idempotent — safe to re-run, skips
  already-applied migrations)

## Upstash (Redis)

- **Database**: `ohwriters_redis`
- **Region**: Frankfurt (eu-central-1)
- **Plan**: Free (256MB, 10GB/month bandwidth)
- **Eviction**: off (ws-server uses Redis for pub/sub coordination, not as a cache — don't want entries silently dropped)
- **Connection string**: copied by Valerio, not stored in this file — goes straight into `fly secrets set`

## Secrets needed on Fly (both apps unless noted)

Set via `scripts/fly-secrets-set.sh` (reads `.env.fly-secrets.local`, gitignored,
deleted after use — see script comments for why it parses the file manually
instead of `source`ing it: unquoted `&` in connection strings breaks `source`).

| Secret               | Source                                            | Status            |
| -------------------- | ------------------------------------------------- | ----------------- |
| `DATABASE_URL`       | Neon connection string                            | ✅ set 2026-09-04 |
| `REDIS_URL`          | Upstash connection string                         | ✅ set 2026-09-04 |
| `BETTER_AUTH_SECRET` | generated by the script (openssl rand)            | ✅ set 2026-09-04 |
| `BETTER_AUTH_URL`    | `https://app.ohwriters.com` (web only)            | ✅ set 2026-09-04 |
| `WS_URL`             | `wss://ws.ohwriters.com` (web only)               | ✅ set 2026-09-04 |
| `WS_INTERNAL_SECRET` | generated by the script, shared between both apps | ✅ set 2026-09-04 |

Secrets are staged — Fly applies them on the next deploy, not retroactively.

Deliberately absent: `ANTHROPIC_API_KEY` — `Features.AI_ENABLED` resolves to OFF
without it, first deploy ships as a pure editor with no AI surface (matches
the render.yaml-era decision, still valid).

## Auth (Better Auth) — production origin

`packages/auth/src/index.ts` had `trustedOrigins` hardcoded to `localhost`
dev ports only — sign-in from `https://app.ohwriters.com` would have been
rejected as an untrusted origin. Fixed 2026-09-04: `trustedOrigins` now
appends `BETTER_AUTH_URL` (already set as a Fly secret) when present.

No social login (Google/GitHub OAuth) configured yet — nothing to update on
an external OAuth console.

## Email (Resend)

- **Account**: `valerio.narcisi@gmail.com` (pre-existing Resend account, one
  older "Onboarding" API key from a prior project — unrelated, left as is)
- **API key**: `ohwriters-prod`, "Sending access" scope (not Full access —
  least privilege for a key that only needs to send mail), all domains
- **Domain**: `ohwriters.com` added to Resend, DNS records (DKIM, SPF/MX,
  DMARC optional) auto-configured onto Cloudflare via Resend's one-time
  Domain Connect authorization (no standing access granted)
- **Verification status as of 2026-09-04**: Pending (Resend checks DNS
  propagation automatically; SPF/MX confirmed resolving via `dig`, DKIM
  lagging slightly — expected to flip to Verified without action)
- **`packages/auth/src/mailer.ts` uses plain SMTP** (nodemailer), not the
  Resend SDK — wired as Resend's SMTP relay: `SMTP_USER=resend`,
  `SMTP_PASS=<the Resend API key>`. See `scripts/fly-secrets-set-smtp.sh`.
- **Secrets set on `oh-writers-web`** (ws-server doesn't send mail, so it
  doesn't need these): `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`,
  `SMTP_SECURE=false`, `SMTP_USER=resend`, `SMTP_PASS`, `MAIL_FROM=Oh Writers
<no-reply@ohwriters.com>` — ✅ all set 2026-09-04
- **Caveat**: `MAIL_FROM` will be rejected by Resend until the domain shows
  Verified — fine to have set now, will just work once verification completes

## Next steps (in order)

1. ~~`fly secrets set` on both apps~~ — done 2026-09-04
2. First `fly deploy --config fly.web.toml`, verify `/` health check
3. `fly deploy --config fly.ws-server.toml`, verify `/health` and a live Yjs round-trip
4. ~~Add DNS records for `app.`/`ws.`~~ — done 2026-09-04
5. Run `pnpm db:migrate` against the Neon database
6. Set up GitHub Actions deploy job (skeleton already in Spec 08b)
7. ~~SMTP for transactional email~~ — done 2026-09-04, see Email section above. Only remaining piece: confirm Resend domain flips to Verified (automatic, no action needed) before real signups are tested end-to-end.
