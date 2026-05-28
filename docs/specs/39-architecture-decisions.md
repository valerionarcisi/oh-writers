# Spec 39 — Architecture Decisions

**Status:** APPROVED — base per tutti gli agenti implementativi  
**Data:** 2026-05-27  
**Autore:** Lead Agent (architetturale)

---

## Premessa

Questo documento risponde alle 8 domande critiche di architettura per Spec 39.
Ogni decisione è netta, motivata in una frase, e indica chi deve sapere cosa.
Leggilo prima di toccare un singolo file.

---

## Le 8 Decisioni

---

### D1 — Dove vivono Skill / SkillId / SkillRegistry?

**Decisione:** `Skill`, `SkillId`, `DataRequirement` restano in `apps/web` — in `features/predictions/skills/types.ts`. `GlobalContext` e `LocalContext` vanno in `packages/domain/src/context/`.

**Perché:** `Skill` contiene `AnthropicTool[]` e `SkillExecutor` che dipende da `Db` e `ProjectAccess`, entrambi tipi di `apps/web` — portarli in `packages/domain` creerebbe un import inverso verso il layer applicativo, violando il confine del domain package. `GlobalContext` e `LocalContext` sono strutture dati pure (solo field di DB distillati), non hanno dipendenze applicative, quindi appartengono al domain.

**Impatto su Agent A (tipi):**

- Crea `packages/domain/src/context/global-context.ts` e `packages/domain/src/context/local-context.ts` con le interfacce pure.
- Crea `apps/web/app/features/predictions/skills/types.ts` con `Skill`, `SkillId`, `SkillRegistry`, `SkillExecutor`, `DataRequirement`.
- Aggiorna `packages/domain/src/index.ts` per esportare le nuove interfacce di contesto.

**Impatto su Agent B/C/D:** Importano da `@oh-writers/domain` per i context types, da `~/features/predictions/skills/types` per `Skill` e `SkillExecutor`.

---

### D2 — SkillExecutor signature: compatibile con gli executor esistenti?

**Decisione:** La signature proposta dalla spec è incompatibile con l'attuale `executor` interno di `runGenericToolLoop`. Serve un adapter. La `SkillExecutor` opera a livello di singolo tool name, mentre il loop attuale riceve un `ToolUseBlock` (con `id`, `type`, `name`, `input`). Il contratto corretto è:

```typescript
type SkillExecutor = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
  access: ProjectAccess,
) => ResultAsync<ToolResult, CesareError>;
```

Non `(toolName, input, db, projectId, access)` come nella spec — il `block` completo è necessario perché `tool_use_id` dell'oggetto `ToolUseBlock` è la chiave che `ToolResult` rispecchia per chiudere il loop con l'API Anthropic. Passare solo `toolName + input` richiederebbe ricostruire il `ToolUseBlock` nell'executor, aggiungendo complessità senza guadagno.

**Perché:** Gli executor esistenti (es. `executeTool`, `executeBreakdownTool`, `executeScheduleTool`) ricevono `ToolUseBlock` e costruiscono `ToolResult` con `tool_use_id: block.id` — questa è la forma che il tool loop consuma. Cambiare la firma interna richiederebbe riscrivere tutti gli executor esistenti senza beneficio architetturale.

**Impatto su Agent A (tipi):** Il tipo `SkillExecutor` nel contratto finale è quello sopra, non quello della spec. Aggiorna il tipo PRIMA che gli altri agenti lo leggano.  
**Impatto su Agent B/C (skill files):** Ogni `skill.executor` wrap-pa la funzione esistente già con questa firma — zero adapter necessario.

---

### D3 — DataRequirement: stringa enum o oggetto?

**Decisione:** Stringa enum (`"budget" | "schedule" | "locations" | "breakdown" | "screenplay" | "documents" | "shot-plans"`). Nessun oggetto con opzioni aggiuntive.

**Perché:** `buildLocalContext` deve prendere decisioni di caricamento binarie (carica / non caricare), non parametriche — ogni skill dichiara cosa vuole, non come lo vuole. Opzioni come filtri o limiti appartengono all'implementazione del loader, non alla dichiarazione di dipendenza.

**Impatto su Agent A (tipi):** `type DataRequirement = "budget" | "schedule" | "locations" | "breakdown" | "screenplay" | "documents" | "shot-plans"` — sette valori, uno per dominio di dati.  
**Impatto su Agent D (LocalContext lean):** `buildLocalContext` fa un `Set<DataRequirement>` dall'unione dei `requiredData` di tutte le skill selezionate e carica solo i loader corrispondenti.

