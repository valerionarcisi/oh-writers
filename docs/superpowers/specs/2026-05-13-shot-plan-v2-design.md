# Spec 22b — Piano di Ripresa v2: piani paralleli, reference sceneggiatura, scorciatoie regista

> **Status:** draft
> **Date:** 2026-05-13
> **Depends on:** Spec 22 (shot plan baseline), Spec 22a (decouple from schedule)
> **Future hooks:** Spec 22c (2D scene blocking), Spec 22d (audio waveforms)

---

## Problem

Spec 22a ha disaccoppiato il Piano di Ripresa dallo schedule e introdotto la sidebar scene. Restano tre limiti:

1. **Confronto tra piani impossibile a colpo d'occhio.** I piani vivono come tab — vedi sempre uno solo, devi cliccare per confrontare durata e copertura. Il regista che valuta "Piano A pieno" vs "Piano B essenziale" non può tenerli sotto gli occhi insieme.

2. **Nessuna reference al testo della scena.** Per pianificare gli shot serve avere sotto mano dialoghi e azione. Oggi il regista deve aprire un'altra tab del browser sullo Screenplay editor.

3. **Pagina vuota all'apertura di una scena nuova.** L'utente trova un bottone "Inizia piano di ripresa" e basta. Niente suggerimento di copertura, niente shortcut per pattern standard (master, campo/controcampo, ecc.). Tutto da zero ogni volta.

---

## Overview

Tre cambi indipendenti ma coordinati:

1. **Piani paralleli su ruler condiviso 0–8h.** Tutti i piani visibili insieme di default, impilati verticalmente. Pill bar in alto a destra per nascondere quelli non in focus. Marker fisso a "fine giornata" 8h. Overflow oltre 8h tinto rosso.

2. **Pannello sceneggiatura collapsible.** Tab verticale 36px sul bordo sinistro del main area, sempre presente. Click espande a ~320px col fountain renderizzato della scena (read-only). Preferenza aperto/chiuso persistente per utente.

3. **Scorciatoie regista + auto-populate.** Apertura di una scena mai pianificata = creazione automatica di "Piano A" pre-popolato col pattern consigliato dal breakdown. Quick-add toolbar coi tasti shot type + dropdown pattern. Right-click context menu con duplica/sposta/controcampo.

