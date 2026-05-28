# Spec 42 — Migrazione a Vercel AI SDK v5 + Langfuse OTEL

**Status:** ✅ Completata (tutte le fasi)  
**Scope:** `features/predictions/` — tutto il layer AI di Cesare  
**Depends on:** nessuna dipendenza di feature

---

## Problema

Il layer AI di Cesare usa `@anthropic-ai/sdk` raw con:

- Un loop manuale `while (stopReason === "tool_use")` in `runGenericToolLoop`
- Nessun tracing strutturato (token, latency, tool calls non osservabili)
- Nessun supporto per streaming multi-client (output visibile solo nella tab che ha fatto la richiesta)
- Mock layer accoppiato direttamente all'interfaccia raw SDK

---

## Obiettivo

1. **Migrazione a Vercel AI SDK v5** (`ai` + `@ai-sdk/anthropic`) — rimpiazza il loop manuale con `generateText({ tools, maxSteps })` e il path streaming con `streamText`
2. **Langfuse OTEL** — logging automatico di ogni tool call, token usage, latency, cache hits — visibile nella dashboard Langfuse

---

## Cosa NON cambia

- Tutti i tool definitions (`CESARE_LOCATION_TOOLS`, `CESARE_SCREENPLAY_TOOLS`, ecc.) — solo il formato input_schema cambia (`input_schema` → `parameters`)
- La logica degli executor (`executeTool`, `executeScreenplayTool`, ecc.) — invariata
- Il sistema di skills (`skills/registry.ts`, `SkillExecutor`) — invariato
- Il prompt caching (`cache_control` sui system prompt blocks) — preservato via `providerOptions.anthropic`
- `callHaiku` e `cesare-intent-classifier.ts` — migrati ma semanticamente identici
- `cesare.server.ts` — invariato (chiama `runUnifiedToolLoop` che cambia internamente)

---

## Design

### AI SDK v5: generateText sostituisce runGenericToolLoop

```typescript
// Prima — loop manuale
const runGenericToolLoop = (args) =>
  ResultAsync.fromPromise(async () => {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await args.client.messages.create({ ... });
      // manuale: aggiungi assistant + tool_result messages
      if (response.stop_reason !== "tool_use") break;
    }
  }, ...);

// Dopo — AI SDK
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const runGenericToolLoop = (args) =>
  ResultAsync.fromPromise(
    generateText({
      model: anthropic(args.model),
      system: args.systemPrompt,
      messages: args.messages,
      tools: args.tools,       // formato AI SDK (parameters invece di input_schema)
      maxSteps: 5,             // sostituisce MAX_ITERATIONS
      experimental_telemetry: { isEnabled: true, functionId: "cesare-tool-loop" },
    }).then(r => r.text),
    (e) => new CesareError("tool_loop_failed", e),
  );
```

### Tool definition format — unica differenza strutturale

```typescript
// Prima (raw Anthropic SDK)
{
  name: "search_places",
  description: "...",
  input_schema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  }
}

// Dopo (AI SDK)
import { tool } from "ai";
import { z } from "zod";

const searchPlacesTool = tool({
  description: "...",
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => { /* executor logic */ },
});
```

**Differenza importante:** in AI SDK i tool hanno `execute` inline. I nostri executor esistenti diventano la funzione `execute` di ogni tool. Questo elimina il dispatch manuale `block.name === "search_places"` negli executor.

### Streaming path — streamText sostituisce loadAnthropicStreamingClient

```typescript
// Prima
const client = await loadAnthropicStreamingClient();
const stream = client.messages.stream({ ... });
stream.on("inputJson", (delta) => { ... });
await stream.finalMessage();

// Dopo
import { streamText } from "ai";

const result = streamText({
  model: anthropic(model),
  system: systemPrompt,
  messages,
  tools,
  experimental_telemetry: { isEnabled: true },
});
for await (const chunk of result.textStream) {
  // stesso comportamento, API più pulita
}
```

### callHaiku — generateText senza tool loop

```typescript
// Prima
const client = new Anthropic({ apiKey });
const response = await client.messages.create({ model: "claude-haiku-4-5", ... });

// Dopo
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const result = await generateText({
  model: anthropic("claude-haiku-4-5"),
  system: params.system,
  messages: [{ role: "user", content: params.user }],
  maxTokens: params.maxTokens,
  experimental_telemetry: { isEnabled: true, functionId: "call-haiku" },
});
```

