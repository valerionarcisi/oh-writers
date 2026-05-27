# Spec 39 — Context Stratification: Global / Local / Skills

**Status:** SPEC ONLY  
**Priority:** P0 — sostituisce l'architettura lazy RAG  
**Dipende da:** Spec 38 (Film Bible, scene summaries — BUILT)  
**Blocca:** ogni nuova feature Cesare che tocca il system prompt

---

## Problema

Spec 38 ha introdotto il Film Bible come blocco cached in posizione fissa. Ma il sistema di assemblea del contesto in `cesare.server.ts` è ancora monolitico: `assembleContext` carica tutto, `buildSystemPrompt` impila i blocchi in sequenza, e ogni page aggiunge la propria guidance in un unico blob.

Tre sintomi concreti:

1. **Coupling page/context**: aggiungere una nuova page (es. `storyboard`) richiede modificare `assembleContext`, `buildSystemPrompt`, `buildToolGuidanceBlock`, e il router manuale in `handleAskCesare`. Quattro punti di modifica per una feature.

2. **Cache instabile per page switching**: quando l'utente naviga da `locations` a `breakdown`, il blocco tool-guidance cambia contenuto → cache miss. Non c'è modo di separare "cosa cambia sempre" da "cosa cambia per tipo di page".

3. **Lazy RAG incompleto**: `assembleContext` carica ancora tutto (scene, budget, schedule, locations, documents) ad ogni call anche quando Cesare non ne ha bisogno. Il lazy RAG descritto in `cesare-architecture.md §2` non è mai stato completato — si è implementato il Film Bible invece, che è un passo diverso nella giusta direzione.

---

## Soluzione: tre layer espliciti

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

Ogni layer ha un'interfaccia chiara, è testabile in isolamento, e può essere aggiornato senza toccare gli altri.

---

## Domain model

### GlobalContext

```typescript
interface GlobalContext {
  readonly projectTitle: string;
  readonly genre: string | null;
  readonly format: string;
  readonly bible: FilmBible | null;
}
```

Prodotto da `buildGlobalContext(db, projectId)`. Memoizzato in-process per TTL = 60s (allineato alla bible lazy re-distill). Serializzato come blocco cached in posizione 1 del system prompt.

### LocalContext

```typescript
interface LocalContext {
  readonly currentScene: SceneRow | null;
  readonly sceneWindow: SceneBodyRow[]; // ±2 scene con body
  readonly activeDocument: ActiveDocumentRow | null;
  readonly currentRequirement: LocationRequirementRow | null;
  readonly activeShootingDay: ShootingDayRow | null;
}
```

Prodotto da `buildLocalContext(db, projectId, pageContext)`. Carica solo i dati rilevanti per la page corrente — non tutto. Non cachato. È il blocco dynamic.

### Skill

```typescript
interface Skill {
  readonly id: SkillId;
  readonly tools: AnthropicTool[];
  readonly guidanceBlock: string; // testo del tool-guidance block
  readonly executor: SkillExecutor;
  readonly requiredData: DataRequirement[]; // cosa serve dal DB
}

type SkillId =
  | "locations"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "document-edit"
  | "screenplay-edit"
  | "read-scene" // lazy RAG read tool
  | "read-document"; // lazy RAG read tool
```

Ogni skill è un modulo autonomo:

- `tools` → le tool definition Anthropic
- `guidanceBlock` → il testo del sistema prompt per quella skill (cachato)
- `executor` → la funzione che esegue ogni tool call
- `requiredData` → dichiarazione di cosa la skill deve caricare dal DB prima dell'esecuzione

### SkillSet

L'`intentClassifier` (già esistente) seleziona quali skill iniettare:

```typescript
const selectSkills = (
  page: PageType,
  intent: CesareIntent,
): SkillId[] => { ... };
```

Regole base:

- Ogni page ha un set di skill primarie (es. `locations` → `["locations", "read-scene"]`)
- L'intent classifier può aggiungere skill secondarie (es. query su budget da locations page → aggiunge `"budget"`)
- Le read-tools (`read-scene`, `read-document`) sono always-on come skill lazy RAG

