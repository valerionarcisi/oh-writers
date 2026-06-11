# Oh Writers — CLAUDE.md

Before touching any code, read these files in order:

1. `SPEC.md` — product requirements and domain model
2. `docs/architecture.md` — system design and decisions
3. This file
4. The relevant convention file(s) in `docs/conventions/` — see index below

If those files don't exist yet, ask before proceeding.

---

## Conventions index

Detailed rules live in `docs/conventions/`. Load the file that matches the task:

- [Code Philosophy](docs/conventions/code-philosophy.md) — DRY, centralize, cognitive load, FP subset
- [Platform Reach](docs/conventions/platform-reach.md) — web + PWA + Expo companion rules
- [Server Functions](docs/conventions/server-functions.md) — `createServerFn`, `withProjectAccess`, canonical shape
- [Types](docs/conventions/types.md) — Zod, Drizzle, branded, tagged const, discriminated unions
- [Error Handling](docs/conventions/error-handling.md) — neverthrow, `_tag`, `ResultShape` boundary
- [React Patterns](docs/conventions/react.md) — reducer + ts-pattern, feature folder
- [CSS](docs/conventions/css.md) — CSS Modules, tokens, flex-first, nesting, container queries, logical props
- [Loading states](docs/conventions/loading-states.md) — `Skeleton`/`SkeletonCard` mandatory
- [Specs](docs/conventions/specs.md) — when a spec is required (invariants, irreversibility, shared truth, new domain) vs straight-to-code
- [Naming](docs/conventions/naming.md)
- [Code Comments](docs/conventions/code-comments.md)
- [Testing](docs/conventions/testing.md) — Vitest + Playwright + Vernissage + cost smoke
- [Mock Mode](docs/conventions/mock-mode.md) — `MOCK_AI=true` agentic mock
- [Feature Flags](docs/conventions/feature-flags.md) — `resolveFeatures`/`useFeature`, market·plan·user, OFF=hidden
- [Security](docs/conventions/security.md)
- [Observability](docs/conventions/observability.md) — Langfuse traces, JSON metrics, Pino logs
- [Shared Infrastructure](docs/conventions/shared-infra.md) — centralized utilities table
- [Database](docs/conventions/database.md) — Drizzle, migrations
- [UI/UX Research](docs/conventions/ui-ux-research.md) — drive live + measure (geometry/hit-test/computed style), validate with measure+screenshot+E2E test, record learnings
- [Definition of Done](docs/conventions/definition-of-done.md) — tests at every layer (E2E first) + screenshot recap + gates green + tracked; a change isn't done until this holds

---

## Workflow

**Work queue:** `docs/BACKLOG.md` is the single live queue (NOW/NEXT/ICEBOX/DONE). **WIP = 1** — one front at a time, taken to merge, then `/clear` and pull the next. State lives in the .md files (backlog + specs + LEARNINGS), not the conversation, so context stays small.

1. Read the relevant feature folder and its schema files first
2. Identify which domain owns the logic (see Domain Boundaries)
3. Validate inputs with Zod before any logic runs
4. Implement server logic in `createServerFn`, client logic in the feature folder
5. Test with Playwright — never skip tests for mutations or critical paths
6. **For UI/UX changes**: research live + measure (never guess), and validate with **live re-measure + screenshot + a Playwright regression test** before committing. See [UI/UX Research](docs/conventions/ui-ux-research.md). Skip the test only with a written reason.
7. **Code-review the staged diff before every commit** — run the `/code-review` skill on the change, address any critical findings, then commit
8. Commit following the Git conventions below

A change is **done** only when it meets the [Definition of Done](docs/conventions/definition-of-done.md): tests at every applicable layer (E2E first), screenshots in a final recap, gates green, tracked in `docs/BACKLOG.md`/`docs/BUGS.md`.

**Before implementation:** a spec in `docs/specs/` is required ONLY when the work changes a product invariant/contract, makes a hard-to-reverse decision (schema, API shape, dependency, pattern), needs to be shared across agents/sessions, or designs a new domain. Bug fixes, refactors, and small reversible improvements do NOT get a spec — the `docs/BUGS.md` entry or the tests are the contract. Full criterion: [Specs](docs/conventions/specs.md). Name specs `NN-feature-name.md` (or `NNb-…` for sub-specs); when one is required, it is written first.

When in doubt about an architectural decision, stop and ask.

---

## Documentation Hygiene

### Update automatically — always, without being asked

