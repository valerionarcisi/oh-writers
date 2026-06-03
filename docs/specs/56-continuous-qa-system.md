# Spec 56 — Continuous QA & Learnings System

Status: APPROVED (brainstorm 2026-06-03) — phased rollout, grows with the project.
Related: enforces [Spec 55](55-shell-action-standard.md); builds on Playwright E2E,
Vernissage, pre-commit hooks, the audit-fleet, `docs/conventions/ui-ux-research.md`,
`docs/LEARNINGS.md`. Goal: Valerio should NOT have to open the app manually to find bugs.

## Problem

CI runs typecheck/lint/unit/E2E(mock)/build, but nothing catches: dead/missing routes
(404 `/teams`, `/logline`), accessibility regressions, or visual/action incoherence
(scattered exports, ugly drawers). Bugs are found only by manual exploration.

## Principle — best practice in the middle

A **Definition of Done** + **shift-left, layered automated QA**, plus a **heuristic loop
that evaluates the app as a real user and iterates until a coherence bar is met** — not
until "CI is green". Each layer is a recognised practice, not bespoke.

## Layers (phased)

### Phase 1 — immediate, independent of Spec 55

1. **Route-coverage smoke** (smoke / synthetic testing). Auto-generate the route list from
   `apps/web/app/routes/*` so new routes are covered for free. For each route: assert HTTP
   ok, no router `notFoundError`, no error boundary, no console error, non-empty `<main>`.
   Catches "parti mancanti". Runs in CI (`qa.yml`) on the mock server.
2. **Accessibility automation** (automated a11y testing) — `@axe-core/playwright` on key
   pages; fail the build on `serious`/`critical` violations. Catches the a11y class
   continuously (focus rings, roles, names). New dep: `@axe-core/playwright` (pinned).

### Phase 2 — after Spec 55 lands

3. **Action single-home check** (contract testing) — assert no export/import/versions
   button renders outside the TopBar zone (enforces Spec 55's core rule).
4. **DS-consistency lint** (static analysis) — extend the existing l10n-leak guard pattern:
   flag rogue hex, non-token border-radius, inline `locale`/`plan`/market checks.
5. **Shell-zone structural assertions** — geometry/computed-style checks on the canonical
   zones (the robust technique from `ui-ux-research.md`: e.g. account in TopBar, single
   footer, drawer anchored correctly). No flaky pixels.

### Phase 3 — visual regression

6. **Vernissage baseline + diff** on a SMALL set of canonical surfaces, growing over time.
   Hybrid: structural assertions (Phase 2) carry most of the load; pixel snapshots only for
   a curated few key screens to avoid baseline-flakiness hell.

### Phase 4 — gate + loop

7. **Definition of Done** — a checklist in `docs/conventions/` + the above wired into
   `qa.yml`. A change is "done" only when the coherence exit-conditions hold.
8. **Heuristic coherence loop** — the audit-fleet (Spec 47 / agent-fleet) becomes the
   periodic deep sweep run "as a user" (Nielsen heuristics + the human-friendly judge),
   iterating fix→re-evaluate until the coherence bar is met. The Lead gate
   ([feedback-audit-fleet-setup]) filters false positives.
9. **Learnings loop** — every correction → `docs/LEARNINGS.md` + a feedback memory; a Stop
   hook nudges it at end of task (see `.claude/settings.json`). Learnings feed back into
   `docs/conventions/`.

## Coherence exit-conditions (the iteration bar)

The loop runs until ALL hold: zero dead routes · a11y serious/critical = 0 · zero actions
outside their canonical zone (Spec 55) · DS-lint clean · drawer inventory matches the
standard · key-surface visual baselines green.

## Acceptance

- Phase 1 merged and green in CI; a deliberately broken route / a11y violation fails CI.
- Each later phase ships behind its own plan; the system is usable after Phase 1 alone.

## Out of scope

- Replacing the product DB or adding a separate analytics DB for learnings — markdown +
  memory now; revisit a parser→SQLite only past ~50 LEARNINGS entries or when stats/
  dashboards are needed (decided 2026-06-03).