---

## Architettura del system prompt risultante

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

Regola fondamentale: **i blocchi cached sono sempre in posizione fissa**. La posizione 2 è sempre il primo skill block, la posizione 3 il secondo, ecc. Il numero di skill blocks può variare (1-3), ma la sequenza è sempre `Global → Skills → Local`.

Il blocco Local è sempre l'ultimo e non ha mai `cache_control`.

---

## Lazy RAG completato

`assembleContext` oggi carica ~3000 token di dati ad ogni call anche quando Cesare risponde "certo, dimmi di più" (nessun tool call). Con la stratificazione:

### Cosa carica il LocalContext (lean)

Per una call su `locations` page:

- Scene list: solo `(id, number, heading)` — metadata, no body
- Current requirement: full row (già nel contesto attivo)
- Characters: lista nomi, no dettagli

**Non carica**: scene bodies, budget lines, schedule days, document contents.

### Come Cesare ottiene i dettagli

Tramite le read-tools della skill `read-scene` e `read-document`:

```
read_scene(number)           → body completo di una scena
read_scene_range(from, to)   → range di scene
read_document(type)          → contenuto soggetto/synopsis/...
read_budget_lines(topSheet?)  → budget rows filtrate
read_breakdown(sceneId?)      → elementi breakdown
```

Questi tool esistono già come `cesare-read-tools.ts` ma non sono mai stati wired come skill nel loop principale. La stratificazione li promuove a first-class citizens.

### Risparmio atteso

| Scenario                    | Oggi (spec 38)    | Spec 39            | Delta |
| --------------------------- | ----------------- | ------------------ | ----- |
| Chat semplice "cosa pensi?" | ~3500 token input | ~1200 token input  | −66%  |
| Agentic locations (3 tool)  | ~4200 token input | ~1800 + 2×300 read | −40%  |
| Doc edit (read + write)     | ~3800 token input | ~1500 + 1×600 read | −45%  |

Il Film Bible è già cached → non conta nei token input effettivi dalla 2ª call.

---

## Refactor piano

### Phase 1 — Interfacce e tipi (no behavior change)

1. Definire `GlobalContext`, `LocalContext`, `Skill`, `SkillId` in `packages/domain/src/context/`
2. Definire `SkillRegistry` in `apps/web/app/features/predictions/skills/registry.ts`
3. Nessuna modifica al comportamento runtime — solo tipi

### Phase 2 — Estrarre le skill esistenti

Per ogni page, estrarre la guidance + tools + executor dall'attuale `cesare.server.ts` e `cesare-tools.ts` in un file `skills/<page>.skill.ts`:

```
skills/
├── locations.skill.ts
├── breakdown.skill.ts
├── budget.skill.ts
├── schedule.skill.ts
├── shooting-plan.skill.ts
├── document-edit.skill.ts
├── screenplay-edit.skill.ts
├── read-scene.skill.ts      ← lazy RAG
└── read-document.skill.ts   ← lazy RAG
```

Ogni skill esporta `const locationSkill: Skill = { id, tools, guidanceBlock, executor, requiredData }`.

### Phase 3 — Nuovo assembler

Sostituire `buildSystemPrompt` con `assembleSystemPrompt(global, skills, local)`:

```typescript
const assembleSystemPrompt = (
  global: GlobalContext,
  skills: Skill[],
  local: LocalContext,
): SystemPromptBlock[] => [
  { type: "text", text: ROLE_TEXT, cache_control: { type: "ephemeral" } },
  {
    type: "text",
    text: formatGlobalContext(global),
    cache_control: { type: "ephemeral" },
  },
  ...skills.map((s) => ({
    type: "text" as const,
    text: s.guidanceBlock,
    cache_control: { type: "ephemeral" },
  })),
  { type: "text", text: formatLocalContext(local) },
];
```

### Phase 4 — LocalContext lean

Riscrivere `assembleContext` come `buildLocalContext` che carica solo i dati dichiarati nei `requiredData` delle skill selezionate. Budget non viene caricato se nessuna skill lo dichiara.

