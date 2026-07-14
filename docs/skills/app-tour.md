---
name: oh-writers-app-tour
description: High-level smoke-tour of the Oh Writers app — navigate every surface, confirm the shell is alive. Use after code changes to verify nothing is broken without running the full E2E suite. Uses Playwright MCP to drive the live app.
---

# Oh Writers — App Tour (High-Level Navigation Smoke)

Navigates the Oh Writers web app at a high level: visits every main surface, confirms the shell chrome renders, checks Cesare opens/closes, and verifies no blank pages. This is NOT a deep E2E test — it's a visual tour that catches broken routes, shell regressions, and blank surfaces in under 2 minutes.

**When to use:** After any code change before committing, after `pnpm dev` starts, or when you want a quick sanity check.

**Prerequisites:**

- App running at `http://localhost:3002` (`pnpm dev` from the repo root)
- Test DB seeded (`pnpm db:seed`)
- Playwright MCP connected to a Chromium browser

**Test project:** Uses the seeded team project `00000000-0000-4000-a000-000000000011` (PID).

---

## Tour Playbook

Execute these steps in order. If any step fails, stop and report what broke.

### Phase 1 — Unauthenticated surfaces

1. **Login page** — Navigate to `/login`. Confirm the login form renders (email + password fields, submit button). Take a snapshot.
2. **Register page** — Navigate to `/register`. Confirm the registration form renders.

### Phase 2 — Authenticate

3. **Sign in** — Fill the login form with test credentials and submit. Wait for redirect to `/dashboard`.
   - Email: `test@ohwriters.dev`
   - Password: `testpassword123`

### Phase 3 — Shell chrome

4. **Dashboard shell** — On `/dashboard`, confirm these shell elements are present:
   - TopBar with logo/brand
   - LeftRail with navigation items
   - BottomDock
   - At least one project card visible
5. **TopBar account zone** — Click the avatar area. Confirm the dropdown opens with user settings and sign out. Close it.

### Phase 4 — Project surfaces (MVP, production-visible)

Navigate to each of these via URL (use `browser_navigate`). For each, confirm the page renders its content shell (not blank, no error boundary). Take a quick snapshot if something looks off.

6. **Soggetto** → `/projects/${PID}/soggetto` — expect `[data-testid="soggetto-page"]` visible.
7. **Sinossi** → `/projects/${PID}/synopsis` — expect `[data-testid="narrative-docs-shell"]` visible.
8. **Scaletta** → `/projects/${PID}/outline` — expect `[data-testid="narrative-docs-shell"]` visible.
9. **Trattamento** → `/projects/${PID}/treatment` — expect `[data-testid="narrative-docs-shell"]` visible.
10. **Sceneggiatura** → `/projects/${PID}/screenplay` — expect `.pm-heading` (ProseMirror scene heading) visible, or at minimum the editor container.
11. **Title Page** → `/projects/${PID}/title-page` — confirm the page renders (may show title page form or content).
12. **Breakdown (Spoglio)** → `/projects/${PID}/breakdown` — expect `[data-testid="breakdown-page-v2"]` visible.
13. **Calendario** → `/projects/${PID}/schedule` — expect `[data-testid="schedule-page-v2"]` visible.

### Phase 5 — Project surfaces (DEV_ONLY / gated)

These are hidden in production builds. In dev mode (`pnpm dev`) they should render.

14. **Budget** → `/projects/${PID}/budget` — confirm the page renders (not blank).
15. **Locations** → `/projects/${PID}/locations` — confirm the page renders.
16. **Shooting Plan** → `/projects/${PID}/shooting-plan` — confirm the page renders.

### Phase 6 — Project meta surfaces

17. **Project Overview** → `/projects/${PID}` — confirm the project overview page renders.
18. **Project Settings** → `/projects/${PID}/settings` — confirm settings page renders.
19. **Opportunities** → `/projects/${PID}/opportunities` — confirm page renders.

### Phase 7 — Cesare sessions

20. **Sessions list** → `/projects/${PID}/sessions` — confirm the sessions landing page renders.
21. **New session** → `/projects/${PID}/sessions/new` — confirm the new session page renders (kickoff mode).

### Phase 8 — Cesare drawer (floating chat)

22. **Open Cesare** — From any project page (e.g. Soggetto), click the Cesare trigger in the BottomDock (bottom-right). Confirm the floating drawer opens without reflowing the editor.
23. **Close Cesare** — Close the drawer. Confirm the editor is still intact.

### Phase 9 — SplitDrawer (peek)

24. **Peek a page** — Navigate to `/projects/${PID}/soggetto?peek=versions`. Confirm the Versions SplitDrawer opens beside the main page. Close it.
25. **Version detail** — Navigate to `/projects/${PID}/screenplay/versions/00000000-0000-4000-a000-000000000021` (a seeded version). Confirm it renders.

### Phase 10 — Top-level surfaces

26. **Settings** → `/settings` — confirm user settings page renders.
27. **AI Settings** → `/settings/ai` — confirm AI provider settings page renders.
28. **Teams list** → `/teams` — confirm teams page renders (may redirect, should not 404).
29. **New Project** → `/projects/new` — confirm the creation form renders.
30. **New Team** → `/teams/new` — confirm the creation form renders.

---

## Quick Tour (abbreviated)

For a faster check (~1 min), run only these key surfaces:

1. Login → authenticate → Dashboard
2. Soggetto, Sinossi, Scaletta, Trattamento, Sceneggiatura
3. Breakdown, Calendario
4. Budget, Locations (dev-only check)
5. Open/close Cesare drawer
6. Settings, AI Settings

---

## Implementation Notes

This skill drives the app through Playwright MCP tools (`mcp__playwright__browser_navigate`, `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_click`, `mcp__playwright__browser_fill_form`, `mcp__playwright__browser_take_screenshot`). It assumes Playwright MCP is already connected to a browser.

**PID constants:**

- Team project: `00000000-0000-4000-a000-000000000011`
- Personal project: `00000000-0000-4000-a000-000000000010`

**Test credentials:**

- Owner: `test@ohwriters.dev` / `testpassword123`
- Viewer: `viewer@ohwriters.dev` / `viewerpassword123`

**Base URL:** `http://localhost:3002` (matches `WEB_PORT` default in Playwright config).

**Key data-testid markers for assertions:**

- `soggetto-page` — Soggetto page shell
- `narrative-docs-shell` — Narrative editor wrapper (Sinossi, Scaletta, Trattamento)
- `breakdown-page-v2` — Breakdown page
- `schedule-page-v2` — Schedule/Calendario page
- `.pm-heading` — ProseMirror scene heading in screenplay editor

---

## Pitfalls

1. **Port mismatch** — If the app runs on a different port, update the base URL. The Playwright config uses `WEB_PORT` (default 3002).
2. **Not authenticated** — If pages redirect to `/login`, the auth cookie expired. Re-authenticate.
3. **DEV_ONLY surfaces** — Budget, Locations, Shooting Plan are hidden in production. In dev mode (`pnpm dev`) they render; if running against `pnpm build && pnpm start`, they will 404.
4. **Blank page ≠ OK** — A page that returns 200 but shows an empty shell is broken. Always verify a key data-testid or visible content element.
5. **Cesare drawer timing** — The bottom sheet animates; wait for it to settle before interacting.
6. **Slow cold starts** — First navigation after `pnpm dev` may take 10-20s (Vite cold compile). Wait for the page to fully load.
