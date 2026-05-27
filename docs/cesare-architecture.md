# Cesare — Agentic architecture

State of the art of the universal AI assistant in Oh Writers. Describes the design of the runtime, RAG, propose/accept, cost optimization, and testing layers. Reference for anyone extending or debugging Cesare.

Last updated: 2026-05-19 (Wave 1 — cost-saving foundation + vernissage tooling).

---

## TL;DR

Cesare is a **tool-using agent** on Claude models (Sonnet 4.6 + Haiku 4.5) with:

- **Structured RAG** over PostgreSQL (no vector store)
- **Tool loop** with max 5 iterations, dynamic dispatch per page
- **Propose/accept pattern** (Wave 2) for reversible text mutations
- **3 cost layers**: native Anthropic prompt caching, lazy RAG via read-tools, model tier router
- **Mock framework** for deterministic E2E tests at zero cost

The domain (a single feature film) is small enough that we don't need embeddings, fine-tuning, vector search, or external orchestrators (LangChain/LlamaIndex). A single loop in TypeScript + the Anthropic SDK is enough.

---

## 1. Agentic runtime — the tool loop

### Anatomy of a request

```
Client (CesareSheet.tsx)
  ↓ POST askCesare({ projectId, message, pageContext, conversationHistory })
Server (cesare.server.ts → handleAskCesare)
  ↓ routeModel(message, page, convLen) → "haiku" | "sonnet"  (Layer 3)
  ↓ assembleContext(db, projectId, pageContext)             (Layer 2: lean)
  ↓ buildSystemPrompt(ctx, page) → SystemPromptBlock[]     (Layer 1: cached blocks)
  ↓ callCesareWith<Page>Tools(systemBlocks, history, msg, model)
    ↓ runGenericToolLoop({ client, system, messages, tools, executor, ... })
      ↓ for i in 1..MAX_ITERATIONS (5):
          response = client.messages.create({ model, system, tools, messages })
          if response.stop_reason === "tool_use":
            for each tool_use block:
              result = executor(block, db, projectId)
              append tool_result
            continue
          else:
            break (Cesare emitted the final text)
      ↓ return finalText + "<!--ohw:tools=N-->"
```

### Key files