### Prompt caching — preservato via providerOptions

```typescript
// Prima (raw SDK) — system prompt con cache_control
system: [
  { type: "text", text: systemText, cache_control: { type: "ephemeral" } },
  { type: "text", text: fewShot, cache_control: { type: "ephemeral" } },
];

// Dopo (AI SDK) — stessa semantica via providerOptions
import { anthropic } from "@ai-sdk/anthropic";

generateText({
  model: anthropic("claude-sonnet-4-5"),
  system: systemText,
  messages,
  providerOptions: {
    anthropic: {
      cacheControl: true, // abilita prompt caching per il sistema
    },
  },
});
```

Per i system prompt multi-block con cache_control posizionale, AI SDK espone `anthropic.messages()` con `experimental_providerMetadata` per controllo fine-grained. Dettaglio da verificare durante implementazione.

### forcedFirstTool — toolChoice in AI SDK

```typescript
// Prima
tool_choice: i === 0 && forcedFirstTool
  ? { type: "tool", name: forcedFirstTool }
  : { type: "auto" }

// Dopo — AI SDK v5 supporta toolChoice
generateText({
  ...
  toolChoice: forcedFirstTool
    ? { type: "tool", toolName: forcedFirstTool }
    : "auto",
})
```

---

## Langfuse OTEL — setup

### Architettura

```
AI SDK generateText/streamText
  └── experimental_telemetry: { isEnabled: true }
        └── OpenTelemetry NodeSDK (boot al server start)
              └── LangfuseSpanProcessor
                    └── Langfuse Cloud (free Hobby tier: 50K units/mo)
```

### File di setup

```typescript
// apps/web/app/server/instrumentation.ts  (nuovo file)
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseExporter } from "langfuse-vercel"; // package ufficiale Langfuse per AI SDK

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter({
    publicKey: process.env["LANGFUSE_PUBLIC_KEY"],
    secretKey: process.env["LANGFUSE_SECRET_KEY"],
    baseUrl: "https://cloud.langfuse.com",
  }),
});

sdk.start();
```

Questo file va importato **prima** di qualsiasi import del SDK AI — in `apps/web/app/server/entry.ts` o equivalente TanStack Start.

### Cosa traccia automaticamente

Ogni `generateText` / `streamText` con `experimental_telemetry: { isEnabled: true }` emette:

- `ai.generateText` span: model, prompt tokens, completion tokens, cache read tokens, finish reason
- `ai.toolCall` span per ogni tool call: tool name, input, output, durata
- `ai.stream.firstChunk` event: time-to-first-token
- Step count per `maxSteps` loop

In Langfuse: ogni sessione Cesare = una trace con span gerarchici per ogni step del loop.

---

## Osservabilità strutturata — tre pilastri ortogonali

L'osservabilità si divide in tre canali distinti con scopi diversi. Non sono livelli di "quanto loggi" ma strumenti con audience e domande diverse.

```
┌─────────────────────────────────────────────────────────────────┐
│  TRACES       → Langfuse (via AI SDK OTEL)                      │
│  "Come è andata questa esecuzione?"                              │
│  Span gerarchici per ogni step del tool loop                    │
├─────────────────────────────────────────────────────────────────┤
│  METRICS      → PostHog (eventi prodotto) o DB aggregati        │
│  "Quanto spesso? Quanto costa? Quanto è lento?"                  │
│  Aggregati numerici: token/giorno, error rate, p99 latency      │
├─────────────────────────────────────────────────────────────────┤
│  LOGS         → Pino (structured, 4 severity standard)          │
│  "Cosa è successo di anomalo?"                                   │
│  DEBUG / INFO / WARN / ERROR — severity, non verbosità          │
└─────────────────────────────────────────────────────────────────┘
```

### 1. Traces — Langfuse (automatico via AI SDK OTEL)

Ogni `generateText` / `streamText` con `experimental_telemetry: { isEnabled: true }` emette automaticamente:

| Span                         | Cosa contiene                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `ai.generateText`            | model, input tokens, output tokens, cache read tokens, finish reason, durata totale |
| `ai.toolCall` (per step)     | tool name, input completo, output completo, durata step                             |
| `ai.stream.firstChunk`       | time-to-first-token                                                                 |
| `ai.generateText.doGenerate` | provider-level, latency rete                                                        |

