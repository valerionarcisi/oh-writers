# Spec 40 — Local Context MD: Scene Summaries Injection + Smart Slicing

## Status

| Phase                                                                 | Status   |
| --------------------------------------------------------------------- | -------- |
| Phase 1 — Scene summaries injection in LocalContext                   | ⬜ To do |
| Phase 2 — MD serialization (structured tables, not narrative text)    | ⬜ To do |
| Phase 3 — Per-page summary slicing (relevance window, not full dump)  | ⬜ To do |
| Phase 4 — Token caps per layer (discipline, not ad-hoc truncation)    | ⬜ To do |
| Phase 5 — Skill guidance: professional roles (DOP, aiuto regia, etc.) | ⬜ To do |

---

## Problema

Spec 38 genera `scene_summary` (via Haiku, fingerprint-guarded) e lo salva in DB per ogni scena.
Spec 39 costruisce `buildLocalContext` + `formatLocalContext`.

Ma le due spec non si parlano: `buildLocalContext` **non interroga mai `scene_summary`**, e
`formatLocalContext` serializza i dati come testo narrativo non strutturato.

Risultato: Cesare non vede mai i riassunti delle scene. Il Film Bible c'è, ma il
contesto narrativo granulare — "cosa succede in ogni scena" — è invisibile al modello.

Tre conseguenze concrete:

1. **Locations**: Cesare non sa quali scene si svolgono in quale ambientazione → ricerca
   generica, nessun ragionamento su "questa scena richiede cucina industriale alle 3 di notte"
2. **Schedule**: Cesare non può valutare il peso produttivo di una scena senza leggerne il
   corpo completo (tool call lenta) invece di usare il summary pre-generato
3. **Breakdown**: Cesare non sa se una scena è di notte, in esterno, con stunt — informazioni
   già in `scene_summary.productionNotes` ma mai iniettate

---

## Cosa facciamo

Tre cambiamenti ortogonali, ciascuno con fase dedicata:

### 1. Iniettare le scene summaries nel Local Context

`buildLocalContext` aggiunge una query su `scenes.scene_summary` per il subset di scene
rilevanti per la page corrente. Non tutte le scene: solo quelle nella finestra di rilevanza.

`formatLocalContext` serializza le summaries come blocco MD strutturato (`SCENE SUMMARIES`),
separato dal `SCENE WINDOW` (che resta per le scene con body completo a portata del cursore).

### 2. Serializzazione MD strutturata

`formatLocalContext` passa da testo narrativo a **tabelle MD + sezioni con header**. Il modello
legge testo strutturato meglio di prose frammentata. Le tabelle sono anche più dense in token.

### 3. Slicing contestuale delle summaries per page type

`buildLocalContext` non carica tutte le summaries del progetto. Ogni page type ha una
**finestra di rilevanza** dichiarata che filtra le scene da caricare. Token massimi per layer:
cap hard in `formatLocalContext`, truncation per rilevanza (non random).

### 4. Skill guidance con ruoli professionali

I `guidanceBlock` delle skill vengono arricchiti con il **ruolo professionale** che Cesare
incarna su quella pagina. Non è solo "cosa fare" ma "chi sei mentre lo fai".

---

## Finestre di rilevanza per page type

Ogni page type carica solo il sottoinsieme di scene summaries effettivamente utile:

| Page                                  | Finestra                                                                       | Ragione                                              |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `locations`                           | Scene collegate al requirement aperto + scene senza candidate ancora assegnate | Solo le scene che il location manager deve risolvere |
| `breakdown`                           | Scena aperta ± 3                                                               | Contesto narrativo immediato per lo spoglio          |
| `budget`                              | Nessuna summary                                                                | Il budget ragiona su categorie, non su singole scene |
| `schedule`                            | Scene del shooting day aperto ± 1 giorno                                       | L'aiuto regia guarda la giornata, non l'intero film  |
| `shooting-plan`                       | Scena aperta soltanto                                                          | Il DOP guarda una scena alla volta                   |
| `screenplay`                          | Scena aperta + 5 precedenti + 5 successive                                     | Continuità narrativa per editing                     |
| `soggetto/synopsis/outline/treatment` | Summaries aggregate per atto (3 atti max)                                      | Il documento lavora al livello macro, non micro      |