| File                                                                | Role                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web/app/features/predictions/cesare.server.ts`                | Orchestration: Zod validation, context assembly, page routing, dispatch to the loop              |
| `apps/web/app/features/predictions/cesare-tools.ts`                 | Tool definitions for locations/breakdown/budget/documents + `runGenericToolLoop` (the loop core) |
| `apps/web/app/features/predictions/cesare-schedule-tools.ts`        | Schedule tools (move_scene, merge_days, get_weather_forecast, suggest_reorder)                   |
| `apps/web/app/features/predictions/cesare-shooting-plan-tools.ts`   | Shooting tools (add_plan, add_shot, generate_plan_from_description, …)                           |
| `apps/web/app/features/predictions/cesare-read-tools.ts`            | Read-only tools for lazy RAG (Layer 2)                                                           |
| `apps/web/app/features/predictions/cesare-model-router.ts`          | Pure function Haiku vs Sonnet (Layer 3)                                                          |
| `apps/web/app/features/ai/anthropic-client.ts`                      | Wrapper: real SDK vs mock (`MOCK_AI=true`)                                                       |
| `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts` | Mock client for deterministic E2E tests                                                          |

### Page → toolset routing

```typescript
// Pseudo-code of handleAskCesare
switch (pageContext.page) {
  case "locations":   return callCesareWithTools(...)            // search_places, add_candidate
  case "breakdown":   return callCesareWithBreakdownTools(...)   // tag_element, accept_ghost, estimate_scene_cost
  case "budget":      return callCesareWithBudgetTools(...)      // update_budget_line, redistribute_topsheet
  case "schedule":    return callCesareWithScheduleTools(...)    // move_scene_to_day, merge_days, weather
  case "shooting":    return callCesareWithShootingPlanTools()   // add_parallel_plan, add_shot, generate_plan
  case "soggetto":
  case "synopsis":
  case "outline":
  case "treatment":   return callCesareWithDocumentTools(...)    // apply_text_edit, expand_section, compress
  case "screenplay":  return callCesareWithScreenplayTools(...)  // [Wave 2: propose_screenplay_edit]
}
```

Every wrapper injects a **page-specific system prompt** via `buildXxxToolsGuidance()` that contains ❌/✅ examples of the expected behaviour. This is the most delicate part: models are excellent at "promising" without executing. The prompt has to be aggressive.

### Tool definition shape

Every tool follows the standard Anthropic spec:

```typescript
{
  name: "add_candidate",
  description: "Add a real candidate location to the current requirement",
  input_schema: {
    type: "object",
    properties: {
      requirement_id: { type: "string" },
      name: { type: "string" },
      lat: { type: "number" },
      lng: { type: "number" },
      photo_names: { type: "array", items: { type: "string" } },
    },
    required: ["requirement_id", "name"]
  }
}
```

The `executor` maps `tool_use` → side effect:

```typescript
// Uniform signature for every tool
type Executor = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
) => ResultAsync<ToolResult, CesareError>;
```

Every executor goes through `withProjectAccess` (even the read-only ones) to guarantee multi-tenant isolation.

### Invisible toolsExecuted marker

The server appends `<!--ohw:tools=N-->` to the final reply, where `N` is the number of tools that executed successfully. The client (in `CesareSheet.tsx` via `parseToolsExecuted`) uses that number to decide whether to surface the notification pill or silently dismiss it. The marker is stripped before markdown rendering.

**Algorithm**: in `runGenericToolLoop`, increment `toolsExecuted` whenever the executor returns `isOk`. At the end: `return ${textAccumulator.join("\n\n")}\n<!--ohw:tools=${toolsExecuted}-->`.

---

## 2. Structured RAG — no vector store

The app uses **structured RAG**, not semantic search. The domain is small (tens of scenes, a handful of docs, one budget), and everything already lives in relational PostgreSQL. Indexing with embeddings would be over-engineering.

### What Cesare receives as context

`assembleContext(db, projectId, pageContext)` returns:

```typescript
CesareContext {
  projectTitle:       string
  scenes:             { id, number, heading }[]         // full list, metadata only
  currentScene:       SceneRow | null                    // active scene
  sceneWindow:        SceneBodyRow[]                     // ±2 scenes with body (notes)
  characters:         string[]
  breakdownElements:  { category, name }[]
  budget:             { totalAllocated, lines, status }
  schedule:           { totalShootingDays, lockedDays }
  locations:          LocationRequirementRow[]
  currentRequirement: LocationRequirementRow | null
  activeDocument:     ActiveDocumentRow | null
  projectDocuments:   ProjectDocumentRow[]               // summary, no full content
}
```

### Narrative window (±2 around the active scene)

`loadSceneWindow` loads the 5 scenes around the current one with the full body (`scenes.notes`). All the other scenes appear only as `(number, heading)` in the metadata list.

**Algorithm**: `SELECT * FROM scenes WHERE screenplay_id = $1 AND number BETWEEN $current-2 AND $current+2 ORDER BY number`. Fallback: when `currentSceneNumber` is null (e.g. the page just opened), return the **first 5 scenes** of the screenplay — Cesare always has a narrative starting point.

### Active broadcast (Context provider)

Every page publishes "what the user is currently looking at" via React Context (`apps/web/app/features/app-shell/active-scene-context.tsx`):

```typescript
useSetActiveScene({ sceneId, sceneNumber }); // screenplay, breakdown, schedule, shooting, budget
useSetActiveRequirementId(id); // locations
useSetActiveDocument({ id, type }); // documents
useSetActiveShootingDay({ id, number }); // schedule
```

`CesareSheet` reads this context and forwards it to the server as `pageContext`. Cesare always knows the "where am I" without the user repeating it.

### Lazy RAG via read-tools (Wave 1 G, incoming)

Today `assembleContext` loads EVERYTHING every turn (~3000 tokens of context alone). After Wave 1 G:

- `assembleContext` only loads the essentials: project title, scene list (metadata), counts, active IDs
- Cesare has **read-tools** for on-demand fetch:

```
read_scene(N)               → full body of a scene
read_scene_range(from, to)  → range
read_document(type)         → soggetto/synopsis/... content
read_budget_lines(top?)     → filtered budget rows
read_breakdown(scene?)      → breakdown elements
read_location_requirement(id)
read_shooting_day(N)
```

**Savings**: -50% average input tokens. When Cesare answers "what do you think of the scene?" (simple chat) the prompt is light; when it must edit scene 3, it explicitly calls `read_scene(3)`.

### Why no vector search?

| Threshold                          | When to introduce embeddings                                              |
| ---------------------------------- | ------------------------------------------------------------------------- |
| < 100 scenes                       | Never. Loading 5 metadata rows is faster than a vector query              |
| 100-500 scenes                     | Consider it if the user asks "scenes similar to X" as an explicit feature |
| > 500 scenes (multi-season series) | pgvector + materialized summary                                           |

A typical feature film (60-100 scenes) is well below the threshold.

---

## 3. Propose/accept pattern (Wave 2, incoming)

"Structured" mutations (add_candidate, update_budget_line) write directly to the DB. For **text edits or 2D render mutations** we need an intermediate layer instead: Cesare **proposes**, the user **accepts**.

### Variant A — Micro-edit (inline PM decoration)

For pointwise text edits:

```
Cesare → propose_screenplay_edit(scene_n, find, replace, reason)
  ↓