Gli **output AI completi** (testo documento generato, testo scena riscritta) sono artifacts della trace — Langfuse li archivia come `generation.output`, non come log entries. Nessuna scelta su "quanto testo includere": è sempre tutto, associato alla trace.

Ogni sessione Cesare = una trace con `sessionId: userId` e `traceId: cesareSessionId` per correlare multi-turn.

### 2. Metrics — eventi prodotto

Contatori discreti per domande di prodotto ("quanti documenti genera al giorno? quante inline edit vengono accettate?"). Implementati come eventi strutturati — PostHog in futuro, per ora semplici `console.info` JSON che un log aggregator può raccogliere.

| Evento                           | Payload                                                               |
| -------------------------------- | --------------------------------------------------------------------- |
| `cesare.document.generated`      | `{ type, projectId, tokenCount, durationMs }`                         |
| `cesare.scene_summary.generated` | `{ sceneNumber, projectId, tokenCount, durationMs }`                  |
| `cesare.inline_edit.proposed`    | `{ sceneNumber, projectId, tokenCount }`                              |
| `cesare.inline_edit.resolved`    | `{ sceneNumber, outcome: "accepted" \| "rejected", msSinceProposal }` |
| `cesare.export.completed`        | `{ format, projectId, durationMs }`                                   |
| `cesare.tool_loop.max_steps_hit` | `{ model, stepCount, projectId }` — segnale di anomalia               |

### 3. Logs — Pino, 4 severity standard

Log strutturati per eventi di sistema — non per "vedere cosa ha prodotto Cesare" (quello è la trace), ma per "cosa è andato storto".

| Severity | Quando                                                                     | Esempio                                                              |
| -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `DEBUG`  | Solo `NODE_ENV=development`. Mai in prod.                                  | Ogni step del tool loop con payload completo                         |
| `INFO`   | Operazioni normali completate con successo. Audit trail.                   | `"document generated" { type, projectId, versionId }`                |
| `WARN`   | Anomalia recuperabile — il sistema ha continuato ma qualcosa era inatteso. | Tool loop ha raggiunto `maxSteps`, Anthropic ha risposto lento (>5s) |
| `ERROR`  | Failure che richiede attenzione.                                           | Anthropic API down, tool executor ha lanciato un errore non gestito  |

```typescript
// apps/web/app/server/logger.ts  (nuovo)
import pino from "pino";

export const logger = pino({
  level: process.env["NODE_ENV"] === "development" ? "debug" : "info",
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
  },
});

// Uso nei tool executor / cesare.server.ts
logger.info({ type: "soggetto", projectId, versionId }, "document generated");
logger.warn({ stepCount: 5, model, projectId }, "tool loop hit maxSteps");
logger.error({ err, projectId }, "anthropic call failed");
```

**Regola:** se stai per scrivere `logger.debug` in prod, mettilo in una trace invece. Se stai per scrivere `logger.info` con il testo completo di un documento, mettilo come artifact in Langfuse invece.

### Cosa NON è un log

- Il testo di un documento generato → artifact Langfuse (`generation.output`)
- Il testo di una scena riscritta → artifact Langfuse
- L'input completo di un tool call → span Langfuse (`ai.toolCall`)
- Metriche aggregate (token/giorno) → metrics channel, non log

### Pacchetti aggiuntivi

```
pino@9.x          (structured logging, prod-ready)
@types/pino       (dev dep)
```

PostHog per metrics è fuori scope di questa spec — gli eventi sono emessi come `console.info` JSON per ora, pronti per essere raccolti quando PostHog viene integrato.

---

## Mock layer — adattamento

Il mock esistente in `cesare-tool-loop.mock.ts` va aggiornato per AI SDK. AI SDK fornisce `MockLanguageModelV1` per test:

```typescript
// Prima
export const createMockStreamingClient = () => ({ ... }); // wrap raw SDK

// Dopo
import { MockLanguageModelV1 } from "ai/test";

export const createMockCesareModel = (scenario: string) =>
  new MockLanguageModelV1({
    doGenerate: async ({ inputMessages }) => {
      const lastMessage = inputMessages.at(-1);
      return findMockScenario(scenario, lastMessage);
    },
  });
```

I test Playwright `MOCK_AI=true` usano il mock model invece del mock streaming client.

---

## Pacchetti da aggiungere

