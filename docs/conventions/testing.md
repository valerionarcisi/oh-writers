# Testing

QA is a **mandatory pipeline gate**, not an afterthought. Every non-trivial feature is delivered with a multi-level test suite. Two test runners, each for its strengths. No Cypress, no Jest.

## Levels (mandatory for every feature)

1. **Vitest — fast logic tests**
   Pure functions, parsers, reducers, transformers, schema validation, error handling. Anything that doesn't need a browser. Minimum 5 cases per pure function (happy path, edge, boundary, error, default).
   - Co-locate test files: `feature.server.test.ts` next to `feature.server.ts`
   - Run with `pnpm test:unit`

2. **Playwright — Mock E2E**
   Auth flows, page navigation, editor interactions, agentic Cesare flows. Use `MOCK_AI=true` for deterministic E2E that don't burn API credits.
   - Test files in `tests/` directory
   - Run with `pnpm test:e2e` (default project) or `pnpm test:e2e -- --project=mock-ui` (Cesare agentic)
   - Tag format: `[OHW-NNN]`

3. **Vernissage walk + report**
   JSON story in `vernissage/_stories/<feature>.story.json`, screenshots produced by `pnpm vernissage:walk`, markdown report `vernissage/<feature>.md` filled from `_template.md` with a manual verification checklist.

4. **Cost smoke (Cesare-touching features only)**
   `scripts/cost-smoke-<feature>.ts` invoked via `pnpm cost:smoke:<feature>`. Disables `MOCK_AI`, runs 2-3 real chats, logs `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`, `usage.input_tokens`, `usage.output_tokens`. NOT in CI (costs real API calls). Documented in the feature's vernissage report.

## Pipeline enforcement

Three layers block bad code from reaching `main`:

1. **Pre-push git hook** (`.husky/pre-push`) — blocks `git push` locally if any of these fail:
   - `pnpm tsc --noEmit` (typecheck all workspaces)
   - `pnpm test:unit` (Vitest)
   - `pnpm lint` (ESLint + Prettier check)
   - `pnpm test:e2e -- --project=mock-ui` (Cesare agentic mock E2E)

2. **GitHub Actions CI** (`.github/workflows/qa.yml`) — triggered on PR and push to `main`:
   - Job: typecheck workspaces
   - Job: vitest unit
   - Job: playwright mock-ui (`MOCK_AI=true`, test DB seeded)
   - Job: production build
   - Branch protection rule: merge blocked until all green.

3. **Orchestrator (Claude Code) policy** — after every feature agent commits, automatically spawns a QA-companion agent that writes the missing tests. The QA agent CANNOT commit unless its tests pass.

## Rules

- Every mutation must have at least one test (Vitest for logic, Playwright for UI)
- Pure functions get Vitest tests — don't spin up a browser to test a parser
- UI interactions and flows get Playwright tests — don't mock the DOM
- Run unit tests first (fast feedback), then E2E
- Trivial hotfixes (1-2 lines CSS, typos): exempt from levels 2-3
- Behaviour-preserving refactors: Vitest on touched pure functions + existing E2E must still pass
- Product features: all 3 levels mandatory (4 if Cesare)
- QA is skipped ONLY when the user explicitly says "skip QA for this"