---

### D4 — guidanceBlock: statico o dinamico?

**Decisione:** Il `guidanceBlock` rimane una **funzione** che riceve argomenti di contesto (`bible`, `activeSceneId`, `activeDayNumber`) e restituisce una stringa, ma la stringa prodotta deve essere **deterministica a parità di input** per non invalidare la cache Anthropic.

La firma concreta per ogni skill file:

```typescript
// skills/locations.skill.ts
const buildGuidance = (bible: FilmBible | null): string => { ... };

export const locationsSkill = (bible: FilmBible | null): Skill => ({
  id: "locations",
  tools: [...CESARE_LOCATION_TOOLS, ...CESARE_READ_TOOLS],
  guidanceBlock: buildGuidance(bible),   // stringa prodotta una volta
  executor: ...,
  requiredData: ["locations", "screenplay"],
});
```

Il `SkillRegistry` riceve il `GlobalContext` (che include la bible) al momento della costruzione della skill set per la call. La stringa statica è fissata prima di entrare nel loop Anthropic, quindi la cache funziona: per la stessa bible e la stessa page, la stringa è identica tra call.

**Perché:** La cache Anthropic invalida il blocco se il testo cambia tra call successive dello stesso utente. I blocchi di guidance che includono dati dinamici come `activeDayNumber` o `activeSceneId` vengono esclusi dal cache (`cache_control` non va su Local Context). La bible è già in Global Context (cached separatamente) — il suo fingerprint stabilizza la guidance della skill `locations`.

**Impatto su Agent B (skill files):** Ogni skill file esporta una factory function `buildXxxSkill(context: SkillBuildContext): Skill` che materializza `guidanceBlock` come stringa.  
**Impatto su Agent C (assembler):** L'assembler chiama le factory con il contesto prima di costruire il system prompt, non a tempo di rendering.

---

### D5 — SkillRegistry: classe o oggetto semplice?

**Decisione:** Oggetto semplice (`const skillRegistry = { get, selectForPage, allTools, combinedExecutor }`), non una classe. La spec dice "oggetto semplice" ed è la scelta corretta.

**Perché:** `combinedExecutor` è già una closure che cattura `skills[]` passato come argomento — non ha stato interno tra call, quindi una classe non aggiunge nulla oltre syntax noise. Un oggetto esportato con funzioni è più testabile (ogni funzione è pura) e più leggibile.

**Impatto su Agent A (tipi):** L'interfaccia `SkillRegistry` della spec è corretta — implementazione come `const skillRegistry: SkillRegistry = { ... }` esportato da `skills/registry.ts`.  
**Impatto su tutti gli agenti:** Nessuna istanziazione con `new`, nessun costruttore.

---

### D6 — Ordine delle fasi di implementazione

**Decisione:** Le fasi hanno dipendenze dure. L'ordine è sequenziale con una sola finestra di parallelismo:

```
Agent A (tipi) — COMPLETA PRIMA DI TUTTO
    ↓
Agent B (skill files)   +   Agent D (LocalContext lean)   [parallelo]
    ↓
Agent C (assembler + handleAskCesare)
    ↓
Agent E (test + vernissage)
```

**Perché:** Agent B e D dipendono entrambi solo dai tipi di Agent A (le interfacce `Skill`, `DataRequirement`), quindi possono procedere in parallelo. Agent C dipende da entrambi (ha bisogno delle skill materializzate e del `buildLocalContext` nuovo).

**Impatto su tutti gli agenti:** Nessun Agent B/C/D inizia prima che Agent A abbia committato e il typecheck passi (`pnpm tsc --noEmit`).

---

### D7 — Breaking change su cesare.server.ts: big-bang o incrementale?

**Decisione:** **Incrementale** — nuove funzioni affiancate alle vecchie, poi swap atomico.

Il piano concreto:

1. Agent A aggiunge tipi — nessun comportamento cambia.
2. Agent B aggiunge i file `skills/*.skill.ts` senza toccare `cesare.server.ts`.
3. Agent D aggiunge `buildLocalContext` (nuova funzione) senza rimuovere `assembleContext`.
4. Agent C aggiunge `assembleSystemPrompt` e il nuovo `handleAskCesare` come funzioni `_v2`. Quando i test passano, rimuove le vecchie e rinomina.
5. Ogni commit è typecheck-green e test-green. Il pre-push hook non viene mai bypassato.