- **This file (CLAUDE.md)**: if a decision is made during a session that contradicts or extends a rule here, update the relevant section before ending the session. One clear rule, not a paragraph. If the change is detailed, put the body in the matching `docs/conventions/<topic>.md` and keep CLAUDE.md as the pointer.
- **The relevant convention file** in `docs/conventions/`: if a rule changes or gets refined, update the file directly — CLAUDE.md only carries the index.
- **The spec for the feature being worked on** (`docs/specs/NN-feature.md`): if implementation reveals an error, missing case, or schema change, update the spec to match reality. The spec must always reflect what was actually built, not the original plan.

### Update only when explicitly asked

- `docs/architecture.md` — only when a structural decision changes (new pattern, removed dependency)
- `docs/data-model.md` — only when a table is added, removed, or significantly changed
- `README.md` — only when setup steps or project-level information changes

### Never

- Never update documentation speculatively — only document decisions that have been made
- Never expand a spec with future ideas during implementation — open a new spec file instead
- Never silently diverge from a spec — if implementation requires a different approach, flag it before proceeding

---

## Stack

| Layer          | Tool                                                     |
| -------------- | -------------------------------------------------------- |
| Framework      | TanStack Start (SSR, file-based routing)                 |
| Routing        | TanStack Router                                          |
| Server calls   | `createServerFn` — the only way to call server logic     |
| Data fetching  | TanStack Query (via `queryOptions` + `useSuspenseQuery`) |
| ORM            | Drizzle + PostgreSQL                                     |
| Auth           | Better Auth (team/org support)                           |
| Editor         | ProseMirror (screenplay + narrative editing)             |
| Collaboration  | Yjs + y-websocket (real-time sync)                       |
| Styling        | CSS Modules — zero Tailwind, zero CSS-in-JS              |
| Validation     | Zod — single source of truth for all types               |
| Error handling | neverthrow — `Result` and `ResultAsync`                  |
| Testing        | Vitest (unit) + Playwright (E2E)                         |

---

## Never Do

Hard stops. If you are about to do any of these, stop and ask.

