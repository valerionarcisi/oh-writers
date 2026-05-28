# Observability

Three orthogonal channels — do not mix them:

- **Traces → Langfuse** (via AI SDK `experimental_telemetry`): execution flow, tool call inputs/outputs, token counts, cache hits. AI-generated text (documents, rewrites) goes here as `generation.output` — never in logs.
- **Metrics → structured JSON** (`console.info(JSON.stringify({event, ...}))`): product-level counters. Events: `cesare.document.generated`, `cesare.scene_summary.generated`, `cesare.inline_edit.proposed`, `cesare.inline_edit.resolved`, `cesare.export.completed`, `cesare.tool_loop.max_steps_hit`.
- **Logs → Pino** (`~/server/logger`): system anomalies only. Four severity levels:
  - `DEBUG`: dev only, never prod
  - `INFO`: normal operations audit trail
  - `WARN`: recoverable anomalies (maxSteps hit, slow Anthropic response)
  - `ERROR`: failures requiring attention

Never log AI-generated text content in Pino — use Langfuse artifacts.
Never use `console.log` or `console.warn` — use `logger` from `~/server/logger`.
Never use `@anthropic-ai/sdk` directly in new code — use `generateText`/`streamText` from `"ai"` with `@ai-sdk/anthropic` provider. The raw SDK is still present for `llm-spoglio.server.ts` (breakdown) but is legacy.

## Local Langfuse — opt-in

The Langfuse stack is **not** part of the default dev infra. `pnpm dev:up`
only starts Postgres + Redis. Start Langfuse explicitly with
`pnpm dev:up:langfuse` when you actively need to inspect traces; stop it
with `pnpm dev:down:langfuse`. Langfuse containers are declared with
`restart: 'no'` so they do not auto-start on Docker Desktop / Mac boot —
this is intentional, to keep local resources free. When Langfuse is down,
the OTEL exporter silently no-ops; the app keeps working.