Server: locate PM range with leaf-text walk (algorithm already fixed)
  ↓
Response: { id, range, replacement, reason, status: "pending" }
  ↓
Client: dispatch onto the ProseMirror plugin "proposed-edit-decoration"
  ↓
DOM: the original text stays visible + a floating overlay shows the replacement
     with ✓/✕ buttons. 600 ms flash on first render.
  ↓
✓ → dispatch replace transaction on the PM doc, flash applied, decoration removed
✕ → decoration removed, nothing changes
```

Pattern already used in `apps/web/app/features/breakdown/lib/pm-plugins/ghost-decoration.ts` (`buildGhostPlugin`) and `apps/web/app/features/screenplay-editor/lib/plugins/cesare-applied-highlight.ts` (`cesareAppliedHighlightKey`).

**Leaf-text walk algorithm** (`handleApplyEdit` in `ScreenplayEditor.tsx`):

1. Collect leaf text nodes via `doc.descendants` filtering for `node.isText`
2. Concatenate all texts → `fullText`
3. `idx = fullText.indexOf(find)`
4. Map flat indices → PM positions by scanning the collected segments
5. Dispatch `replaceWith` + `cesareAppliedHighlightKey` for the flash

No synthetic separators (the `textBetween` with `"\n"` inserts extra separators that break the mapping on nested schemas).

### Variant B — Macro-edit (full-page diff)

For full rewrites (screenplay v2, soggetto v2):

```
Cesare → propose_screenplay_revision(scope: whole, instruction, label)
  ↓
Server calls Sonnet with instruction, receives resulting Fountain
  ↓
Creates DRAFT version in screenplay_versions with is_draft=true
  ↓
Response: { versionId, label }
  ↓
Client: opens VersionDiff side-by-side page (original vs draft)
  ↓