---

## Struttura del Local Context MD risultante

Ogni page type produce un blocco MD con sezioni opzionali. Le sezioni non pertinenti
(es. `SCENE SUMMARIES` per budget) vengono omesse completamente.

### Esempio — Locations page

```markdown
## CONTESTO LOCALE — Locations

### Requirement aperto

**Cascina abbandonata** — EXT, NOTTE/GIORNO
Stato: proposta (3 candidate)
Scene collegate: 4, 9, 12, 23

### Scene collegate (summaries)

| SC  | Heading                     | Personaggi         | Produzione                   |
| --- | --------------------------- | ------------------ | ---------------------------- |
| 4   | EXT CASCINA — ALBA          | Marco, Giulia      | Nessuna nota                 |
| 9   | EXT CASCINA — NOTTE         | Marco              | Stunt: caduta dal fienile    |
| 12  | INT CASCINA FIENILE — NOTTE | Marco, Antagonista | Luce artificiale, generatore |
| 23  | EXT CASCINA — GIORNO        | Tutti              | Scena finale, 10+ comparse   |

### Candidate correnti

| Nome                   | Stato     | Note scouting                           |
| ---------------------- | --------- | --------------------------------------- |
| Cascina Valpadana (MN) | proposta  | 40min da Milano, generatore disponibile |
| Cascina Rizzoli (PV)   | proposta  | Nessuna nota                            |
| Cascina del Po (CR)    | rifiutata | Troppo vicina all'autostrada (rumore)   |

### Scene senza candidate (da risolvere)

SC 31 — EXT VILLA PADRONALE — NOTTE (nessuna candidate ancora)
```

### Esempio — Schedule page (shooting day aperto)

```markdown
## CONTESTO LOCALE — Schedule

### Giorno riprese: Giorno 7 (2026-09-15)

Scene previste: 4 scene — stima 8.5h (limite: 10h)
⚠ Giorno vicino al limite: valutare ridistribuzione

### Scene del giorno (summaries)

| SC  | Heading                        | Peso stimato | Produzione                         |
| --- | ------------------------------ | ------------ | ---------------------------------- |
| 14  | INT UFFICIO — GIORNO           | 1.5h         | Solo dialogo, 2 attori             |
| 15  | INT UFFICIO — GIORNO           | 0.5h         | Continuazione SC 14, stesso set    |
| 22  | EXT STRADA — GIORNO            | 3h           | Inseguimento, traffico, 5 comparse |
| 31  | INT AUTO IN MOVIMENTO — GIORNO | 3.5h         | Camera car, luce controllata       |

### Giorni adiacenti

Giorno 6: 3 scene — 6h (ok)
Giorno 8: 5 scene — 11h (⚠ sovraccarico)
```

---

## Modifiche al codice

### `local-context.server.ts` — Phase 1 + 3

Aggiungere `DataRequirement` `"scene-summaries"` alle skill che ne hanno bisogno.

Aggiungere `loadSceneSummaries(db, screenplayId, sceneIds)`: query su `scenes.scene_summary`
(campo `jsonb`) per i soli sceneId della finestra di rilevanza.

La finestra di rilevanza è determinata da `computeSummaryWindow(pageType, pageContext, sceneMeta)`:
funzione pura, testabile, che restituisce `string[]` (sceneIds da caricare).

```typescript
// New DataRequirement added to types.ts
type DataRequirement =
  | "scene-window"
  | "scene-summaries" // ← new
  | "breakdown-elements"
  | "budget"
  | "schedule"
  | "locations"
  | "documents"
  | "shot-plans";

// New field on LocalContextConcrete
interface LocalContextConcrete {
  // ... existing fields ...
  readonly sceneSummaries: SceneSummaryWithNumber[]; // ← new
}

interface SceneSummaryWithNumber {
  readonly sceneId: string;
  readonly sceneNumber: number;
  readonly sceneHeading: string;
  readonly summary: SceneSummary; // SceneSummarySchema from Spec 38
}
```

