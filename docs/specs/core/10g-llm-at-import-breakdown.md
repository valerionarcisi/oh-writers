# Spec 10g — LLM-at-import full breakdown (Sonnet full-script + Haiku per-scene)

> **Status:** open
> **Depends on:** Spec 10 (Breakdown), Spec 10c (Inline tagging), Spec 10e (Auto-spoglio regex), Spec 10f (Table view)
> **Date:** 2026-04-23

## Goal

Cambiare il motore primario dell'auto-spoglio: da "RegEx con Cesare on-demand" a "**Sonnet sull'intero copione all'import**, streaming scene-per-scena, persistito in DB". Il regex extractor (Spec 10e) resta come **fast baseline** che gira in <50ms al primo open, così la pagina non è mai vuota mentre l'LLM lavora. Quando l'utente edita una scena, **Haiku** fa l'incrementale solo su quella.

L'AD non clicca più "Suggerisci" per veder apparire il primo elemento — apre il progetto, vede già la tabella popolata. Il prodotto sembra "intelligente di default", come Filmustage / Largo.ai.

## Problema corrente

Il regex extractor (Spec 10e) ha un soffitto basso intrinseco: 182 lemmi IT hardcoded coprono "Non fa ridere" perché parla di pizza/microfoni/applausi, ma falliscono su qualunque altro genere (period drama, sci-fi, thriller). Il vocabolario di un film è **aperto** — una lista chiusa lo perderà sempre. Espanderla a 5.000 voci introduce esplosione di falsi positivi e cura-mensile insostenibile.

Cesare on-demand (Spec 10) compensa via Haiku, ma richiede al utente di cliccare "Suggerisci" per ogni scena — fastidio percepito alto, e l'utente nuovo non capisce che deve farlo.

## Decisioni chiave (approvate)

1. **Modello**: Sonnet 4 sul full-script all'import; Haiku 3.5 per gli incrementali per-scena.
2. **Trigger**: solo nuove versioni di sceneggiatura (manuale o import) + pulsante manuale "Ri-spogliare l'intera versione".
3. **Streaming**: scene popolate progressivamente nel BreakdownPanel mentre Sonnet scrive (non batch a fine corsa).
4. **Cesare manuale "Suggerisci"** sopravvive come fallback per ri-tentare una singola scena con Haiku.
5. **Tutto il codice in inglese** — `runFullSpoglio`, `streamSceneBreakdown`, mai `eseguiSpoglio`.

## Non-goals (Spec 10g)

- Niente fine-tuning di un modello dedicato (overkill per il volume).
- Niente embeddings / vector store per similarity search.
- Niente budget prediction nello stesso prompt (Spec 11 dedicato).
- Niente DOOD scheduling (Spec 12).
- Niente import Final Draft / Movie Magic (.fdx, .mmsp) — fountain stays the source of truth.
- Niente comparazione fra versioni di breakdown (covered da Spec 10 stale-awareness).
- **Niente lingua nel codice diversa dall'inglese** — la copy IT vive solo in `*.it.ts` o nei file UI.

## UX

### Import / nuova versione

```
[ User clicks "Save as v14" or imports a .fountain ]
        ↓
   ┌───────────────────────────────────┐
   │ Banner blu (cesare variant)       │
   │ ✨ Spoglio AI in corso — 12/47    │
   │    scene processate                │
   └───────────────────────────────────┘
        ↓
[ BreakdownPanel popola scene una alla volta ]
[ User can scroll, accept ghosts, edit anything immediately ]
        ↓ (after ~45s)
   ┌───────────────────────────────────┐
   │ ✓ Spoglio completato — 187        │
   │    elementi su 47 scene            │
   └───────────────────────────────────┘
```

Durante lo streaming:

- Le scene già processate mostrano i loro tag come oggi.
- Le scene in coda mostrano un piccolo `Skeleton` nello slot tag.
- Le scene del regex fast-baseline (gli stem IT che funzionano) appaiono **subito** in <50ms — l'utente vede già "qualcosa" mentre Sonnet processa.