- **Never use tRPC** — server calls go through `createServerFn` only
- **Never run DB queries on the client** — all Drizzle calls are inside `createServerFn` handlers
- **Never gate a feature on a raw `locale`/`plan`/market/user check inline** — every show/hide decision goes through `resolveFeatures`/`useFeature(Features.X)` (catalogue in `packages/domain/src/features/flags.ts`), resolved server-side, OFF=hidden. New gateable features must be added to the catalogue. See [Feature Flags](docs/conventions/feature-flags.md) + [Spec 54](docs/specs/54-feature-flags.md).
- **Never use `try/catch`** for expected failures — use `ResultAsync.fromPromise` and typed errors
- **Never mutate** state, arrays, or objects directly — always return new values
- **Never write TypeScript types by hand** when they can be inferred from Zod or Drizzle
- **Never use Tailwind**, utility classes, or CSS-in-JS of any kind
- **Never hardcode** hex colors, arbitrary `px` values, or magic numbers in CSS
- **Never re-implement focus management, keyboard nav, or overlay dismiss by hand** — use `react-aria` hooks (`useButton`, `useDialog`, `useOverlay`, `useMenu`, `useTabList`, etc.) for every interactive primitive. If a `react-aria` hook exists for the pattern, it is mandatory. See spec 25.
- **Never use hardcoded border-radius** — use `--radius-*` tokens (`--radius-md` default, `--radius-none` for screenplay page only)
- **Never mix `null` and `undefined`** in the same type — use `null` for intentional absence
- **Never expose the Anthropic API key** to the client
- **Never log** tokens, passwords, or API keys
- **Never add AI signatures** to commits (`Co-Authored-By: Claude` or similar)
- **Never import browser-only or editor (ProseMirror/Monaco) APIs** inside `packages/domain`, `packages/utils`, or any other shared package — those must stay framework-agnostic so the future mobile companion can consume them
- **Never hard-couple auth to cookies** — Better Auth must remain able to issue bearer tokens for mobile clients
- **Never write code in Italian** — every identifier (variables, functions, types, files), every comment, every log message, every internal error message MUST be in English. UI copy shown to the user is Italian (the product is IT-localised); everything else is English. A function named `caricaSceneggiatura` or a comment `// gestisce errore` is a hard NO. This rule is non-negotiable so that future contributors, AI tooling, and English-speaking collaborators can read the codebase.
- **Never reintroduce a reserved-column Cesare** — Cesare is a floating Notion-style sub-window anchored bottom-right. The editor never reflows when Cesare opens, closes, or resizes. See [Spec 44](docs/specs/44-shell-refactor-notion-style.md).
- **The bell / avatar / gear live in the TopBar account zone** (`TopBarAccount`, the single home — Spec 55, supersedes Spec 47b). They are NOT in the `BottomDock`, the `CesareDrawer` header, or the LeftRail footer (`AccountRow` is retired from the shell). Avatar → user settings; gear → project settings (distinct). Never re-add them to the dock/rail/Cesare header.
- **Never read `body[data-cesare]` and expect 4 string values.** It only stores `closed` or `expanded`. Peek and full are runtime-only states inside the `CesareDrawer` reducer; `expanded-split` is internal to the SplitDrawer co-existence flow and is never persisted (it collapses to `expanded` for the body attribute and for the user-facing cycle).
- **Never anchor a per-page action bar at bottom-right.** The shell-level `BottomDock` lives there. Use `<FloatingDock/>` (bottom-left by default) or migrate the CTAs into a TopBar action slot.
- **Never park a Cesare edit in a side draft tray as the primary flow.** Every Cesare edit applies LIVE to the open entity. See [Agentic Edit Pattern](#agentic-edit-pattern-canonical) below — it is mandatory for all features.
- **Never conflate `CesareDrawer` with `SplitDrawer`.** `CesareDrawer` is the floating bottom-right chat (no routing). `SplitDrawer` is the routed side-peek that injects a real page beside the current one via the `?peek=` search param and compresses the main lane. Cesare sessions open as a real central route (`/projects/:id/sessions/:sessionId`), not a peek. See [Spec 46](docs/specs/46-split-drawer.md).
- **Never let a render throw blank the app.** Every routed surface is covered by the app-wide `defaultErrorComponent` (`RouteErrorBoundary` → `@oh-writers/ui` `RouteErrorFallback`): a render throw shows a branded fallback (shell chrome survives, retry + back-to-dashboard, collapsible stack) and logs a structured `route.error.boundary` client event — never the framework's bare unstyled page. Do not remove `defaultErrorComponent` from `router.tsx`. See [Spec 60](docs/specs/60-route-error-boundary.md).

---

## Agentic Edit Pattern (canonical)

Every Cesare edit, in **every feature** (Soggetto, Sinossi, Scaletta, Trattamento, Sceneggiatura, Breakdown, Budget, Calendario, Location — no exceptions), follows the same contract. Modeled on Notion AI.

1. Chat stays a **floating bottom-right drawer** — never a fullscreen takeover, never reflows the editor.
2. The **open entity updates LIVE behind the chat** while the trace renders. The visible document is the preview; there is no detached drawer for the edit itself.
3. A **version is auto-created** before the change is applied (so every AI mutation is revertible). The "before" snapshot is captured by `auto-version.effect.ts`.
4. The chat renders an **inline compact trace**: `N passaggi › → reasoning/Thought › → Aggiornato <Entity> → Fatto → result card` with **Mostra/Nascondi modifiche** (toggle diff). Per **Spec 47e** the inline **↩ Annulla** affordance was intentionally removed — the edit is always applied and the toggle is a transient flash, not a revert; **true rollback lives in the Versions SplitDrawer** (backed by the auto-created version from point 3). Do not re-add an inline undo to the result card.

When you add a Cesare tool that mutates any entity, reuse this flow — do not invent a per-feature variant. See [Spec 44](docs/specs/44-shell-refactor-notion-style.md#agentic-edit-pattern) and the QA contract in `docs/specs/44-qa-iter-1-report.md`.

**Tracer is mandatory — product invariant.** Cesare must ALWAYS give the user live visibility into what it is seeing and doing. Every turn renders a streamed step trace as it happens — `reading{entity}` (cosa sta leggendo) → `reasoning`/Thought → `writing{entity}` (cosa sta scrivendo, anche cross-domain) → `tool{name}` → `done`/Fatto → result card. No silent action, no mute spinner, no "loading…" without a step trace behind it. This holds for every feature, every page, every request type, and every future surface (including the Effect refactor in Spec 48 and the routed surfaces in Spec 49). The transport is the streamed step events (Spec 47a / `cesare-stream-events.ts`); if a tool runs without emitting a step, that is a bug. Any new AI capability that does not surface its trace to the user fails review.

---

## Domain Boundaries

Co-locate server functions with the feature that owns the domain:

- `features/auth/` — login, session, user
- `features/teams/` — membership, roles, invites
- `features/projects/` — CRUD, genre, format
- `features/documents/` — logline, synopsis, outline, treatment
- `features/screenplay-editor/` — screenplay structure, versions, scenes
- `features/breakdown/` — scene breakdown, element extraction (cast, props, locations, VFX, vehicles, extras, sound)
- `features/budget/` — cost prediction, budget lines, AI estimates
- `features/schedule/` — strip board, shooting days, scene ordering
- `features/locations/` — location candidates, scouting notes, attachments
- `features/predictions/` — all AI generation and estimation calls

---

## Git

Commit format: `[OHW] type: description`

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance, dependencies
- `refactor:` no behavior change
- `test:` adding or modifying tests

No AI signatures in commits.