**Perché:** Il pre-push hook esegue `tsc + vitest + lint + playwright mock-ui`. Un big-bang che tocca `cesare.server.ts` in un unico commit rompe il typecheck in mezzo all'implementazione e blocca ogni push intermedio. L'approccio incrementale mantiene main sempre verde.

**Impatto su Agent C (assembler):** È l'unico agente che rimuove codice esistente — lo fa solo nell'ultimo step, non prima che i test del nuovo path siano verdi.

---

### D8 — Mock E2E: deve conoscere le skill?

**Decisione:** Il mock in `cesare-tool-loop.mock.ts` **non cambia** — continua a lavorare a livello di tool name, invariante rispetto alla stratificazione.

**Perché:** Il mock è uno scripted client che risponde a `messages.create()` con sequenze di `tool_use` blocks identificati per `name` (es. `"search_places"`, `"add_candidate"`). La stratificazione sposta i tool da tool loop flat a skill set, ma i nomi dei tool rimangono identici — il mock non ha visibilità sul routing interno e non ne ha bisogno. I test E2E OHW-039e (`locations usa read_scene`, `breakdown non riceve budget tools`, `budget chiama read_budget_lines`) vanno scritti come nuovi scenari nel mock file esistente, non come riscrittura.

**Impatto su Agent E (test):** Aggiunge scenari al mock file esistente per i 3 test E2E di spec 39. Non tocca i scenari esistenti.

---

## Ordine di implementazione (con dipendenze esplicite)

```
┌─────────────────────────────────────────────────────┐
│  AGENT A — Tipi e interfacce                        │
│  File: packages/domain/src/context/                 │
│         apps/web/app/features/predictions/skills/   │
│  Blocca: tutto il resto                             │
│  Gate: pnpm tsc --noEmit verde                     │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
┌─────────────────────┐   ┌─────────────────────────┐
│  AGENT B            │   │  AGENT D                 │
│  Skill files        │   │  LocalContext lean        │
│  skills/*.skill.ts  │   │  buildLocalContext()      │
│  Dipende da: A      │   │  Dipende da: A            │
│  Gate: tsc verde    │   │  Gate: tsc + vitest D     │
└──────────┬──────────┘   └────────────┬─────────────┘
           │                           │
           └────────────┬──────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────┐
│  AGENT C — Assembler + handleAskCesare refactor   │
│  assembleSystemPrompt, SkillRegistry.wire         │
│  Dipende da: A + B + D                            │
│  Gate: tsc + vitest (tutte le suite) verde        │
└───────────────────────────┬───────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────┐
│  AGENT E — Test e vernissage                       │
│  Vitest OHW-039a/b/c/d, mock E2E OHW-039e         │
│  Dipende da: A + B + C + D                        │
│  Gate: pnpm test:unit + pnpm test:e2e             │
└───────────────────────────────────────────────────┘
```

---

## Contratti da rispettare

Queste sono le interfacce TypeScript esatte che tutti gli agenti devono usare.
Non deviare — qualsiasi variazione richiede aggiornamento di questo documento.

### packages/domain/src/context/global-context.ts

```typescript
import type { FilmBible } from "../bible/schema.js";

export interface GlobalContext {
  readonly projectTitle: string;
  readonly genre: string | null;
  readonly format: string;
  readonly bible: FilmBible | null;
}
```

### packages/domain/src/context/local-context.ts

```typescript
// Row shapes are plain objects — no Drizzle inference needed here.
// The actual DB query lives in apps/web and produces these shapes.

export interface SceneMetaRow {
  readonly id: string;
  readonly number: number;
  readonly heading: string;
}

export interface SceneBodyRow {
  readonly id: string;
  readonly number: number;
  readonly heading: string;
  readonly body: string | null;
  readonly characterNames: string[];
  readonly isCurrent: boolean;
}

export interface ActiveDocumentRow {
  readonly id: string;
  readonly type: string;
  readonly content: string;
  readonly isActive: true;
}

export interface LocalContext {
  readonly projectTitle: string;
  readonly scenes: SceneMetaRow[]; // sempre: id/number/heading, no body
  readonly currentScene: SceneMetaRow | null;
  readonly sceneWindow: SceneBodyRow[]; // ±2 scene con body
  readonly characters: string[];
  readonly activeDocument: ActiveDocumentRow | null;
  // Opzionali: caricati solo se la skill lo dichiara in requiredData
  readonly currentRequirement: unknown | null; // LocationRequirementRow quando caricato
  readonly activeShootingDay: unknown | null; // ShootingDayRow quando caricato
}
```