### Per-scene edit (Haiku incrementale)

Quando l'utente edita una scena nello screenplay editor (con un debounce di 3s post-save), un Haiku per-scena gira automaticamente. Pattern identico a Spec 10c: ghost tags appaiono nel BreakdownPanel della scena affetta. Il pulsante manuale "Suggerisci" resta come fallback (forza re-run per la singola scena).

### Ri-spogliare manuale

Toolbar del BreakdownPage:

```
[Per scena] [Per progetto] [Matrice]   [Ri-spogliare con AI ▾] [Esporta ▾]
```

Il dropdown:

- "Ri-spogliare l'intera versione" (Sonnet, conferma con cost-estimate ~$0.08)
- "Solo le scene cambiate dall'ultimo spoglio" (Haiku batch, gratis-ish)

## Architecture

### Modello + costo

| Scope   | Model                       | Input ~tok | Output ~tok | Cost/run | Latency |
| ------- | --------------------------- | ---------- | ----------- | -------- | ------- |
| `full`  | `claude-sonnet-4-20250514`  | 12.000     | 3.000       | ~$0.08   | ~45s    |
| `scene` | `claude-haiku-3-5-20241022` | 300        | 200         | ~$0.0001 | ~1.5s   |

Numeri assumendo film di 90 pagine. Con prompt caching (5min TTL) sul system prompt + categories block (~3.000 token), il costo si dimezza per i primi 5 minuti dopo il primo run.

### Server (`features/breakdown/server/llm-spoglio.server.ts`) — NEW

```ts
type SpoglioScope = "full" | "scene";

const MODEL_FOR_SCOPE: Readonly<Record<SpoglioScope, string>> = {
  full: "claude-sonnet-4-20250514",
  scene: "claude-haiku-3-5-20241022",
};

export const streamFullSpoglio = createServerFn({ method: "POST" })
  .validator(
    z.object({
      versionId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, response }) => {
    await requireUser();
    const db = await getDb();

    // 1) Cache check by text_hash (existing pattern from Spec 10e).
    const cached = await db.query.breakdownVersionState.findFirst({
      where: eq(breakdownVersionState.versionId, data.versionId),
    });
    if (cached?.lastFullSpoglioRunAt && cached.modelUsed === "sonnet-4") {
      // Already done for this exact text — short-circuit.
      return ok({ skipped: true, reason: "cached" });
    }

    // 2) Stream scene-by-scene from Anthropic.
    const stream = await anthropic.messages.stream({
      model: MODEL_FOR_SCOPE.full,
      // ... prompt with full screenplay + structured output schema ...
    });

    // 3) Persist each scene as it arrives. ws-server pushes Yjs awareness
    //    update so connected editors see ghosts populate live.
    for await (const sceneResult of parseSceneStream(stream)) {
      await persistOccurrencesForScene(db, sceneResult);
      publishSpoglioProgress({
        versionId: data.versionId,
        scenesDone: sceneResult.index + 1,
        scenesTotal: sceneResult.total,
      });
    }

    return ok({ scenesProcessed: sceneResult.total });
  });
```

The server function returns a `ResultAsync` shape; the streaming side-effects flow through the existing ws-server channel (already used for Yjs awareness).

### Client streaming hook (polling — MVP)

There is no ws-server / pub-sub channel in the codebase today. For MVP we
poll a lightweight progress endpoint every 1.5 s while a run is active —
same pattern already used by `useBreakdown`. Real streaming via SSE is
deferred to Spec 10g.1 once a multi-instance ws-server lands.

```ts
// features/breakdown/hooks/useFullSpoglioProgress.ts
export const useFullSpoglioProgress = (versionId: string) =>
  useQuery({
    queryKey: ["spoglio-progress", versionId] as const,
    queryFn: () =>
      unwrapResult(await getSpoglioProgress({ data: { versionId } })),
    refetchInterval: (q) => (q.state.data?.isComplete ? false : 1500),
    staleTime: 0,
  });
```

