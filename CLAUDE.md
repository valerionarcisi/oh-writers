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

**Work queue:** the [GitHub Project board](https://github.com/users/valerionarcisi/projects/3) is the single live queue (columns NOW/NEXT/ICEBOX/Done) — bugs (Issues) + feature draft cards. `gh project item-list 3 --owner valerionarcisi` reads it. **WIP = 1** — one card in NOW at a time, taken to merge, then `/clear` and pull the next. `docs/BACKLOG.md` is the frozen pre-2026-06-24 snapshot (rich topic/audit context the cards link back to). Spec/LEARNINGS detail still lives in the .md files, not the conversation, so context stays small.

**Branch strategy (2026-09-04):** PRs target `beta`, not `main`. `beta` is the pre-release/staging channel — QA + a real deploy to `beta.ohwriters.com` happen there first. `main` is production-only, reached via a second PR (`beta`→`main`) once `beta` is verified stable. Both branches carry automated semantic-release versioning (`beta` gets pre-release versions like `1.3.0-beta.1`; `main` cuts the real release). See `README.md` §12 Deployment and `docs/specs/infra/08c-deploy-setup-log.md`.

1. Read the relevant feature folder and its schema files first
2. Identify which domain owns the logic (see Domain Boundaries)
3. Validate inputs with Zod before any logic runs
4. Implement server logic in `createServerFn`, client logic in the feature folder
5. Test with Playwright — never skip tests for mutations or critical paths
6. **For UI/UX changes**: research live + measure (never guess), and validate with **live re-measure + screenshot + a Playwright regression test** before committing. See [UI/UX Research](docs/conventions/ui-ux-research.md). Skip the test only with a written reason.
7. **Code-review the staged diff before every commit** — run the `/code-review` skill on the change, address any critical findings, then commit
8. Commit following the Git conventions below

A change is **done** only when it meets the [Definition of Done](docs/conventions/definition-of-done.md): tests at every applicable layer (E2E first), screenshots in a final recap, gates green, tracked in `docs/BACKLOG.md` (work queue) and **GitHub Issues** (bugs).

**Bug tracking lives in GitHub Issues, not `docs/BUGS.md`** (cutover 2026-06-24). File bugs with `gh issue create` using labels `bug` + `sev:alto|medio|basso` + `area:*`; close with `Fixes #N` in the PR/commit. `gh issue list --state open` is the live ledger; `docs/BUGS.md` is the frozen pre-cutover archive (repro detail only — do not add entries). **Specs/conventions/ADRs/LEARNINGS stay as `.md` in `docs/`** — they are read while coding and versioned with the code; only work-tracking (bugs, queue) moved off files.

**Before implementation:** a spec in `docs/specs/` is required ONLY when the work changes a product invariant/contract, makes a hard-to-reverse decision (schema, API shape, dependency, pattern), needs to be shared across agents/sessions, or designs a new domain. Bug fixes, refactors, and small reversible improvements do NOT get a spec — the GitHub Issue or the tests are the contract. Full criterion: [Specs](docs/conventions/specs.md). Name specs `NN-feature-name.md` (or `NNb-…` for sub-specs); when one is required, it is written first.

When in doubt about an architectural decision, stop and ask.

---

## Documentation Hygiene

### Update automatically — always, without being asked

- **This file (CLAUDE.md)**: if a decision is made during a session that contradicts or extends a rule here, update the relevant section before ending the session. One clear rule, not a paragraph. If the change is detailed, put the body in the matching `docs/conventions/<topic>.md` and keep CLAUDE.md as the pointer.
- **The relevant convention file** in `docs/conventions/`: if a rule changes or gets refined, update the file directly — CLAUDE.md only carries the index.
- **The spec for the feature being worked on** (`docs/specs/NN-feature.md`): if implementation reveals an error, missing case, or schema change, update the spec to match reality. The spec must always reflect what was actually built, not the original plan.
- **The `/manual-test` journeys** (`.claude/skills/manual-test/JOURNEYS.md`): when a new feature or user story lands on main, add or update its journey (Percorso / Verifiche / Blindata da) in the same session. The list is living by contract — it must reflect the shipped product.

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

**Six of these rules are enforced by a script, not by memory.** `pnpm fleet:check`
(run automatically on every commit, and as the `Guardrails` CI job) blocks: rogue
hex, hardcoded `border-radius`, native `window.alert/confirm/prompt`, Tailwind /
utility classes, Italian identifiers, and secrets in logs. It reports `file:line`.
Use `--staged` for what you are about to commit, `--diff <base>` for a branch.
Add a check there rather than a bullet here whenever a rule can be grepped —
this list is for what a script cannot decide.

- **Never use tRPC** — server calls go through `createServerFn` only
- **Never run DB queries on the client** — all Drizzle calls are inside `createServerFn` handlers
- **Never gate a feature on a raw `locale`/`plan`/market/user check inline** — every show/hide decision goes through `resolveFeatures`/`useFeature(Features.X)` (catalogue in `packages/domain/src/features/flags.ts`), resolved server-side, OFF=hidden. New gateable features must be added to the catalogue. See [Feature Flags](docs/conventions/feature-flags.md) + [Spec 54](docs/specs/54-feature-flags.md).
- **Never use `try/catch`** for expected failures — use `ResultAsync.fromPromise` and typed errors
- **Never mutate** state, arrays, or objects directly — always return new values
- **Never write TypeScript types by hand** when they can be inferred from Zod or Drizzle
- **Never use CSS-in-JS**, and never hardcode magic numbers in CSS — spacing goes through `--ds-space-*`, radii through `--ds-radius-*`, colour through the semantic tokens. _(Tailwind, rogue hex and hardcoded radii: gated.)_
- **Never re-implement focus management, keyboard nav, or overlay dismiss by hand** — use `react-aria` hooks (`useButton`, `useDialog`, `useOverlay`, `useMenu`, `useTabList`, etc.) for every interactive primitive. If a `react-aria` hook exists for the pattern, it is mandatory. See spec 25. This includes dialogs: ask with `useConfirmDialog()` (`confirm` / `promptText`), never a browser dialog. _(Native dialogs: gated.)_
- **Never mix `null` and `undefined`** in the same type — use `null` for intentional absence
- **Never expose the Anthropic API key** to the client, and never log tokens, passwords or keys. _(Secrets in logs: gated.)_
- **Never add AI signatures** to commits (`Co-Authored-By: Claude` or similar)
- **Never import browser-only or editor (ProseMirror/Monaco) APIs** inside `packages/domain`, `packages/utils`, or any other shared package — those must stay framework-agnostic so the future mobile companion can consume them
- **Never hard-couple auth to cookies** — Better Auth must remain able to issue bearer tokens for mobile clients
- **Never write code in Italian** — every identifier, comment, log message and internal error message MUST be in English; only UI copy shown to the user is Italian (the product is IT-localised), and it lives in the i18n catalogue, never as a literal in a component. A comment `// gestisce errore` is as much a violation as a function named `caricaSceneggiatura`. Non-negotiable, so that future contributors and English-speaking collaborators can read the codebase. _(Identifiers: gated. Comments and messages: on you.)_
- **In-repo documentation is written in English** — every file under `docs/`, `README.md`, specs, conventions and ADR live in English, because they are versioned with the code and read by English-speaking collaborators. English does NOT apply to GitHub issues/PR titles/bodies / commit messages, which may be in the author's language — the one rule is that repo-committed documentation is English. Keep this file aligned when you write docs.
- **Cesare prompts are written in English** — every LLM system/role/skill-guidance prompt (`ROLE_TEXT`, `skills/*.skill.ts` guidance blocks, any new prompt) is authored in English, because models reason better on English instructions and it matches the English-everything rule above. The **output language is set by an explicit directive in the prompt** ("Always respond to the user in Italian"; keep domain terms — logline, soggetto, scaletta, trattamento — in Italian), NOT by writing the prompt itself in Italian. The user-facing strings Cesare emits stay Italian. _Existing prompts are still Italian and will be migrated in a separate card_ (`ROLE_TEXT` is cache-position-sensitive — see `context/assemble-system-prompt.ts`); new prompts start English. See [Spec 79](docs/specs/79-cesare-kickoff-mode.md).
- **Never reintroduce a reserved-column Cesare** — Cesare is a floating Notion-style sub-window anchored bottom-right. The editor never reflows when Cesare opens, closes, or resizes. See [Spec 44](docs/specs/44-shell-refactor-notion-style.md).
- **The bell / avatar / gear live in the TopBar account zone** (`TopBarAccount`, the single home — Spec 55, supersedes Spec 47b). They are NOT in the `BottomDock`, the `CesareDrawer` header, or the LeftRail footer (`AccountRow` is retired from the shell). Avatar → user settings; gear → project settings (distinct). Never re-add them to the dock/rail/Cesare header.
- **Never read `body[data-cesare]` and expect 4 string values.** It only stores `closed` or `expanded`. Peek and full are runtime-only states inside the `CesareDrawer` reducer; `expanded-split` is internal to the SplitDrawer co-existence flow and is never persisted (it collapses to `expanded` for the body attribute and for the user-facing cycle).
- **Never anchor a per-page action bar at bottom-right.** The shell-level `BottomDock` lives there. Use `<FloatingDock/>` (bottom-left by default) or migrate the CTAs into a TopBar action slot.
- **Never park a Cesare edit in a side draft tray as the primary flow.** Every Cesare edit applies LIVE to the open entity. See [Agentic Edit Pattern](#agentic-edit-pattern-canonical) below — it is mandatory for all features.
- **Never conflate `CesareDrawer` with `SplitDrawer`.** `CesareDrawer` is the floating bottom-right chat (no routing). `SplitDrawer` is the routed side-peek that injects a real page beside the current one via the `?peek=` search param and compresses the main lane. Cesare sessions open as a real central route (`/projects/:id/sessions/:sessionId`), not a peek. See [Spec 46](docs/specs/46-split-drawer.md).
- **The auxiliary split lane is ONE shared, navigable host — never a second parallel lane.** There is exactly one auxiliary track. Cesare peek, Versioni, and Notifiche all open INTO the same lane and become entries in its shared history stack (browser-like ←/→ in the split header); opening one while another is open NAVIGATES within the lane (back returns to the previous surface), it does not stack a second lane. **Any new surface that opens in the side-peek MUST route through this shared navigable host** (a new `SplitDrawerPayload` kind reconciled to its URL param), never its own column. The BUG-N64 invariant holds: at most one auxiliary lane live, the main (middle) track never collapses below a usable width. Cesare SESSIONS stay a central route, not a split surface. See [Spec 78 §A6](docs/specs/78-narrative-shell-ux-fixes.md) + `use-unified-split-navigation.ts`.
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

Commit format: `type: description` (no `[OHW]` prefix — dropped 2026-06-26)

- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance, dependencies
- `refactor:` no behavior change
- `test:` adding or modifying tests

No AI signatures in commits.