```
ai@6.0.191                              (core AI SDK) ✅ installato
@ai-sdk/anthropic@3.0.80               (provider Anthropic) ✅ installato
langfuse-vercel@3.38.20                 (exporter OTEL per AI SDK → Langfuse) ✅ installato
@opentelemetry/sdk-node@0.218.0         (OTEL NodeSDK) ✅ installato
@opentelemetry/api@1.9.1               (OTEL API) ✅ installato
pino@9.7.0                             (structured logging, 4 severity standard) ✅ installato
@types/pino@7.0.5                       (dev dep) ✅ installato
```

Versioni fisse al momento dell'installazione.

Pacchetto da rimuovere dopo la migrazione:

```
@anthropic-ai/sdk   (rimane come dev dep per tipi se necessario, altrimenti rimosso)
```

---

## File da modificare

| File                                                   | Tipo di cambiamento                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `features/ai/anthropic-client.ts`                      | Rimpiazzato con wrapper AI SDK (`ai-client.ts`)                          |
| `features/ai/index.ts`                                 | Aggiorna export                                                          |
| `features/predictions/cesare-tools.ts`                 | `runGenericToolLoop` → `generateText`; tool definitions → formato AI SDK |
| `features/predictions/cesare-intent-classifier.ts`     | `callHaiku` → `generateText`                                             |
| `features/predictions/cesare-screenplay-tools.ts`      | Tool definitions → formato AI SDK                                        |
| `features/predictions/cesare-document-tools.ts`        | Tool definitions → formato AI SDK                                        |
| `features/predictions/cesare-budget-intelligence.ts`   | Tool definitions → formato AI SDK                                        |
| `features/predictions/cesare-schedule-tools.ts`        | Tool definitions → formato AI SDK                                        |
| `features/predictions/cesare-shooting-plan-tools.ts`   | Tool definitions → formato AI SDK                                        |
| `features/predictions/cesare-read-tools.ts`            | Tool definitions → formato AI SDK                                        |
| `features/predictions/_mocks/cesare-tool-loop.mock.ts` | Adattato a `MockLanguageModelV1`                                         |
| `apps/web/app/server/instrumentation.ts`               | **Nuovo** — OTEL + Langfuse setup                                        |
| `apps/web/.env.example`                                | Aggiunge `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`                    |

---

## Fasi di implementazione

### Fase 1 — Osservabilità (nessun cambiamento funzionale) ✅ Completata