The server fn `getSpoglioProgress` reads `breakdownVersionState` +
counts persisted occurrences and returns `{ scenesDone, scenesTotal,
isComplete, modelUsed }`. The `BreakdownPage` shows the progress banner
based on this; the per-scene panel is unaffected (it reads occurrences
from DB via the existing `breakdownForSceneOptions`, which we invalidate
on every poll tick that returns new progress).

### Schema delta

`breakdown_version_state` does not exist yet (Spec 10e introduced
`breakdown_scene_state` only). We create a per-version companion table:

```sql
CREATE TABLE breakdown_version_state (
  version_id UUID PRIMARY KEY REFERENCES screenplay_versions(id) ON DELETE CASCADE,
  last_full_spoglio_run_at TIMESTAMPTZ NULL,
  model_used TEXT NULL,        -- "regex" | "sonnet-4" | "haiku-3-5"
  scenes_total INT NULL,
  scenes_done INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`model_used` tells us which engine produced the persisted occurrences;
`scenes_done` / `scenes_total` drive the polling progress UI without
needing a count(\*) on `breakdown_occurrences` per tick.

### Prompt structure (Sonnet full-script)

```
[SYSTEM, cached]
You are Cesare, an AD assistant. You read a full screenplay and produce
a per-scene breakdown of physical elements.

Categories: cast, extras, stunts, props, vehicles, wardrobe, makeup,
            sfx, vfx, sound, animals, atmosphere, set_dress,
            equipment, locations.

For each scene return JSON:
{ sceneNumber, items: [{name, category, quantity, confidence}] }

Confidence: 0.0–1.0. Items with confidence < 0.6 are emitted as
"pending" ghosts; ≥ 0.6 as "accepted".

Rules:
- Names in Title Case, language matches the screenplay.
- Quantity = number of distinct mentions in that scene.
- Skip body parts, food/drink (set dressing), clothing (wardrobe).
- For cast, only characters with dialogue or named description.

[USER, per request]
SCREENPLAY:
<full fountain text>

