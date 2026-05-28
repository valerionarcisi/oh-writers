# Mock Mode

- `MOCK_AI=true` → AI responses from `mocks/ai-responses.ts`, no Anthropic API calls
- `MOCK_AI=true` also activates the Cesare agentic tool-loop mock: the
  Anthropic SDK is swapped for a scripted client defined in
  `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts`.
  Scenarios are keyed by a regex against the last user message and emit
  `tool_use` blocks the real executors then run against the test DB.
  Placeholders like `{{REQ_ID}}` in scripted inputs are substituted from a
  per-test context map seeded via `POST /api/test/mock-context` (helper:
  `tests/helpers/cesare.ts → setMockContext`). The Playwright config sets
  `MOCK_AI=true` for the test web server.
- All server functions require a real PostgreSQL database — no mock API layer