User accepts sections or everything → promoteDraftToActive(versionId)
User discards → draft stays in DB but flagged (can be deleted)
```

Reuses `apps/web/app/features/screenplay-editor/lib/diff.ts` (`diffScreenplays`, `diffStats`) — line-based diff on Fountain.

**Schema change**: `is_draft boolean default false` on `screenplay_versions` and `document_versions` (migration 0029).

### Why two variants

- **Micro-edit**: the user wants immediate feedback at the exact spot. Opening a diff page would be heavy for "put a comma here".
- **Macro-edit**: 50 scattered edits across 80 scenes are unmanageable as 50 decorations. A diff page is scannable and supports per-section accept.

The system prompt heuristic forces Cesare to pick the right one based on the request.

---

## 4. Cost-saving layers (Wave 1 G, incoming)

The 3 layers are **orthogonal** — they multiply.

### Layer 1 — Prompt caching (Anthropic native)

The system prompt becomes an array of blocks:

```typescript
[
  {
    type: "text",
    text: "ROLE: you are Cesare…",
    cache_control: { type: "ephemeral" },
  },
  {
    type: "text",
    text: "PRODUCTION CONTEXT: …",
    cache_control: { type: "ephemeral" },
  },
  {
    type: "text",
    text: "TOOL GUIDANCE locations…",
    cache_control: { type: "ephemeral" },
  },
  { type: "text", text: "DYNAMIC STATE: SC. 3" }, // NOT cached
];
```

Anthropic recognises identical blocks across calls and loads them from cache (5-min TTL). Input cost drops to 10% per cached token.

**Typical 10-turn chat**: first call $0.015, subsequent calls $0.002 each.

**Algorithm**: `buildSystemPrompt(ctx, page)` returns `SystemPromptBlock[]`. `runGenericToolLoop` passes the array directly to `client.messages.create({ system })` — the SDK accepts both string and array shapes.

### Layer 2 — Lazy RAG via read-tools

Already described above (section 2). Expected savings: -50% average input.

**Trade-off**: adds 1-2 round trips to the model (because Cesare has to call a tool before answering). Overall still cheaper, because cached input is nearly free but `read_scene` is short and targeted.

### Layer 3 — Model tier router

Pure function `routeModel(input)` in `cesare-model-router.ts`:

```typescript
export function routeModel({
  userMessage,
  page,
  conversationLength,
}): "haiku" | "sonnet" {
  if (!userMessage.trim()) return "sonnet"; // defensive
  if (userMessage.length > 200) return "sonnet"; // complex
  if (conversationLength > 4) return "sonnet"; // deep follow-up
  if (
    /aggiungi|modifica|crea|rinomina|applica|salva|rimuovi|sposta|sostituisci|elimina|genera/i.test(
      userMessage,
    )
  )
    return "sonnet"; // imperative
  if (userMessage.endsWith("?") && !hasImperative) return "haiku"; // pure question
  return "sonnet"; // default safe
}
```

**Heuristic, not LLM**. Deterministic decision < 1ms.

- "what do you think of this character?" → Haiku ($0.001 per chat)
- "add 3 candidates for the restaurant" → Sonnet ($0.012 per agentic call)

**Tests**: 5+ Vitest cases in `cesare-model-router.test.ts`.

### Estimated total

| Scenario                            | Before | After | Reduction |
| ----------------------------------- | ------ | ----- | --------- |
| Chat "what do you think?" × 5 turns | $0.20  | $0.02 | -90%      |
| Agentic locations (3 tool calls)    | $0.08  | $0.02 | -75%      |
| Macro-edit screenplay v2            | $0.40  | $0.15 | -62%      |
| Typical daily session               | $2.00  | $0.30 | -85%      |

---

## 5. Mock framework — deterministic E2E tests

`MOCK_AI=true` env flag activates the mock client in `_mocks/cesare-tool-loop.mock.ts`.

### Architecture

```typescript
// Defined alongside tests
const MOCK_SCENARIOS: MockScenario[] = [
  {
    match: /trova candidati/i,
    turns: [
      { tool_uses: [{ name: "add_candidate", input: {...} }], stop_reason: "tool_use" },
      { text: "Added 1 candidate.", stop_reason: "end_turn" },
    ]
  },
  ...
];
```

The mock client:

1. Pattern-matches the last `user` message against `scenario.match` (regex/substring)
2. Emits `turns[i++]` on each `messages.create` call within the same conversation
3. **Does NOT touch the DB**: `runGenericToolLoop` invokes the real executor, which performs real writes against the test DB (port 3002)

### Result

- Deterministic E2E tests, free (0 API calls)
- Real DB writes → verifiable side effects
- The 5 `cesare-agentic-*.spec.ts` specs run in <60s in CI
- Mock context (`process.env["OHW_MOCK_CTX_*"]`) shared across API/SSR routers via env var (the only common channel in TanStack Start's multi-router architecture)

### Tool placeholder substitution

The `tool_uses.input` payloads in mocks support placeholders like `{{REQ_ID}}` which are resolved at runtime by reading `process.env["OHW_MOCK_CTX_*"]`. Tests call `setMockContext({ REQ_ID: "abc-123" })` before the action.

---

## 6. Multi-channel notifications

When Cesare executes a tool, the user receives feedback on 3 simultaneous channels:

1. **Persistent pill** (top-right): "✦ Cesare is searching candidates…" → "✦ Added 3 candidates · Go see →"
2. **Web Push desktop**: only when `document.visibilityState !== "visible"` (tab in background). Never auto-prompt — the user must click "Enable desktop notifications".
3. **TopBar badge**: red dot when there are unseen results, cleared on chat open.

Click on any channel → opens the sheet, scrolls to the latest message, applies `[data-cesare-pulse="true"]` for 2s on the modified entities (expanded box-shadow animation).

**False-positive filter**: the pill flips to "completed" **only if** `parseToolsExecuted(reply) > 0`. Otherwise silent dismiss. Prevents the pill saying "Cesare updated X" when in reality Cesare only answered in text.

**Key files**:

- `apps/web/app/features/app-shell/cesare-notification-context.tsx` — useReducer + ts-pattern + sessionStorage
- `apps/web/app/features/app-shell/hooks/useWebPush.ts` — Notification API wrapper
- `packages/ui/src/shell/TopBar/TopBar.tsx` — `cesareHasUnseen` prop

---

## 7. Implemented algorithms

This is the inventory of **non-trivial** algorithms we wrote for Oh Writers. Excluding "direct transformations" like "SELECT FROM scenes" — only the ones with logic.

### Iterative tool loop with executor dispatch

File: `cesare-tools.ts` (`runGenericToolLoop`)

- **Pattern**: for-loop with `MAX_ITERATIONS = 5`, on each iteration calls the model, if the response contains `tool_use` blocks executes them in series and re-iterates; otherwise exits
- **`toolsExecuted` counter** for the final invisible marker
- **Short-circuit on error**: when the executor returns `isErr()`, the tool_result is `{ error: msg }` but the loop continues (so Cesare can recover)
- **Complexity**: O(N × T) where N = iterations (≤5) and T = tool calls per turn

### Leaf-text walk + flat-index → PM position mapping

File: `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx` (`handleApplyEdit`)

Problem: ProseMirror has positions that include separators between blocks. `doc.textBetween()` injects synthetic `"\n"` characters that make `indexOf(find)` non-mappable directly.

- **Algorithm**: walk `descendants` filtering by `node.isText`, accumulate segments `{ text, from, to }`, concatenate only the real texts → `fullText`. Find `idx = fullText.indexOf(find)`, then scan the segments to map the flat index to the real `posStart/posEnd`.
- **Correctness**: no synthetic separators, exact mapping for any nested PM schema
- **Complexity**: O(n) on the doc characters

### Fuzzy heading match for location requirement → scenes

File: `apps/web/app/features/predictions/cesare.server.ts` (fallback in `assembleContext` for locations)

When `locationRequirementScenes` is empty, we find the linked scenes by matching the requirement name against `scenes.heading`.

- **Algorithm**:
  1. Normalise both (lowercase, NFD, strip diacritics, replace non-alphanumeric with spaces)
  2. Tokenise the requirement name, discard tokens < 3 chars
  3. A scene matches if every token appears in `heading.toLowerCase().normalised()`
- **Example**: "Ristorante - Forno" → tokens `[ristorante, forno]` → matches scene "INT. RISTORANTE - FORNO/CUCINA - NOTTE"
- **Complexity**: O(S × T) where S = project scenes, T = requirement tokens

### `adAnalyze` — AD alert heuristics on breakdown

File: `packages/domain/src/breakdown/ad-analyze.ts`

Hardcoded rules that inspect scenes + breakdown and return production-side alerts.

- **`rule_sameDayLocationJump`**: for every character, group its occurrences by `storyDay`. If within the same storyDay it appears in distinct locations → warn (impossible jump)
- **`rule_characterDisappearance`**: order scenes, for every character compute the maximum gap between consecutive scenes where it appears. If the gap is ≥ 6 scenes → info (potential missing reappearance)
- **`rule_riskKeywords`**: regex on `scenes.notes` for words like "pistola", "esplosione", "minorenne", "animale", "stunt" → flag with severity. Table of 7 regexes.
- **Severity**: `info | warn | critical`
- **Complexity**: O(O × C) where O = occurrences, C = characters in the scene body

### `estimateSceneCost` — estimated cost per scene (pure function)

File: `packages/domain/src/budget/estimate-scene-cost.ts`

Deterministic estimate of a scene's daily cost.

- **Input**: `{ intExt, timeOfDay, characters, elementsByCategory, estimatedShootHours }` + `productionRates` (rate-card)
- **Algorithm**:
  1. Cast: first 1-2 characters → lead rate, the rest → supporting rate. 1 day default.
  2. Crew: base 8 people × `crewBaseDay`. Bumped to 12 if hasVfx/hasSfx is detected in the breakdown elements.
  3. Location: `locationSetupExt` if EXT, `locationSetupInt` if INT. Zero if `isLocationReused`.
  4. Catering: `crewCount × catering` per meal.
  5. Equipment: base + boost for VFX/SFX flags.
  6. Difficulty 1-5: sum of flags (night EXT +1, SFX +2, VFX +1, large cast +1, extras +1) capped at 5.
- **Output**: `{ total, lines[], difficulty, notes[] }`
- **Pure**: no DB, no React, no neverthrow

### `estimateDayDifficulty` — day difficulty + weather penalty

File: `packages/domain/src/schedule/estimate-day-difficulty.ts`

Estimate difficulty and success probability for a shooting day.

- **Base difficulty**: INT day = 1. +1 for night, +1 for EXT, +1 for SFX/VFX, +1 for ≥3 location changes, +1 for cast ≥ 6, +1 for heavy day (≥11h). Cap 5.
- **Base probability**: `95 - 8 × difficulty` (range 55-87%)
- **Weather penalty** (only on EXT scenes):
  - Storm: -50
  - Snow: -40
  - Rain probability ≥ 70%: -35
  - Rain probability ≥ 40%: -20
  - Wind ≥ 50 km/h: -25
  - Extreme temperature: -15
- **Output**: `{ difficulty, successProbabilityClear, successProbabilityActual, riskFactors[], recommendations[] }`

### `generate_plan_from_description` — keyword parser for shot list

File: `apps/web/app/features/predictions/cesare-shooting-plan-tools.ts`

Cesare describes a plan in Italian ("classic: WS, two CUs on Giulio, OTS Tea, insert of the photos") and the tool builds the plan with real shots.

- **Algorithm**: regex table Italian/English → shot type
  - `/\bWS\b|wide|campo lungo/i` → WS
  - `/\bCU\b|close-?up|primo piano/i` → CU
  - `/\bOTS\b|over.?the.?shoulder|su le spalle/i` → OTS
  - `/\bINSERT\b|dettaglio/i` → INSERT
- Extracts numeric counts ("two CUs" → 2 CU shots)
- Fallback: when no keyword matches → single WS

### Mock scenario matching (E2E framework)

File: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts`