> **Nota:** `currentRequirement` e `activeShootingDay` sono `unknown | null` nel domain perché i tipi DB (`LocationRequirementRow`, `ShootingDayRow`) appartengono ad `apps/web`. Agent D usa i tipi concreti localmente e assegna a `LocalContext` senza problemi — TypeScript accetta `LocationRequirementRow` dove si aspetta `unknown`.

### apps/web/app/features/predictions/skills/types.ts

```typescript
import { ResultAsync } from "neverthrow";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { CesareError } from "../cesare.errors";

// ─── ToolUseBlock / ToolResult ─────────────────────────────────────────────
// Riprendono la forma usata dagli executor esistenti in cesare-tools.ts.
// Non duplicare — importare da cesare-tools.ts se già esportati, altrimenti
// definirli qui come canone.

export interface ToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface ToolResult {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content: string;
}

// ─── AnthropicTool ────────────────────────────────────────────────────────
// Alias per la forma accettata dall'SDK — non importare dall'SDK nel domain.

export type AnthropicTool = {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
};

// ─── DataRequirement ─────────────────────────────────────────────────────

export type DataRequirement =
  | "budget"
  | "schedule"
  | "locations"
  | "breakdown"
  | "screenplay"
  | "documents"
  | "shot-plans";

// ─── SkillId ──────────────────────────────────────────────────────────────

export type SkillId =
  | "locations"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "document-edit"
  | "screenplay-edit"
  | "read-scene"
  | "read-document";

// ─── SkillExecutor ────────────────────────────────────────────────────────
// Firma DEFINITIVA — differisce dalla spec (che passava toolName+input separati).
// Il ToolUseBlock completo è necessario per costruire ToolResult con il corretto
// tool_use_id richiesto dall'API Anthropic.

export type SkillExecutor = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
  access: ProjectAccess,
) => ResultAsync<ToolResult, CesareError>;

// ─── SkillBuildContext ───────────────────────────────────────────────────
// Argomenti passati alle factory function delle skill per materializzare
// guidanceBlock come stringa statica (deterministica per la cache Anthropic).

export interface SkillBuildContext {
  readonly bible: import("@oh-writers/domain").FilmBible | null;
  readonly activeSceneId: string | null;
  readonly activeDayNumber: number | null;
  readonly requirementId: string | null;
}

// ─── Skill ────────────────────────────────────────────────────────────────

export interface Skill {
  readonly id: SkillId;
  readonly tools: readonly AnthropicTool[];
  readonly guidanceBlock: string; // testo statico, già materializzato
  readonly executor: SkillExecutor;
  readonly requiredData: readonly DataRequirement[];
}

// ─── SkillRegistry ────────────────────────────────────────────────────────

export type PageType =
  | "soggetto"
  | "synopsis"
  | "outline"
  | "treatment"
  | "screenplay"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "locations";

// CesareIntent è il tipo già esistente in cesare-intent-classifier.ts.
// Importarlo da lì per evitare duplicazioni.
import type { IntentResult } from "../cesare-intent-classifier";

export interface SkillRegistry {
  get(id: SkillId): Skill | undefined;
  selectForPage(page: PageType, intent: IntentResult | null): Skill[];
  allTools(skills: readonly Skill[]): readonly AnthropicTool[];
  combinedExecutor(skills: readonly Skill[]): SkillExecutor;
}
```

### apps/web/app/features/predictions/skills/registry.ts — forma attesa

```typescript
import type { SkillRegistry, Skill, SkillId, PageType } from "./types";
import type { IntentResult } from "../cesare-intent-classifier";

// Ogni skill è importata dalla sua skill file
import { buildLocationsSkill } from "./locations.skill";
import { buildReadSceneSkill } from "./read-scene.skill";
// ... etc.

export const buildSkillRegistry = (
  context: SkillBuildContext,
): SkillRegistry => {
  const skills: Record<SkillId, Skill> = {
    locations: buildLocationsSkill(context),
    "read-scene": buildReadSceneSkill(context),
    // ...
  };

  return {
    get: (id) => skills[id],
    selectForPage: (page, intent) => {
      /* mapping page → SkillId[] */
    },
    allTools: (selected) => selected.flatMap((s) => s.tools),
    combinedExecutor: (selected) => (block, db, projectId, access) => {
      const owner = selected.find((s) =>
        s.tools.some((t) => t.name === block.name),
      );
      if (!owner) {
        return errAsync(new CesareError(`Unknown tool: ${block.name}`));
      }
      return owner.executor(block, db, projectId, access);
    },
  };
};
```