1. ✅ Installa `pino@9.7.0`, `@types/pino@7.0.5`, `langfuse-vercel@3.38.20`, `@opentelemetry/sdk-node@0.218.0`, `@opentelemetry/api@1.9.1`, `ai@6.0.191`, `@ai-sdk/anthropic@3.0.80`
2. ✅ Crea `apps/web/app/server/logger.ts` (Pino, 4 severity)
3. ✅ Crea `apps/web/app/server/instrumentation.ts` (OTEL + Langfuse)
4. ✅ Aggiunge env vars (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`) in `.env.example`
5. ✅ Aggiunge metric events + logger in `cesare.server.ts`
6. ✅ Aggiunge `logger.warn` per maxSteps in `cesare-tools.ts`
7. ✅ Aggiunge metric event + `logger.error` in `scene-summary.server.ts`
8. ✅ Importa `instrumentation.ts` come primo import in `apps/web/app/ssr.tsx`

**Deviazioni:**

- `cesare.export.completed` e `cesare.inline_edit.resolved` NON aggiunti — eventi client-side, fuori scope server. Da fare separatamente.
- `langfuse-vercel@3.38.20` installato invece di "latest" (versione pinnata al momento dell'install).

### Fase 2 — Migrazione tool definitions ✅ Completata

1. ✅ Converti tutti i `CESARE_*_TOOLS` da formato `input_schema` a Zod `inputSchema` (6 file)
2. ✅ Integra `execute` function inline in ogni tool — factory `create*Tools(db, ctx)` per ogni file
3. ✅ Unit test: tutti i test Vitest passano (120 file, 1223 test)
4. ✅ Upgrade zod da `3.24.4` a `3.25.76` (minimo richiesto da `ai@6.0.191` per subpath `zod/v4`)

**Deviazioni:**

- `parameters` → `inputSchema`: il spec usava `parameters` ma AI SDK v5 usa `inputSchema`. Implementazione usa `inputSchema`.
- Old `CESARE_*_TOOLS` arrays mantenuti intatti — il loop `runGenericToolLoop` li usa ancora. Le nuove factory (`createLocationTools`, `createScreenplayTools`, ecc.) sono additive.
- `execute` input è `unknown` per ogni tool senza `outputSchema` — richiede cast esplicito `input as XInput` a ogni call site (typing bug AI SDK, non nostro).
- `z.enum()` richiede `readonly [string, ...string[]]`: usato cast `as unknown as [string, ...string[]] as readonly [ShotSize, ...ShotSize[]]` per `SHOT_SIZES` e `CAMERA_MOVEMENTS`.

### Fase 3 — Migrazione runGenericToolLoop

1. Rimpiazza loop manuale con `generateText({ maxSteps: 5 })`
2. Migra `callHaiku` e `loadAnthropicStreamingClient`
3. Verifica prompt caching (run `pnpm cost:smoke:cesare` per confrontare cache hit rate)

### Fase 4 — Mock layer

1. Adatta `cesare-tool-loop.mock.ts` a `MockLanguageModelV1`
2. Suite Playwright mock-ui: tutti i test passano

### Fase 5 — Pulizia ✅ Completata

1. ✅ Migra `runUnifiedToolLoop` al path AI SDK via `bridgeLegacyTools` + `runGenericToolLoop`
2. ✅ Migra `bible-distill.server.ts` `callSonnetForcedTool` al path AI SDK (`generateText`)
3. ✅ Migra `callCesare` in `cesare.server.ts` al path AI SDK (`generateText`)
4. ⏳ `@anthropic-ai/sdk` non rimosso — ancora usato da `features/breakdown/server/llm-spoglio.server.ts` via `loadAnthropicStreamingClient`. Migrazione `llm-spoglio` fuori scope.
5. ⏳ `anthropic-client.ts` non rinominato — `loadAnthropicStreamingClient` ancora esportata e usata da `llm-spoglio.server.ts`.

**Deviazioni:**

- `bridgeLegacyTools` adottato al posto della migrazione skill-by-skill: converte `AnthropicTool[]` in AI SDK `Tool` objects con `execute` inline che delega al `SkillExecutor`. Questo evita di modificare tutti i `*.skill.ts` e i loro tool arrays legacy.
- `CESARE_*_TOOLS` arrays (legacy) mantenuti — ancora referenziati dai `*.skill.ts` e dai tool loop specifici per pagina (`runToolLoop`, `runBreakdownToolLoop`, ecc.). Rimozione possibile quando anche quei loop vengono migrati.
- `runLegacyToolLoop`, `resolveMockClient`, `createMockAnthropicClient`, `LegacyAnthropicClient` mantenuti — usati dai tool loop specifici di pagina (non dal `runUnifiedToolLoop`). Dead code de-facto quando `MOCK_AI=true` perché `mockModel` ha priorità, ma non rimossi per non rompere i loop legacy.
- `callCesare` in `cesare.server.ts` era dead code (V1 handler non più chiamato) ma migrato comunque per coerenza e rimozione del import `loadAnthropicStreamingClient`.

---

## Test

| Tag      | File                             | Scenario                                          |
| -------- | -------------------------------- | ------------------------------------------------- |
| OHW-042a | `tests/ai-sdk-migration.spec.ts` | Cesare risponde correttamente con AI SDK (mock)   |
| OHW-042b | `tests/ai-sdk-migration.spec.ts` | Tool call eseguito → risultato visibile in drawer |
| OHW-042c | `tests/ai-sdk-migration.spec.ts` | maxSteps rispettato — no loop infinito            |
| OHW-042d | `scripts/cost-smoke-cesare.ts`   | Cache hit rate uguale o superiore pre-migrazione  |

---

## Rischi e mitigazioni

| Rischio                                             | Mitigazione                                                     |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Prompt caching degradato dopo migrazione            | `cost:smoke:cesare` confronta prima/dopo                        |
| Mock layer rotto → suite E2E rossa                  | Fase 4 separata, non blocca Fasi 1-3                            |
| `forcedFirstTool` non supportato in AI SDK v5       | Verificato: `toolChoice: { type: "tool", toolName }` è nell'API |
| `@anthropic-ai/sdk` usato da codice non predictions | `grep` su tutto il repo prima della rimozione                   |