- **Pattern**: match-first wins. Ordered list of `MockScenario`; the first regex that matches the last `user` message wins
- **Stateful turns**: each conversation has a `turn_index` counter. The first `messages.create` returns `turns[0]`, the second `turns[1]`, etc.
- **Placeholder substitution**: `{{REQ_ID}}`, `{{SCENE_NUMBER:3}}` (with default) resolved at runtime from `process.env["OHW_MOCK_CTX_*"]`
- **Complexity**: O(S) on the number of scenarios, linear on the regex match (Italian text, reasonable sizes)

### Skeleton shimmer + applied highlight (CSS, but algorithmic)

Files: `ScreenplayCesarePanel.module.css`, `CesareSheet.module.css`

- **Shimmer**: linear-gradient with `background-position` from 200% to -200% animated over 1.4s → wave effect
- **Cesare pulse**: `box-shadow: 0 0 0 0 var(--ds-action)` → `0 0 0 20px transparent` in 2s ease-out → "ripple" around the just-modified entities

### `routeModel` (Wave 1 G, incoming)

File: `apps/web/app/features/predictions/cesare-model-router.ts`

- **Pure function**: input `{ userMessage, page, conversationLength }` → output `"haiku" | "sonnet"`
- **Decision tree**:
  1. empty → sonnet (defensive)
  2. length > 200 → sonnet (complex)
  3. conversationLength > 4 → sonnet (deep follow-up)
  4. Italian imperative regex matches → sonnet
  5. ends with `?` AND no imperative → haiku
  6. default → sonnet