---

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Piano di Ripresa                                                │
├──────────┬──────────────────────────────────────────────────────┤
│          │  [📄 SCENA ▶]   2D Blocking (placeholder spec #3)    │
│  Scene   ├──────────────────────────────────────────────────────┤
│  Sidebar │  + WS  EWS  MS  OTS  CU  ECU  INSERT  | ▼ Pattern… │
│          ├──────────────────────────────────────────────────────┤
│  SC.1    │  Mostra: [✓ Piano A] [✓ Piano B] [○ Piano C] [+]    │
│  SC.2    ├──────────────────────────────────────────────────────┤
│ ▶SC.3    │  0h     2h     4h     6h     8h▌                    │
│  SC.4    │  Piano A [ATTIVO]   ┌────WS────┐┌MS┐┌CU┐            │
│  SC.5    │  Piano B [RENDI ATT]┌────WS────┐┌MS┐                │
│          │                                                       │
│          ├──────────────────────────────────────────────────────┤
│          │  ShotDetailPanel (quando uno shot è selezionato)     │
└──────────┴──────────────────────────────────────────────────────┘
```

Quando il pannello sceneggiatura è aperto:

```
┌──────────┬─────────┬──────────────────────────────────────────┐
│  Scene   │ 📄 Scena│  2D Blocking placeholder                 │
│  Sidebar │ testo   ├──────────────────────────────────────────┤
│          │ fountain│  Toolbar + Picker + Tracks (più strette) │
└──────────┴─────────┴──────────────────────────────────────────┘
```

---

## Layout Components

### `ShootingPlanPage` (modificato)

Cambia da `[sidebar scene][SceneShotTimeline]` a:

```
[SceneSidebar] [main area = ScriptPanelTab + BlockingPlaceholder + ParallelPlansEditor]
```

Layout grid:

- Sidebar scene (esistente, invariata): 240px fissa
- Script panel tab/expanded: 36px chiuso, 320px aperto
- Main content area: flex

### `ScriptPanel` (nuovo)

Pannello collapsible col fountain della scena selezionata.

**Stato chiuso (36px):** colonna verticale sul bordo sinistro del main area. Icona `📄` + label verticale "SCENA ▶". Click espande.

**Stato aperto (320px):**

- Header: titolo "Scena N — testo" + bottoni `↗` (link a Screenplay editor in nuova tab) e `◀` (chiudi)
- Body: fountain renderizzato della scena, scrollabile
  - Scene heading: uppercase bold, colore `--color-fg`
  - Action: paragrafi normali, `--color-text`
  - Character names: centrati, uppercase, `--color-fg`
  - Parentheticals: italic, `--color-text-muted`
  - Dialogue: indent 30px inline-start
  - Font: Courier Prime (già `--font-mono`)
- Footer: stats scena (es. "1 personaggio · 2 battute · 0.8 pagine") + label "read-only"

**Persistenza:**

- Stato aperto/chiuso salvato in `localStorage` con chiave `shooting-plan.script-panel.open` (boolean)
- Default: `false` (chiuso) — priorità timeline

**Performance:** il fountain text è già caricato col `getShotPlan` (futuro) o tramite query separata su `screenplays.content`. Il rendering è puro client-side, no API call extra.

### `BlockingPlaceholder` (nuovo, stub per Spec 22c)

Area 90px in alto col placeholder per il futuro 2D blocking. Mostra:

```
┌──────────────────────────────────────────────┐
│ 🎬  Blocking 2D — disponibile in versione    │
│     futura (planimetria + posizioni camera)  │
└──────────────────────────────────────────────┘
```

Bordo tratteggiato, sfondo `--color-surface`. Nessuna interazione. Esiste per:

1. Riservare lo spazio nel layout — quando arriverà Spec 22c non dovrà essere ridisegnato.
2. Comunicare la roadmap all'utente.

Nascondibile via toggle in setting utente (futuro). Per ora sempre visibile.

### `PlanPicker` (nuovo)

Barra orizzontale di pillole in alto a destra del main area, una per piano + una "+ piano".

- Pillola piano = `<button>` toggle. Stato attivo (visibile): sfondo tinto col colore del piano + checkmark `✓`. Stato inattivo (nascosto): bordo grigio + `○`.
- "+ piano" = bottone tratteggiato. Click apre un mini-prompt inline (popover) "Crea Piano B come:" con tre opzioni: `[Vuoto] [Copia Piano A] [▼ Pattern…]`. Selezione = crea il piano. **Mai modal a tutto schermo.** Non viene mai auto-popolato col "consigliato" — quello vale solo per il PRIMO piano della scena (auto-populate iniziale).
- Stato visibilità per scena salvato in `localStorage` con chiave `shooting-plan.scene-{sceneId}.visible-plans` (array di scenarioId).
- Se il piano attivo è nascosto: banner discreto sopra le tracce "Piano A (attivo) è nascosto — mostra" con link che lo riaccende.

### `ParallelPlansEditor` (nuovo — sostituisce `SceneShotTimeline`)

Container che orchestra:

- Ruler fisso 0–8h in alto (markers a 0h, 1h, 2h, ..., 8h)
- N `PlanTrack` impilati verticalmente, uno per piano visibile
- Drag-and-drop state shared (un solo shot in drag alla volta)
- Quick-add toolbar in alto

Larghezza colonne:

- Label piano (left): 120px fisso
- Ruler/tracce: `flex: 1` (sfrutta tutto lo spazio rimanente)

### `PlanTrack` (nuovo)

Singola riga orizzontale di un piano. Contiene:

- Label sinistra (120px): nome piano (`Piano A`), chip stato (`ATTIVO` solido verde o `RENDI ATTIVO` outline grigia), riepilogo (`2h 55m · 5 shot · 🔗`)
- Track centrale: shot blocks + transition slots in sequenza, scala proporzionale al ruler 0–8h
- Overflow oltre 8h: porzione oltre il marker tinta in rosso, badge "+Xm oltre giornata" nel label

Il `colored-row` per il piano attivo è **sobrio**: la riga resta visualmente come le altre, solo la chip verde la distingue.

### `QuickAddToolbar` (nuovo)

Riga sopra la timeline:

```
+ shot:  [WS]  [EWS]  [MS]  [OTS]  [CU]  [ECU]  [INSERT]  |  [▼ Pattern…]                ⌘+D duplica · ⌫ elimina
```

- Ogni bottone aggiunge uno shot del tipo specificato in coda al **piano attivo**, movimento `STATIC`, minuti `null` (auto-resolved dai weights).
- Colori dei bottoni allineati alle categorie del `ShotBlock`:
  - WS / EWS → verde
  - MS / OTS → blu
  - CU / ECU → rosso
  - INSERT → arancione
- Tooltip al hover di ogni bottone:
  - `WS` → "Wide Shot — figura intera con ambiente"
  - `EWS` → "Extreme Wide Shot — soggetto piccolo, ambiente dominante"
  - `MS` → "Medium Shot — dalla vita in su"
  - `OTS` → "Over The Shoulder — da dietro le spalle di un personaggio"
  - `CU` → "Close-Up — primo piano (volto)"
  - `ECU` → "Extreme Close-Up — dettaglio (occhi, labbra)"
  - `INSERT` → "Insert — dettaglio di un oggetto o azione"
  - `▼ Pattern…` → "Aggiunge una copertura completa (es. campo/controcampo)"
- Disabilitati se non c'è piano attivo (caso teorico — l'auto-populate garantisce sempre un piano attivo).

### `PatternMenu` (nuovo)

Dropdown aperto al click su `▼ Pattern…`. Voci hard-coded:

| Pattern | Shots | Durata stimata | Quando consigliato (badge "consigliato") |
|---|---|---|---|
| Master only | 1× WS static | ~45m | Scena breve (<1 pagina) |
| Master + medi | 1× WS + 2× MS | ~1h 35m | Scena monologo (1 personaggio + dialogo) |
| Coverage standard | 1× WS + 2× MS + 2× CU | ~2h 35m | Default fallback |
| Campo / controcampo | 2× OTS + 2× CU | ~2h 35m | 2 personaggi + dialogo |
| Dialogo a 3 | 1× WS + 3× CU | ~2h 5m | 3+ personaggi + dialogo |
| Action handheld | 1× WS + 4× MS handheld | ~1h 50m | `hasSpecialEffect=true` o action_note nel breakdown |

Click su una voce = inserisce gli shot in coda al piano attivo. Niente conferma, niente modal. **Undo via ⌘Z** (richiede stack undo client-side — vedi sezione).

Tooltip su ogni voce mostra cosa aggiunge (es. "Campo/controcampo → 2× OTS + 2× CU, ~2h 35m").

Voce in fondo "+ Salva piano attuale come pattern…" → **disabilitata e tooltip "Disponibile in una versione futura"** (pattern custom rinviati a spec separata).

### `ShotContextMenu` (nuovo)

Menu contestuale al right-click su uno shot block. Voci:

```
📋 Duplica                          ⌘D
↔ Aggiungi controcampo
📐 Cambia dimensione…
🎥 Cambia movimento…
─────────────────────────
→ Sposta a Piano B
→ Sposta a Piano C
─────────────────────────
🗑 Elimina                          ⌫
```

- **Duplica**: crea copia identica subito dopo lo shot. Position auto-incrementata.
- **Aggiungi controcampo**: applicabile solo a `OTS` e shot con character specifico. Crea il mirror sullo specchio dell'altro personaggio (se scene ha 2 personaggi noti dal breakdown). Se non applicabile (es. shot WS senza personaggio, o scene con 1 solo personaggio), voce disabilitata con tooltip "Disponibile solo per scene a 2 personaggi".
- **Cambia dimensione / movimento**: dropdown nested con le opzioni dell'enum corrispondente.
- **Sposta a Piano X**: lista dinamica di tutti gli altri piani della scena. Alternativa al drag-and-drop, utile per shot lontani dal mouse.
- **Elimina**: hard delete, con conferma toast "Eliminato — annulla" per 5s.

### `ShotBlock` (modificato)

Resta il componente attuale (verificato in spec 22a), ma:

- Lo scaling cambia: width è proporzionale a `(resolvedMinutes / 480)` (8h = 480m), non più rispetto al totale di scenario. Tutti gli shot sono confrontabili sullo stesso ruler.
- Aggiunto right-click handler che apre `ShotContextMenu`.
- Cursor change su drag start, con event listener per cross-plan drop (vedi DnD section).

---

## Auto-populate (no blank scene)

### Il principio

L'utente non vede mai una timeline vuota. Quando seleziona una scena mai pianificata:

1. Server controlla se esiste già un `shot_plan` per quella scena
2. Se **non esiste**: crea automaticamente un `shot_plan` + scenario "Piano A" attivo + applica il pattern raccomandato
3. Ritorna il piano già popolato come se l'utente avesse appena aperto una scena esistente

Niente bottone "Inizia piano di ripresa", niente empty state. La timeline mostra sempre qualcosa.

### Algoritmo di raccomandazione

Funzione pura nel domain `recommendPattern(breakdown: BreakdownSummary, scene: SceneInput): PatternId`:

```typescript
const recommendPattern = (
  breakdown: BreakdownSummary | null,
  scene: SceneInput,
): PatternId => {
  // No breakdown → fallback safe
  if (!breakdown) return "master_plus_mids";

  // SFX / action → handheld coverage
  if (scene.hasSpecialEffect || breakdown.actionNoteCount > 0) {
    return "action_handheld";
  }

  const speakingChars = breakdown.castWithDialogue.length;
  const pageCount = scenePageCount(scene);

  // Breve → master only
  if (pageCount < 1) return "master_only";

  // 1 personaggio parlante → monologo
  if (speakingChars === 1) return "master_plus_mids";

  // 2 personaggi → campo/controcampo
  if (speakingChars === 2) return "shot_reverse_shot";

  // 3+ personaggi → dialogo a 3
  if (speakingChars >= 3) return "three_way_dialogue";

  // fallback
  return "coverage_standard";
};
```

Dove `BreakdownSummary` è un oggetto leggero costruito server-side dalla tabella breakdown:

```typescript
interface BreakdownSummary {
  castWithDialogue: string[]; // character names that have lines in this scene
  actionNoteCount: number;     // count of breakdown elements categorized as "action"
  // ...altri campi se servono in futuro
}
```

### Pattern definitions

Costanti pure nel domain (`packages/domain/src/schedule/coverage-patterns.ts`):

```typescript
export interface PatternShotInput {
  shotSize: ShotSize;
  cameraMovement: CameraMovement;
  notesHint: string | null; // es. "su Marco", "controcampo Giulia"
}

export interface CoveragePattern {
  id: PatternId;
  label: string;
  shots: PatternShotInput[];
  estimatedMinutesHint: number;
  description: string; // for tooltip
}

export const COVERAGE_PATTERNS: Record<PatternId, CoveragePattern> = {
  master_only: {
    id: "master_only",
    label: "Master only",
    shots: [{ shotSize: "WS", cameraMovement: "STATIC", notesHint: "master" }],
    estimatedMinutesHint: 45,
    description: "Solo master shot, scena breve",
  },
  master_plus_mids: { /* ... */ },
  coverage_standard: { /* ... */ },
  shot_reverse_shot: { /* ... */ },
  three_way_dialogue: { /* ... */ },
  action_handheld: { /* ... */ },
};
```

Quando si applica un pattern (auto-populate o click utente), il server crea N `shots` con `estimatedMinutes: null` (auto-resolved dai weights) e `notes` pre-popolato con `notesHint`.

### Marker "suggerito"

Il piano auto-creato è marcato come "suggerito" finché l'utente non modifica niente.

**Schema change minimo:** aggiungere `is_suggested boolean default false not null` a `shot_plan_scenarios`. Set `true` quando server applica auto-populate. Set `false` (clear) automaticamente al primo `addShot/updateShot/deleteShot/reorderShots/applyPattern/moveShot` su quello scenario.

UI: badge piccolo "suggerito" accanto al nome del piano. Hover: "Pattern generato automaticamente — modifica per personalizzare".

### Edge cases

- **Scene senza breakdown**: pattern fallback `master_plus_mids`. Banner discreto nel main area: "💡 Spoglia la scena per suggerimenti più precisi" con link al breakdown.
- **Scene senza testo**: non possibile arrivare qui (la scena esiste perché c'è uno screenplay con quella scena estratta).
- **Personaggi parlanti ma anonimi** (es. "VOCE FUORI CAMPO"): contano normalmente. Il regista correggerà a mano.

---

## Drag and Drop

### Stato attuale (spec 22 baseline)

Il `SceneShotTimeline` ha drag-and-drop nativo HTML5 solo per reorder dentro lo stesso scenario. Cross-scenario non esiste.

### Estensione

Drag-and-drop **cross-plan + cross-scenario**, native HTML5 (nessuna libreria).

**Eventi:**

- `onDragStart` su uno `ShotBlock`:
  - `dataTransfer.setData("application/x-shot-id", shot.id)`
  - `dataTransfer.setData("application/x-source-scenario", shot.scenarioId)`
  - Stato globale `dragState = { shotId, sourceScenarioId }` per CSS targeting (ghost)

- `onDragOver` su un `PlanTrack`:
  - `preventDefault()` per abilitare drop
  - Calcola posizione di inserimento basata su `event.clientX` rispetto agli shot esistenti → `insertAtPosition: number`
  - Aggiorna stato `dropTarget = { scenarioId, position, isSamePlan: boolean }`
  - CSS rende la tacca verticale (3px) nella posizione

- `onDragLeave` su un `PlanTrack`: clear `dropTarget` se l'evento esce dal container (non se entra in un figlio).

- `onDrop` su un `PlanTrack`:
  - Legge `shotId` e `sourceScenarioId` da `dataTransfer`
  - Se `dropTarget.scenarioId === sourceScenarioId`: chiama `reorderShots`
  - Altrimenti: chiama nuovo `moveShot({ shotId, targetScenarioId, position })`
  - Clear dragState e dropTarget

**Indicatori visivi (CSS):**

- Tacca verticale 3px alta come la traccia (28px), `box-shadow: 0 0 6px var(--shot-color)`:
  - Cross-plan: colore `--color-info` (blu)
  - Same-plan (reorder): colore `--color-success` (verde)
- Ghost dello shot in origine: `opacity: 0.3`, `border: 1px dashed var(--color-border-strong)`, contenuto sostituito da `·····`
- Altre tracce: nessun cambio visivo. Il segnale è puramente la tacca.

**Server-side `moveShot`:**

```typescript
moveShot = createServerFn({ method: "POST" })
  .validator(z.object({
    shotId: z.string().uuid(),
    targetScenarioId: z.string().uuid(),
    position: z.number().int().min(0),
  }))
  .handler(async ({ data }) => {
    // Transazione:
    // 1. Update shot: scenarioId = targetScenarioId, position = data.position
    // 2. Reorder remaining shots in source scenario (close gap)
    // 3. Reorder shots in target scenario (open gap at position)
    // 4. Rebuild auto transitions for BOTH scenarios
    // 5. Clear is_suggested on BOTH scenarios
  });
```

Atomic — wrapped in DB transaction. Errore = rollback completo.

---

## Ruler 0–8h fisso

### Constants nel domain

```typescript
export const SHOOTING_DAY_MINUTES = 480; // 8h
export const SHOOTING_DAY_MARKERS = [0, 60, 120, 180, 240, 300, 360, 420, 480] as const;
```

### Scala width

Width di ogni `ShotBlock` e `TransitionBlock`:

```typescript
const widthPct = (resolvedMinutes / SHOOTING_DAY_MINUTES) * 100;
```

Width minima visiva 1% per shot brevi (insert 10m → 2% ≈ visibile).

### Overflow

Se la somma di un piano supera 480m:

- Le porzioni dopo il marker 8h restano renderizzate nel DOM, posizionate oltre `100%` (overflow visible sul container traccia)
- Tutta la porzione oltre il marker è tinta con un overlay rosso (`background: linear-gradient(to right, transparent calc(...8h boundary...), rgba(229,83,75,0.15) calc(...8h boundary...))`)
- Label del piano (sinistra) mostra badge rosso `+1h 30m oltre giornata`

### Marker visivo

Sul ruler: tacca verticale grigia (1px) a 8h con label `8h fine GG` in font 9px `--color-text-muted`. Sempre visibile, anche se nessun piano arriva fino a 8h.

---

## Data Model

### Nuovo campo

`shot_plan_scenarios.is_suggested boolean default false not null` — migration `0021_shot_plan_suggested.sql`.

### Nessun altro schema change

- I pattern sono costanti nel domain, non vivono in DB
- La preferenza visibilità piani vive in `localStorage`
- La preferenza apertura pannello sceneggiatura vive in `localStorage`

---

## Server Functions

Tutte in `apps/web/app/features/shooting-plan/server/shooting-plan.server.ts`.

### Nuove

```typescript
// Restituisce il piano della scena. Se non esiste, lo crea e lo auto-popola.
// Idempotente: chiamate successive ritornano lo stesso piano.
getOrCreateInitialPlan({ sceneId, projectId }): Promise<ResultShape<ShotPlanView, ...>>

// Applica un coverage pattern in coda al piano (o alla posizione data).
// Crea N shots, marca is_suggested = false sullo scenario.
applyPattern({ scenarioId, patternId, atPosition? }): Promise<ResultShape<ShotPlanView, ...>>

// Sposta uno shot da un piano a un altro (atomic).
moveShot({ shotId, targetScenarioId, position }): Promise<ResultShape<ShotPlanView, ...>>

// Crea il controcampo di uno shot esistente. Disponibile solo se la scena ha 2 personaggi
// parlanti noti dal breakdown.
addReverseShot({ shotId }): Promise<ResultShape<ShotPlanView, ShotNotFoundError | InvalidReverseShotError | ...>>

// Restituisce un riepilogo del breakdown per una scena (cast con dialogo, action note count).
// Usato dal client per popolare il "consigliato" del PatternMenu in real-time.
getBreakdownSummary({ sceneId }): Promise<ResultShape<BreakdownSummary, ...>>
```

### Modificate

- `addShot`: clear `is_suggested` sullo scenario target
- `updateShot` / `deleteShot` / `reorderShots`: clear `is_suggested` sullo scenario target
- `addManualTransition` / `updateTransition` / `deleteTransition`: clear `is_suggested` sullo scenario target
- `setActiveScenario`: nessun cambio (il setActive non è una modifica al contenuto del piano)

### Invariate

- `getShotPlan`, `getEffortWeights`, `updateEffortWeights`, `createShotPlanAndScenario`, `listScenesWithPlanSummary`

Nota: `createShotPlanAndScenario` resta esposta perché serve quando l'utente crea esplicitamente un secondo piano (Piano B, Piano C). Solo l'auto-create al primo accesso passa per `getOrCreateInitialPlan`.

---

## Domain (pure functions)

Aggiunte in `packages/domain/src/schedule/`:

- `coverage-patterns.ts` — `COVERAGE_PATTERNS` constants + `PatternId` type + `CoveragePattern` type
- `recommend-pattern.ts` — funzione `recommendPattern(breakdown, scene)` con i sei rami logici
- `coverage-patterns.test.ts`, `recommend-pattern.test.ts` — Vitest unit tests

Tests coprono ogni branch dell'algoritmo + ogni pattern strutturalmente (numero shots, tipi, totale minuti hint).

---

## UI Component Map

Nuovo o modificato in `apps/web/app/features/shooting-plan/components/`:

| Componente | Stato | Responsabilità |
|---|---|---|
| `ShootingPlanPage` | Modificato | Layout 3-zone: scene sidebar, script panel collapsible, main editor |
| `ScriptPanel` | Nuovo | Collapsible tab + fountain renderer della scena |
| `BlockingPlaceholder` | Nuovo (stub) | Placeholder area per Spec 22c |
| `ParallelPlansEditor` | Nuovo | Orchestrator: ruler, toolbar, picker, tracks, DnD state |
| `PlanPicker` | Nuovo | Pillole show/hide piano + "+ piano" |
| `PlanTrack` | Nuovo | Singola riga piano: label + chip stato + track shots/transitions |
| `QuickAddToolbar` | Nuovo | Bottoni shot type + "▼ Pattern…" + tooltips |
| `PatternMenu` | Nuovo | Dropdown coverage patterns con "consigliato" |
| `ShotContextMenu` | Nuovo | Right-click menu su shot |
| `ShotBlock` | Modificato | Scaling rispetto 0–8h, right-click handler |
| `TransitionBlock` | Modificato | Scaling rispetto 0–8h |
| `ShotDetailPanel` | Invariato | Esistente, continua a funzionare |
| `SceneShotTimeline` | **Eliminato** | Sostituito da `ParallelPlansEditor` |
| `DayBalanceTimeline` | **Già eliminato in 22a** | — |
| `ScenarioTabs` | **Eliminato** | Sostituito da `PlanPicker` |

---

## State persistence (client)

LocalStorage keys, per-utente (chiavi prefissate col `userId` per evitare collisioni su PC condivisi):

- `ohw:${userId}:shooting-plan:script-panel:open` → boolean (default `false`)
- `ohw:${userId}:shooting-plan:scene:${sceneId}:visible-plans` → JSON array di scenarioId

Lettura lazy al mount del componente. Scrittura debounced (300ms) per evitare hammer su LS.

Fallback se LS non disponibile (SSR, privacy mode): valori default.

---

## Out of Scope (per questa spec)

- **2D scene blocking** → Spec 22c. Auto-popolato da breakdown + template di stanza.
- **Audio waveforms / file audio** → Spec 22d (futuro remoto).
- **Sync timeline ↔ dialogo del pannello sceneggiatura** → futura.
- **Coverage checklist** ("Master ✓, Medio Marco ✓, …") → futura, richiede design più maturo per categorizzare la copertura per genere.
- **Pattern custom salvati dall'utente** → futura, richiede tabella DB user-level + UI di gestione pattern.
- **Locking di un piano "approvato per produzione"** → futura, va coordinato col locking dello schedule.
- **Audit trail di "quale piano era attivo quando lo schedule fu generato"** → futura, parte del binding piano → schedule.
- **Inheritance / detach del blocking 2D per piano** → Spec 22c. La spec attuale non chiude la porta (può aggiungere `has_custom_blocking` a `shot_plan_scenarios` quando serve).

---

## Testing

### Vitest unit

- `coverage-patterns.test.ts`: ogni pattern ha shots ≥ 1 e shotSize/cameraMovement validi, totalEstimated > 0
- `recommend-pattern.test.ts`: tutti i rami logici (sfx, monologo, 2-char, 3-char, breve, fallback, no-breakdown)
- `shot-plan.test.ts` (esistente): regression — i test attuali devono continuare a passare

### Playwright E2E

In `tests/shooting-plan/`:

1. **Auto-populate** — Apri scena senza piano → verifica "Piano A" creato con shots > 0 e badge "suggerito"
2. **Suggerito disappears on edit** — Auto-populate → addShot → verifica badge "suggerito" rimosso
3. **Toolbar quick-add** — Click "+WS" → verifica shot WS aggiunto in coda al piano attivo
4. **Pattern menu** — Apri "▼ Pattern…" → click "Campo/controcampo" → verifica 4 shots aggiunti (2 OTS + 2 CU)
5. **Pattern recommendation** — Scena con 2 personaggi parlanti → apri menu → verifica "Campo/controcampo" ha badge "consigliato"
6. **PlanPicker** — Tre piani esistenti → click pillola "Piano B" → verifica Piano B nascosto, banner "Piano attivo nascosto" non appare (Piano A è attivo)
7. **PlanPicker active hidden** — Nascondi piano attivo → verifica banner discreto "Piano A (attivo) è nascosto"
8. **Drag cross-plan** — Drag shot da Piano A a Piano B → verifica tacca blu durante hover + posizione finale
9. **Drag reorder same-plan** — Drag shot dentro Piano A → verifica tacca verde + reorder
10. **Script panel toggle** — Click tab "📄 SCENA" → verifica espansione + contenuto fountain visibile → reload → verifica stato persistente
11. **Ruler overflow** — Crea piano > 8h → verifica zona oltre 8h tinta rossa + badge "+Xm oltre giornata"
12. **Right-click duplicate** — Right-click shot → "Duplica" → verifica copia inserita subito dopo
13. **Right-click reverse** — Scena 2-char, right-click OTS → "Aggiungi controcampo" → verifica shot specchio creato
14. **Right-click move** — Right-click shot → "Sposta a Piano C" → verifica spostamento

---

## Migration

`packages/db/drizzle/0021_shot_plan_suggested.sql`:

```sql
ALTER TABLE shot_plan_scenarios
ADD COLUMN is_suggested boolean NOT NULL DEFAULT false;
```

Compatibile con dati esistenti (default `false`). Nessun backfill necessario — i piani esistenti non sono "suggested".

---

## Risks / Open questions

1. **Breakdown summary performance**: `getBreakdownSummary` viene chiamato a ogni apertura di una scena per popolare il "consigliato" del PatternMenu. Se il breakdown ha 200+ elementi, la query potrebbe essere lenta. Mitigazione: cache lato server con TTL 60s, oppure denormalizzazione in una vista materializzata. Da decidere in implementazione.

2. **Conflitto drag-and-drop con scroll orizzontale**: il main area può avere scroll orizzontale se il viewport è stretto. Il drag near i bordi potrebbe attivare auto-scroll del browser. Da testare e gestire con `dragover` listener nel container.

3. **Right-click su trackpad mac**: il context menu nativo browser apre. Va prevenuto con `preventDefault()` solo dentro `ShotBlock` — non sull'intera pagina (rispetta UX nativa).

4. **`is_suggested` clearing race condition**: se due utenti modificano lo stesso piano in parallelo (collaborative future), il clearing potrebbe avvenire due volte. Per ora siamo single-user — non blocking.

5. **Tooltip su touch device**: i tooltip al hover non funzionano su mobile/iPad. Mitigazione: long-press triggera lo stesso tooltip. Da implementare in una versione `Tooltip` shared del design system (vedi se esiste già).