OUTPUT JSON ARRAY, one object per scene, in scene order.
```

Structured output enforced via Anthropic's tool-use schema (no free-form parsing).

### Determinism + caching

| Layer                   | Mechanism                                     | Re-runs only when                         |
| ----------------------- | --------------------------------------------- | ----------------------------------------- |
| `text_hash` per scene   | already in `breakdown_scene_state`            | scene body changes                        |
| `text_hash` per version | new column on `breakdown_version_state`       | full screenplay changes (new version row) |
| Anthropic prompt cache  | 5 min TTL on system block                     | — (server side, automatic)                |
| Mock mode               | `MOCK_AI=true` returns deterministic fixtures | always in CI                              |

Production runtime is deterministic per `text_hash`: a re-open of the same version reads occurrences from DB without calling the LLM.

### Fallback offline

If Anthropic is unreachable when the user imports:

1. Regex baseline (Spec 10e) runs and lands occurrences as today.
2. Banner shows: "Spoglio AI non disponibile, eseguito spoglio rapido. Riprova manualmente quando torna online."
3. The version is marked `model_used = "regex"`; the user can later trigger Sonnet manually.

The regex extractor stays valuable purely as a fallback / first-50ms preview, not as the primary engine.

## Componenti DS

**Esistenti** (riuso, nessun nuovo atomo):

- `[EXISTING DS]` `Banner` (variant=cesare), `Skeleton`, `Button`, `DropdownMenu`, `Toast`.

**Nuovi** in `packages/ui/src/components/`:

- `[NEW DS]` `Progress` — barra deterministica `value/max`, `role="progressbar"` con ARIA, animazione CSS only, rispetta `prefers-reduced-motion`. Atomico, riusabile ovunque ci sia avanzamento determinato.
- `[NEW DS]` `StreamingProgressBanner` — composizione di `Banner` (variant cesare) + `Progress` + label "X/Y scene processate" + opzionale `onCancel`. Riusabile per future operazioni stream-based.

Decisione DS-first: prima i due atomi isolati con test Vitest (props, ARIA, range clamp), poi composizione nel feature folder.

## Tests

### Unit (Vitest)

- `llm-spoglio.server.test.ts` — mock Anthropic stream, assert: scene parsing, caching short-circuit, ws-server publish per ogni scena.
- `parseSceneStream.test.ts` — pure function, JSON Lines parsing, error recovery (malformed scene → skip + log, don't crash).
- `MOCK_AI` fixture per "Non fa ridere" full → produces 47 scene results deterministicamente.

### Server (Vitest)

- Cache hit by `text_hash`: chiamata identica → niente fetch Anthropic, costo 0.
- Concurrent calls per stesso `versionId`: solo una gira (lock via `SELECT FOR UPDATE`).
- Modello downgrade: se Sonnet già girato e l'utente chiede Haiku → no-op (Sonnet è superset).

### E2E (Playwright)

`tests/breakdown/llm-import-spoglio.spec.ts`:

- `[OHW-330]` Import .fountain → vedo banner "Spoglio AI in corso — N/M" → BreakdownPanel popola incrementally → completion toast.
- `[OHW-331]` Cache hit: re-open stessa versione → niente banner, occurrences già presenti.
- `[OHW-332]` Per-scena edit: modifico scena 3 → debounce 3s → Haiku re-spogliare scena 3 → ghost tag aggiornato.
- `[OHW-333]` Ri-spogliare manuale full: dropdown → conferma → Sonnet rigira → tutti gli accepted/ignored umani sopravvivono (non vengono sovrascritti).
- `[OHW-334]` Anthropic down (mock 503): regex fallback parte, banner "Spoglio AI non disponibile", tag regex visibili.
- `[OHW-335]` MOCK_AI=true in CI: deterministic 47-scene output per "Non fa ridere", asserzioni sui 187 items attesi.

## Migration & rollout

- Migration `0011_add_breakdown_version_state.sql` — crea `breakdown_version_state` con `versionId UUID PRIMARY KEY`, `lastFullSpoglioRunAt TIMESTAMPTZ NULL`, `modelUsed TEXT NULL`, `scenesTotal INT NULL`, `scenesDone INT NOT NULL DEFAULT 0`. Additiva, non breaking.
- **Feature flag = env var** `LLM_FIRST_BREAKDOWN=true` (stesso pattern di `MOCK_AI`). Nessun registry: il flag non vive in DB né in user settings.
  - ON in deploy → import e nuove versioni triggerano Sonnet via `streamFullSpoglio`.
  - OFF (default) → comportamento identico a Spec 10e (regex baseline + Cesare on-demand).
- I 2 design partner ricevono un deploy con il flag attivo. Quando OHW-330..335 sono verdi su CI per 2 settimane, rimuoviamo il flag e il code path "off" insieme.

## Cost monitoring

Server-side telemetry per ogni run:

```ts
logSpoglioRun({
  versionId,
  model: "sonnet-4",
  inputTokens,
  outputTokens,
  cachedTokens,
  costUsd,
  durationMs,
  scenesProcessed,
});
```

Dashboard interno (futuro Spec) mostrerà cost/film/utente per identificare anomalie (es. user che ri-spoglia 50 volte lo stesso script).

## Out of scope

- Streaming dal client direttamente ad Anthropic (no — la chiave API resta server-side, sempre).
- Custom prompt-engineering per genere di film (potenziale v2 — un thriller ha priorità diverse di un period drama).
- Embedding-based similarity per nominare elementi consistenti cross-version (es. "la pistola della v12 è la stessa della v13?") — futuro Spec 10h.
- Cesare conversational chat (mai stato lo scope di Cesare — vedi feedback "controllore garbato").
- LLM per estrarre budget / DOOD / schedule.

## Prerequisites

- `[NEW DS]` `Progress` (atomo) + `StreamingProgressBanner` (composizione).
- `[EXISTING DS]` `Banner`, `Skeleton`, `Button`, `DropdownMenu`, `Toast`.
- Anthropic SDK già in dipendenze (`@anthropic-ai/sdk@0.65.0` verificato).
- Polling endpoint `getSpoglioProgress` invocato via React Query (no ws-server in MVP — vedi Spec 10g.1 futura).
- Migration `0011_add_breakdown_version_state.sql` (nuova tabella).
- Env var `LLM_FIRST_BREAKDOWN` (no feature-flag registry).

## Resolved decisions

(Closed 2026-04-23 — defaults approvati)

1. **Backfill progetti pre-flag** → **on-demand** (nessun re-spoglio automatico al primo open; l'AD usa "Ri-spogliare con AI" se vuole). Evita costi a sorpresa per progetti riaperti dopo mesi.
2. **Hard cap costi per utente/mese** → **nessuna quota in MVP**. Monitoriamo costi 1 mese via tabella `breakdown_version_state.model_used` + log Anthropic, poi revisione.
3. **Cesare manuale fallback** → **sempre visibile**, indipendente da confidence score. L'AD ha sempre il diritto di forzare un re-pass o un'estrazione manuale.

## Implementation status (2026-04-23)

**Landed:**

- DS atoms: `Progress` + `StreamingProgressBanner` with pure-math extraction (`progress-math.ts`) and 8 unit tests.
- Schema: migration `0011_add_breakdown_version_state.sql` + `breakdownVersionState` Drizzle pgTable.
- Errors: `BreakdownVersionNotFoundError` + `LlmSpoglioFailedError` in `breakdown.errors.ts`.
- Streaming parser: `parse-scene-stream.ts` — string-aware brace counter that yields complete scene objects from a partial JSON tool_use buffer; 11 unit tests cover empty, partial, complete, multiple scenes, cursor advancement, escaped quotes, malformed-skip, whitespace.
- Prompt + tool definition: `llm-spoglio-prompt.ts` with `SONNET_MODEL`, `HAIKU_MODEL`, `statusForConfidence` mapping; 4 unit tests.
- Server: `streamFullSpoglio` createServerFn — feature-flag gate, access check, cache short-circuit on `lastFullSpoglioRunAt`, scene fan-out via `sceneIdByNumber`, per-scene transactional persistence via `persistSceneItems`, progress bumps on `breakdownVersionState`. `getSpoglioProgress` createServerFn polled by client.
- MOCK_AI fixture: `mockFullScriptBreakdown` (CAPS-derived cast + Bottiglia prop on bottle mention); 4 unit tests.
- Client hooks: `useStreamFullSpoglio`, `useSpoglioProgress` with `refetchInterval` that disables on `isComplete`.
- BreakdownPage wiring: mount-time fire of `llmSpoglio.mutate()` (guarded by `llmSpoglioStartedRef`), `StreamingProgressBanner` driven by polling, "Ri-spogliare con AI ▾" dropdown next to Export with cost-confirm prompt.
- E2E (`tests/breakdown/llm-import-spoglio.spec.ts`): 4 active UI-affordance tests (dropdown visible/operable for editor, dropdown opens, viewer cannot see it, banner stays hidden when flag off) — all green. OHW-330..335 round-trip tests are scaffolded as `.skip` with explanatory comments.

**Deferred to a follow-up slice (Spec 10g.2):**

- Haiku per-scene incremental re-spoglio on edit debounce (test OHW-332).
- Round-trip MOCK_AI=true E2E suite (OHW-330, 331, 333, 335) — blocked on a dedicated Playwright web-server config that injects `MOCK_AI=true` and `LLM_FIRST_BREAKDOWN=true` (the current `playwright.config.ts` cannot toggle env per test).
- Anthropic 5xx route-mock harness for OHW-334.
- Cost-monitoring `logSpoglioRun` telemetry sink — server fn currently records `modelUsed` on the state row but does not yet emit token/cost metrics.
