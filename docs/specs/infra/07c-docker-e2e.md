# Spec 07c — Docker + E2E Test Infrastructure

## Goal

Dockerize the development database and build a working E2E test pipeline that runs against a real PostgreSQL instance. Use "Non fa ridere" (the user's short film screenplay) as the primary test fixture.

## Docker Setup

### `docker/docker-compose.dev.yml`

PostgreSQL 16 container for local development and testing:

- **Image**: `postgres:16-alpine`
- **Port**: 5432
- **Credentials**: `oh-writers` / `oh-writers` / `oh-writers_dev`
- **Volume**: named volume for persistence (`ohw-pg-data`)
- **Healthcheck**: `pg_isready`

Root-level convenience scripts in `package.json`:

- `db:up` — start the container
- `db:down` — stop the container
- `db:reset` — stop + remove volume + start (clean slate)

### No app Dockerfile yet

The web app and ws-server are NOT containerized in this spec. Only the database. App containerization is a separate concern (CI/CD spec).

## Seed Script

### `packages/db/src/seed/index.ts`

Creates test data in this order:

1. **Test user** — `test@ohwriters.dev` / `Test User`
   - Insert into `users` table directly
   - Insert into `accounts` table with provider `credential` and a bcrypt-hashed password
   - This matches Better Auth's internal schema for email/password auth

2. **Project** — "Non fa ridere" (comedy, short)
   - `owner_id` = test user
   - `genre` = "comedy", `format` = "short"

3. **Documents** — logline + synopsis
   - Logline: one-liner about the film
   - Synopsis: brief paragraph

4. **Screenplay** — full Fountain-formatted text of "Non fa ridere"
   - All 9 scenes, ~13 pages
   - `content` field populated with the full text
   - `page_count` = 13

5. **One manual version** — "v13 — 2025-11-11"
   - Same content as the screenplay
   - `is_auto` = false

### `packages/db/src/seed/reset.ts`

Truncates all tables in reverse dependency order, then runs the seed.

### `packages/db/src/seed/fixtures/non-fa-ridere.fountain.ts`

The full screenplay exported as a string constant. Fountain format (plain text, standard screenplay markup).

## Playwright Auth Fixture

### `tests/fixtures.ts`

Shared Playwright fixtures that:

1. **`authenticatedPage`** — a `Page` with a valid session cookie
   - Before all tests: makes a `POST /api/auth/sign-up/email` call (idempotent — ignores "already exists" errors)
   - Then `POST /api/auth/sign-in/email` to get the session cookie
   - Stores the cookie in `storageState` for reuse
   - All tests that need auth import `{ test }` from this file instead of `@playwright/test`

2. **`testProjectId`** — the UUID of the seeded "Non fa ridere" project
   - Fetched once by navigating to `/dashboard` and extracting the project link

### `tests/helpers.ts`

Shared helpers:

- `waitForEditor(page)` — waits for Monaco `.monaco-editor` to be visible + clicks it
- `goToNewLine(page)` — Ctrl+End, Enter, Enter
- `getEditorContent(page)` — extracts text from Monaco via evaluate
- `BASE_URL` — from env or default `http://localhost:3002`

## Test Plan

### What to test (editing features)

All tests use the seeded "Non fa ridere" screenplay:

| ID      | Test                                              | What it verifies                                |
| ------- | ------------------------------------------------- | ----------------------------------------------- |
| OHW-078 | Editor loads with seeded content                  | Monaco renders, content is non-empty            |
| OHW-079 | Page indicator shows correct count                | ~13 pages for this screenplay                   |
| OHW-080 | Character autocomplete suggests FILIPPO           | Type "F" on CHARACTER line → FILIPPO appears    |
| OHW-081 | Character autocomplete suggests TEA               | Type "T" → TEA appears                          |
| OHW-082 | Tab cycles action → CHARACTER → DIALOGUE → action | Keybinding cycle works                          |
| OHW-083 | Smart Enter: CHARACTER → DIALOGUE indent          | Enter after CHARACTER line                      |
| OHW-084 | Smart Enter: DIALOGUE → action                    | Enter after DIALOGUE line                       |
| OHW-085 | Focus mode toggle                                 | Enter/exit focus mode                           |
| OHW-086 | Content persists after edit + auto-save           | Type, wait for save, reload, verify             |
| OHW-087 | Create manual version                             | Click "New Version", fill label, verify in list |
| OHW-088 | Version diff shows changes                        | Edit, create version, view diff                 |

### Updated tests (design system changes)

| ID      | Test                   | Change                                         |
| ------- | ---------------------- | ---------------------------------------------- |
| OHW-070 | Suggest widget styling | Update: border-radius is now `8px` (was `0px`) |

## Migration Strategy

1. Existing tests (OHW-051–072) are broken (reference removed `MOCK_API` mode)
2. New tests (OHW-078+) replace them against real DB
3. Old test files are deleted after new ones are verified
4. `playwright.config.ts` updated to use port 3002 and not start ws-server (not needed for editor tests)

## Playwright Config Changes

- `baseURL` default → `http://localhost:3002`
- Remove ws-server from `webServer` array (not needed for these tests)
- Web server command uses `DATABASE_URL` from env