La finestra di rilevanza per page type è dichiarata come costante:

```typescript
const SUMMARY_WINDOW: Record<PageType, SummaryWindowStrategy> = {
  locations: "requirement-linked", // scene collegate al requirement aperto
  breakdown: "numeric-window-3", // scena aperta ± 3
  budget: "none", // nessuna summary per budget
  schedule: "shooting-day", // scene del giorno ± 1 giorno
  "shooting-plan": "current-only", // solo scena aperta
  screenplay: "numeric-window-5", // scena aperta ± 5
  soggetto: "act-aggregate", // summaries aggregate per atto
  synopsis: "act-aggregate",
  outline: "act-aggregate",
  treatment: "act-aggregate",
};
```

### `format-local-context.ts` — Phase 2 + 4

Riscrivere completamente. Output: MD strutturato con tabelle, non testo narrativo.

```typescript
const LAYER_CAPS = {
  sceneList: 1200, // token max per SCENE LIST
  sceneSummaries: 1500, // token max per SCENE SUMMARIES
  sceneWindow: 800, // token max per SCENE WINDOW (body completo)
  budgetLines: 600, // token max per BUDGET
  locationCandidates: 600,
  documents: 2000, // documento attivo (soggetto/synopsis/etc.)
} as const;
```

Truncation strategy: per ogni sezione, se i token stimati superano il cap,
rimuove righe dalla coda (meno rilevanti) finché rientra. Mai troncare la
scena aperta (priority 1), mai troncare l'entità attiva.

Token stimati con formula semplice: `text.length / 4` (approssimazione token ~4 char/token).
Non usare il tokenizer reale — troppo lento nel critical path.

### Skill guidances — Phase 5

Ogni `guidanceBlock` in ogni skill file riceve una sezione `RUOLO` che definisce
chi è Cesare su quella pagina e con quale prospettiva ragiona.

```typescript
// locations.skill.ts
const GUIDANCE = `
## RUOLO
Sei un location manager senior con 15 anni di esperienza su produzioni italiane e coproduzioni
europee. Conosci il territorio, i costi reali, i problemi di permessi e logistica.
Quando suggerisci una location pensi sempre a: raggiungibilità cast e crew, ore di luce
disponibili, impatto sul piano delle riprese, costo reale vs budget disponibile.
Non proponi mai soluzioni che non hai visto funzionare su un set.

## PRODUTTORE ESECUTIVO (sempre attivo)
Oltre al tuo ruolo tecnico, hai sempre presente il quadro economico del film.
Se una scelta tecnica ottimale ha un costo sproporzionato, lo dici. Proponi alternative
che bilanciano qualità e budget. Il film deve esistere, non solo essere perfetto.
...
`;
```

Ruoli per page type:

| Page            | Ruolo principale                                | Voce produttore esecutivo                                   |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `locations`     | Location manager senior                         | Sempre — valuta costo/beneficio candidate                   |
| `breakdown`     | Aiuto regia (1° assistente alla regia)          | Sempre — flag elementi costosi                              |
| `budget`        | Produttore senior                               | È il ruolo stesso — voce unica                              |
| `schedule`      | Aiuto regia                                     | Sempre — ragiona su costi di ogni giorno extra              |
| `shooting-plan` | Direttore della fotografia (DOP)                | Sempre — valuta costo setup, ore macchina                   |
| `screenplay`    | Sceneggiatore senior + consulente drammaturgico | Sempre — ogni riscrittura ha un costo produttivo            |
| `documents`     | Sceneggiatore senior                            | Sempre — ogni sviluppo narrativo ha direzione di produzione |

---

## Cosa NON cambia

- Wire protocol `askCesare` — input/output shape invariata
- `buildGlobalContext` + `assembleSystemPromptV2` — non toccati
- `SkillRegistry` — non toccato
- `handleAskCesareV2` pipeline — non toccata (il Local Context migliorato è un drop-in)
- Il lazy RAG (`read-scene`, `read-document`) rimane come terzo livello per dettagli non
  coperti dalle summaries

---