- **Tests**: 5+ Vitest cases (imperative, pure question, long, deep, edge)

### Markdown table parser (in `CesareSheet.tsx`)

File: `apps/web/app/features/predictions/components/CesareSheet.tsx` (`renderMarkdown`)

- **2-pass algorithm**: for every line, if it's a `tableRow` (`| col | col |`) AND the next line is a `tableSeparator` (`|---|---|`), enter table mode. Collect subsequent `tableRow` lines until one no longer matches, then `flushTable` emits `<table>` with `thead`/`tbody`.
- **State**: `ListState` (ul/ol) + `TableState` mutually exclusive
- **Strip raw `<tool_call>` and `<!--ohw:tools=N-->`** before parsing

### `extractSceneTitles` for scene index

File: `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`

- **Recursive walk of the pmDoc JSON**. For every node `type === "heading"`, accumulate `{ number, title }`
- Concatenate `prefix` + `title` to obtain "INT. RISTORANTE - NOTTE"
- Fallback: if the `scene_number` attr is missing, use the auto-incremental index

### Leaflet Places Nearby Search clustering (Wave 2 E, incoming)

When the user draws a circle on the map:

- **Algorithm**: Places API `nearbysearch` (lat, lng, radius_m, query)
- **Client-side clustering**: Leaflet's `markerClusterGroup` groups pins into spherical clusters, reopens them on zoom
- Cap at 50 km radius for API quota

---

## 8. Architectural decisions and why

### Why NOT LangChain / LlamaIndex