### apps/web/app/features/predictions/skills/\*.skill.ts — forma attesa per ogni skill

```typescript
// Esempio: skills/locations.skill.ts
import type { Skill, SkillBuildContext } from "./types";
import { CESARE_LOCATION_TOOLS } from "../cesare-tools";
import { CESARE_READ_TOOLS, tryExecuteReadTool } from "../cesare-read-tools";
import { executeTool } from "../cesare-tools"; // executor esistente
import { okAsync } from "neverthrow";
import { CesareError } from "../cesare.errors";
import { formatBibleForLocations } from "@oh-writers/domain";

const buildGuidance = (
  bible: import("@oh-writers/domain").FilmBible | null,
): string => {
  const settingPrior =
    bible !== null ? `\n\n${formatBibleForLocations(bible)}` : "";
  return `\n\nRUOLO: in questa pagina sei un LOCATION SCOUTER esperto...${settingPrior}...`;
  // ← testo identico all'attuale buildLocationsToolsGuidance, estratto qui
};

export const buildLocationsSkill = (ctx: SkillBuildContext): Skill => ({
  id: "locations",
  tools: [...CESARE_LOCATION_TOOLS, ...CESARE_READ_TOOLS] as AnthropicTool[],
  guidanceBlock: buildGuidance(ctx.bible),
  executor: (block, db, projectId) => {
    const readResult = tryExecuteReadTool(block, db, projectId);
    if (readResult) return readResult;
    return executeTool(block, db, projectId, ctx.requirementId);
  },
  requiredData: ["locations", "screenplay"],
});
```

### assembleSystemPrompt — contratto di output

```typescript
// apps/web/app/features/predictions/cesare-assembler.ts (file nuovo)
import type { SystemPromptBlock } from "./cesare.server"; // già esportato
import type { GlobalContext } from "@oh-writers/domain";
import type { LocalContext } from "@oh-writers/domain";
import type { Skill } from "./skills/types";

// Testo fisso — non cambia mai, posizione 0 della cache.
const ROLE_TEXT = `Sei Cesare, l'assistente AI di Oh Writers...`; // ← copiato da cesare.server.ts

export const assembleSystemPrompt = (
  global: GlobalContext,
  skills: readonly Skill[],
  local: LocalContext,
): SystemPromptBlock[] => [
  { type: "text", text: ROLE_TEXT, cache_control: { type: "ephemeral" } },
  {
    type: "text",
    text: formatGlobalContextBlock(global), // formatta GlobalContext come testo
    cache_control: { type: "ephemeral" },
  },
  ...skills.map((s) => ({
    type: "text" as const,
    text: s.guidanceBlock,
    cache_control: { type: "ephemeral" },
  })),
  {
    type: "text",
    text: formatLocalContext(local), // nessun cache_control — dinamico
  },
];
```

---

## Checklist per ogni agente prima di committare

- [ ] `pnpm tsc --noEmit` verde (tutti i workspace)
- [ ] `pnpm test:unit` verde
- [ ] `pnpm lint` verde
- [ ] Nessun import da `@anthropic-ai/sdk` in `packages/domain`
- [ ] Nessun import da `apps/web` in `packages/domain`
- [ ] Ogni skill file ha `requiredData` dichiarato
- [ ] `cesare-tool-loop.mock.ts` non modificato (salvo Agent E che aggiunge scenari)
- [ ] Il wire protocol `askCesare` (input/output shape) non cambia

---

## Riferimenti

- `docs/specs/39-context-stratification.md` — spec completa
- `apps/web/app/features/predictions/cesare.server.ts` — codice da refactorare
- `apps/web/app/features/predictions/cesare-tools.ts` — executor e tool loop esistenti
- `apps/web/app/features/predictions/cesare-read-tools.ts` — read tools da promuovere a skill
- `apps/web/app/features/predictions/cesare-intent-classifier.ts` — `IntentResult` da riusare
- `packages/domain/src/context-templates/film-bible.ts` — `formatGlobalContext`, `formatBibleForLocations`
- `packages/domain/src/bible/schema.ts` — `FilmBible` type