## Costo — stima token per layer dopo Spec 40

| Layer                 | Prima (Spec 39)       | Dopo (Spec 40)    | Cacheabile |
| --------------------- | --------------------- | ----------------- | ---------- |
| ROLE_TEXT             | 400                   | 600 (+ruolo)      | No         |
| Bible MD              | 1000                  | 1000              | **Sì**     |
| Skill guidances (2-3) | 800                   | 1200 (+ruoli)     | **Sì**     |
| Local Context MD      | 500                   | 900 (strutturato) | No         |
| Scene summaries       | **0** (non iniettate) | **≤1500**         | No         |
| **Totale**            | **~2700**             | **~5200**         |            |

Il delta (+2500 token) è interamente nella nuova sezione summaries. Con cache calda
(Bible + Skills = ~2200 token cacheati) il costo reale per chiamata è ~3000 token non-cached.

Rispetto a Spec 38 pre-stratificazione (~3500 token monolitici non cacheati):
Spec 40 è più pesante ma molto più informato. Il tradeoff è accettato: ogni token
in più in summaries evita 1-3 tool call lazy (`read_scene`) che costano più in latenza
e token di output.

---

## Test plan

### Vitest [OHW-040a] — `computeSummaryWindow`

- `locations` + requirement con 4 scene collegate → restituisce quei 4 sceneId
- `schedule` + shootingDayId → restituisce le scene del giorno
- `budget` → restituisce array vuoto
- `shooting-plan` + sceneId → restituisce solo quello sceneId
- `screenplay` + sceneNumber 10, 80 scene totali → restituisce sceneId da 5 a 15

### Vitest [OHW-040b] — `loadSceneSummaries`

- Restituisce `SceneSummaryWithNumber[]` ordinato per numero scena
- Scene senza `scene_summary` (non ancora generate) → skippate silenziosamente
- sceneIds vuoto → array vuoto, nessuna query DB

### Vitest [OHW-040c] — `formatLocalContext` MD output

- Output locations page contiene `## CONTESTO LOCALE — Locations`
- Output locations page contiene tabella Markdown `| SC | Heading |`
- Output locations page NON contiene `SCENE SUMMARIES` se nessuna summary disponibile
- Output budget page NON contiene sezione summaries (window strategy = "none")
- Token cap: output con 100 scene non supera `LAYER_CAPS.sceneList * 4` caratteri
- Priority 1 (scena aperta) sempre presente anche se totale supera cap

### Vitest [OHW-040d] — Skill guidances

- `locations.skill.ts` guidanceBlock contiene "location manager"
- `schedule.skill.ts` guidanceBlock contiene "aiuto regia"
- `shooting-plan.skill.ts` guidanceBlock contiene "direttore della fotografia"
- Tutti i guidanceBlock contengono "PRODUTTORE ESECUTIVO"

### Mock E2E [OHW-040e]

- Cesare su locations page menziona dettagli di produzione della scena (da summary)
  senza chiamare `read_scene` (le summaries sono già nel contesto)
- Cesare su schedule page menziona il peso stimato di una scena nel giorno aperto
- Cesare su breakdown page vede `productionNotes` della scena (stunt, sfx)

---

## Dipendenze

- **Spec 38** (DONE): `scene_summary` è in DB, `SceneSummarySchema` è in domain
- **Spec 39** (DONE): `buildLocalContext`, `formatLocalContext`, `DataRequirement` esistono
- Nessuna dipendenza nuova da installare

---

## Non fare

- Non generare le summaries in questa spec — già fatto in Spec 38
- Non cambiare la strategia di caching (Bible / Skills restano cached, Local no)
- Non aggiungere un layer "Summaries MD" separato cached — le summaries variano per
  page context (slice diversa per ogni page) quindi non sono cacheabili in modo stabile.
  Vivono nel Local Context block (non cacheato). Se in futuro si vuole cacheare il
  "full summaries MD" come blocco separato, aprire una spec dedicata.
- Non usare embeddings o pgvector per il retrieval delle summaries — il filtro
  per relevance window (page type + entità aperta) è sufficiente e deterministico