### Phase 5 — Intent → Skill selection

Spostare `classifyIntent` da pre-filtro a orchestratore dell'assemblea: riceve `page + userMessage` e restituisce `SkillId[]`. Il risultato determina quali skill vengono iniettate nel prompt e quali tool sono disponibili.

---

## Interfacce chiave

### SkillExecutor

```typescript
type SkillExecutor = (
  toolName: string,
  input: unknown,
  db: Db,
  projectId: string,
  access: ProjectAccess,
) => ResultAsync<ToolResult, CesareError>;
```

### SkillRegistry

```typescript
interface SkillRegistry {
  get(id: SkillId): Skill;
  selectForPage(page: PageType, intent: CesareIntent): Skill[];
  allTools(skills: Skill[]): AnthropicTool[];
  combinedExecutor(skills: Skill[]): SkillExecutor;
}
```

`combinedExecutor` unisce gli executor di tutte le skill selezionate in un unico dispatcher:

```typescript
combinedExecutor: (skills) => (toolName, input, db, projectId, access) => {
  const skill = skills.find((s) => s.tools.some((t) => t.name === toolName));
  if (!skill) return errAsync(new CesareError(`Unknown tool: ${toolName}`));
  return skill.executor(toolName, input, db, projectId, access);
};
```

---

## Test plan

### Vitest [OHW-039a] — GlobalContext

- `buildGlobalContext` restituisce bible quando presente
- `buildGlobalContext` restituisce `bible: null` senza crash quando non ancora distillata
- Formato del blocco cached — testo inizia con `[FILM BIBLE]` o `[PROJECT]`

### Vitest [OHW-039b] — SkillRegistry

- `selectForPage("locations", intent)` restituisce `["locations", "read-scene"]` minimo
- `combinedExecutor` dispatcha sul tool corretto tra skill multiple
- Tool name collision tra skill → errore esplicito al build time

### Vitest [OHW-039c] — LocalContext lean

- `buildLocalContext("locations", ctx)` NON carica budget lines
- `buildLocalContext("budget", ctx)` carica budget lines
- `buildLocalContext` con page sconosciuta → ok, context vuoto

### Vitest [OHW-039d] — assembleSystemPrompt

- Blocchi in ordine corretto: ROLE → GLOBAL → SKILLS → LOCAL
- Blocco LOCAL è sempre l'ultimo e non ha `cache_control`
- Con 0 skill selezionate → prompt valido (solo ROLE + GLOBAL + LOCAL)

### Mock E2E [OHW-039e]

- Cesare su locations page usa `read_scene` per ottenere corpo di una scena
- Cesare su breakdown page non riceve budget tools
- Cesare su budget page riceve `read_budget_lines` e lo chiama quando necessario

---

## Deviazioni accettate in implementazione

- **Phase 1-2** possono essere mergiate in un unico commit (tipi + estrazione skill)
- Il `SkillRegistry` può iniziare come oggetto semplice (no classe) se l'interfaccia è rispettata
- La memoizzazione del GlobalContext in-process (TTL 60s) può essere omessa in Phase 1 e aggiunta in Phase 4
- La read-tools skill può rimanere in `cesare-read-tools.ts` nella sua forma attuale se l'interfaccia `Skill` è rispettata — non è necessario riscriverla

## Non fare

- Non aggiungere un DI container o service locator — `SkillRegistry` è un oggetto semplice
- Non usare decoratori o metaprogramming
- Non cambiare il wire protocol client/server (`askCesare` input/output shape invariata)
- Non introdurre `pgvector` o embeddings — la lazy RAG strutturata è sufficiente per feature film

---

## Riferimenti

- `docs/cesare-architecture.md` — architettura corrente e §2 lazy RAG (non completato)
- `docs/specs/38-context-engineering.md` — Film Bible (prerequisito, BUILT)
- `apps/web/app/features/predictions/cesare.server.ts` — codice da refactorare
- `apps/web/app/features/predictions/cesare-read-tools.ts` — read tools da promuovere a skill
- `apps/web/app/features/predictions/cesare-intent-classifier.ts` — da evolvere in skill selector