- Heavy dependencies to orchestrate a loop that's 80 lines of code
- Useless abstractions: our "chain" is `assembleContext → runToolLoop`, already linear
- Worse debugging: every LangChain layer is a wrapper that hides the real error
- Harder mock framework (LangChain doesn't easily expose the raw `messages.create`)

### Why NOT a vector store (pgvector / Pinecone / Weaviate)

- Domain < 100 scenes per project = direct loading is cheaper than vector lookup
- No "find similar text" as a requested feature
- The real queries are **structured** ("give me scene N", "all budget rows for top sheet X") — relational, not similarity
- Infrastructure overhead (indexing, re-embedding on update) isn't justified

### Why Sonnet + Haiku, not just one

- Sonnet 4.6 is the general-purpose workhorse. Good at tool use, creative rewrites, multi-step reasoning. But 10× more expensive than Haiku.
- Haiku 4.5 is perfect for conversational chat and short questions. Below 200 output tokens it's practically identical to Sonnet on QA tasks.
- The router saves ~70% of the average cost while preserving quality on complex tasks.

### Why TanStack Start `createServerFn` instead of tRPC / classic REST

- End-to-end type-safety without separate decorators/routers
- Native Zod validation in the same file
- Easy mocking (a server fn is a function, not an HTTP endpoint)
- Files co-located with the feature (no `routes/api/...` next to `features/...`)

### Why ProseMirror decorations instead of floating React overlays

- The "proposed edit" state is semantically bound to a PM range, not pixel coordinates
- Decorations auto-invalidate if the doc changes (e.g. the user edits elsewhere)
- Performance: the decoration set is O(n) over the proposed ranges, no full React tree re-render

---

## 9. Glossary

| Term                     | Meaning                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Tool use loop**        | Iteration `model.create → execute tools → model.create → …` until `stop_reason !== "tool_use"` |
| **System prompt block**  | A piece of the system prompt with an optional `cache_control: ephemeral` flag                  |
| **MockScenario**         | An entry in the mock framework: regex on the user message → sequence of canned turns           |
| **toolsExecuted marker** | Invisible HTML comment `<!--ohw:tools=N-->` appended to the reply; signals real side effects   |
| **Active scene context** | Global React context that propagates `{ sceneId, sceneNumber }` to Cesare                      |
| **Scene window**         | 5 scenes around the current one (±2) loaded with the full body                                 |
| **Lazy RAG**             | Lean initial context + `read_*` tools for on-demand fetch                                      |
| **Propose/accept**       | Pattern where Cesare emits a `ProposedEdit` and the user ✓/✕ — no DB write until ✓             |
| **Macro-edit**           | Full rewrite (v2) with DRAFT version + full-page diff                                          |
| **Micro-edit**           | Pointwise edit (find/replace) with inline PM decoration                                        |
| **Vernissage**           | Verification workflow: chrome-agent walk + scaffold E2E test + markdown report                 |

---

## 10. QA policy

Every non-trivial feature is delivered with a **3-level QA suite** (4 for Cesare-touching features). This is a **mandatory pipeline gate**, not optional. See `CLAUDE.md § Testing` for the project-wide policy that applies to every feature, not just Cesare.

### Level 1 — Vitest pure-function tests

For every new pure function (`estimateSceneCost`, `routeModel`, parsers, transformers). Minimum 5 cases: happy path, edge, boundary, error, default. Co-located file (`feature.test.ts`). Runs in CI on every PR.

### Level 2 — Mock E2E spec

A new `tests/cesare-agentic-<feature>.spec.ts` file with a unique `[OHW-NNN]` tag and a matching `MockScenario` in `_mocks/cesare-tool-loop.mock.ts`. Must exercise the full user flow (click → type → Cesare send → assert DOM side effect → assert DB row when applicable). Runs with `MOCK_AI=true` in CI, completes in <60s.

### Level 3 — Vernissage walk + report

JSON story in `vernissage/_stories/<feature>.story.json`, screenshots produced by `pnpm vernissage:walk`, markdown report `vernissage/<feature>.md` filled from `_template.md` with a manual verification checklist.

### Level 4 (Cesare only) — Cost smoke script

`scripts/cost-smoke-<feature>.ts` invoked via `pnpm cost:smoke:<feature>`. Disables `MOCK_AI`, runs 2-3 real chats, logs `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`, `usage.input_tokens`, `usage.output_tokens`. Output: a table comparing expected vs measured cost reduction. **Not** in CI (costs real API calls). Documented in README.

### Workflow

The orchestrator spawns a dedicated **QA-companion agent** immediately AFTER the feature agent commits. The QA agent works on a separate worktree, reads the feature commit, writes the tests, commits with `[OHW] test(<feature>): vitest + mock e2e + vernissage + cost smoke`.

### Exceptions

- Trivial hotfixes (1-2 lines CSS, typos): OK without tests.
- Behaviour-preserving refactors: Vitest on touched pure functions + existing E2E must still pass.
- Product features: all 3 levels mandatory (4 if Cesare).
- Infra features (mock framework, vernissage tooling, cost layers): mock E2E + smoke test of their own mechanism.

Only skipped when the user explicitly says "skip QA for this".

---

## Quick references

- Main spec: `docs/specs/34-cesare-agentic-everywhere.md`
- General architecture: `docs/architecture.md`
- CLAUDE.md (code rules): `CLAUDE.md`
- Current plan: `~/.claude-personal/plans/sorted-nibbling-treehouse.md`
- Mock framework: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts`
- E2E specs: `apps/web/tests/cesare-agentic-*.spec.ts`

---

## 11. Spec 39 — Context Stratification (in implementazione, 2026-05-27)

### Il problema con l'architettura attuale

`cesare.server.ts` è ancora monolitico: `assembleContext` carica tutto il contesto del progetto ad ogni call (~3000 token), `buildSystemPrompt` impila i blocchi in sequenza, e ogni nuova page richiede modifiche in quattro punti: `assembleContext`, `buildSystemPrompt`, `buildToolGuidanceBlock`, e il router manuale in `handleAskCesare`.

Tre sintomi concreti:

- **Coupling page/context**: aggiungere una page come `storyboard` richiede 4 punti di modifica coordinati
- **Cache instabile per page switching**: quando l'utente naviga da `locations` a `breakdown`, il blocco tool-guidance cambia → cache miss garantito senza modo di separare cosa cambia per tipo di page da cosa cambia sempre
- **Lazy RAG incompleto**: il pieno payload viene caricato ad ogni call anche quando Cesare risponde "certo, dimmi di più" (zero tool calls). Il lazy RAG descritto in §2 era pianificato ma mai completato — Spec 38 ha introdotto il Film Bible invece, che è un passo diverso nella stessa direzione

### La nuova architettura: tre layer

Il contesto di ogni call Cesare si stratifica in tre layer ortogonali:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1 — GLOBAL CONTEXT                                   │
│  Film Bible, project title, genre, format                   │
│  Stabilità: cambia solo a fingerprint change                 │
│  Cache: sempre cached (ephemeral, posizione 0+1)            │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2 — LOCAL CONTEXT                                     │
│  Scena corrente, finestra ±2 scene, documento attivo,        │
│  requirement attivo, shooting day attivo                     │
│  Stabilità: cambia per user action (scroll, click, navigate) │
│  Cache: NO — è il blocco dinamico                            │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3 — SKILLS                                            │
│  Tool definitions + guidance block per page type             │
│  Stabilità: cambia solo per page type (locations/breakdown/…)│
│  Cache: cached per page type (posizione fissa per skill)     │
└─────────────────────────────────────────────────────────────┘
```

Il system prompt risultante ha forma a 5 blocchi:

```
Block 0: ROLE_TEXT                    cache_control: ephemeral  ← invariante
Block 1: [FILM BIBLE] (GlobalContext) cache_control: ephemeral  ← cambia a fp change
Block 2: [SKILL: locations]           cache_control: ephemeral  ← cached per page type
         (tool guidance locations)
Block 3: [SKILL: read-scene]          cache_control: ephemeral  ← sempre cached
         (lazy RAG guidance)
Block 4: [LOCAL CONTEXT]              (no cache)                ← cambia ogni call
         scena corrente, doc attivo, ecc.
```

**Regola fondamentale**: i blocchi cached sono sempre in posizione fissa. La sequenza è sempre `Global → Skills → Local`. Il blocco Local è sempre l'ultimo e non ha mai `cache_control`.

Ogni `Skill` è un modulo autonomo con:

- `tools` → le tool definition Anthropic per quella skill
- `guidanceBlock` → testo del sistema prompt (factory function deterministica per la cache)
- `executor` → funzione che esegue ogni tool call (`(block: ToolUseBlock, db, projectId, access) => ResultAsync<ToolResult, CesareError>`)
- `requiredData` → dichiarazione dei dati da caricare dal DB (`"budget" | "schedule" | "locations" | "breakdown" | "screenplay" | "documents" | "shot-plans"`)

`buildLocalContext` carica solo i dati dichiarati nei `requiredData` delle skill selezionate per la call corrente — il pieno payload non viene mai caricato.

### Stato implementazione

| Agent | Compito                                                                             | Stato             |
| ----- | ----------------------------------------------------------------------------------- | ----------------- |
| A     | Domain types (`GlobalContext`, `LocalContext`, `Skill`, `SkillId`, `SkillRegistry`) | ✅ DONE (af8d475) |
| B     | Skill modules extraction (`skills/*.skill.ts`)                                      | 🔄 IN PROGRESS    |
| C     | `assembleSystemPromptV2` + `buildGlobalContext` (`cesare-assembler.ts`)             | 🔄 IN PROGRESS    |
| D     | `buildLocalContext` lean (carica solo `requiredData` dichiarati)                    | 🔄 IN PROGRESS    |
| E     | `SkillRegistry` + wiring + E2E tests (OHW-039a/b/c/d/e)                             | ⏳ PENDING        |

### Deviazioni dalla spec originale

- **D1**: `Skill`, `SkillId`, `SkillRegistry`, `SkillExecutor`, `DataRequirement` vivono in `apps/web/app/features/predictions/skills/types.ts` (non in `packages/domain`) perché dipendono da `Db` e `ProjectAccess`, tipi di `apps/web`. `GlobalContext` e `LocalContext` restano in `packages/domain/src/context/` (strutture dati pure).
- **D2**: `SkillExecutor` riceve il `ToolUseBlock` completo (`(block, db, projectId, access)`) anziché `(toolName, input, db, projectId, access)` come scritto nella spec. Il `tool_use_id` del block è necessario per costruire `ToolResult` compatibile con il loop Anthropic. Gli executor esistenti usano già questa firma — zero adapter necessario.
- **D3**: `DataRequirement` è una stringa enum a 7 valori: `"budget" | "schedule" | "locations" | "breakdown" | "screenplay" | "documents" | "shot-plans"`. Nessun oggetto con opzioni aggiuntive.
- **D4**: `guidanceBlock` è prodotto da una factory function deterministica (`buildXxxSkill(ctx: SkillBuildContext): Skill`) che materializza la stringa prima di entrare nel loop. Stesso input → stessa stringa → cache Anthropic stabile.
- **D7**: Implementazione incrementale — funzioni `_v2` affiancate alle vecchie (`assembleSystemPromptV2`, nuovo `handleAskCesare`), swap finale da Agent E quando tutti i test sono verdi. Il pre-push hook non viene mai bypassato.

Spec di riferimento: `docs/specs/39-context-stratification.md`, `docs/specs/39-architecture-decisions.md`.
