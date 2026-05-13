# Spec 22a — Disaccoppiare Piano di Ripresa dallo Schedule

> **Status:** draft
> **Date:** 2026-05-13
> **Amends:** Spec 22 (2026-05-12-shot-plan-design.md)

---

## Problem

Spec 22 ha disegnato Piano di Ripresa come consumatore dello schedule: il day picker richiede uno schedule esistente, e ogni mutation di shot scrive su `strips.estimatedHours` tramite `syncStripEffort`. La dipendenza è semanticamente invertita — il piano di ripresa è un input che dovrebbe informare lo schedule, non un output che lo decora. E praticamente è circolare: `strips` esistono solo dopo che lo schedule è generato, quindi non si può iniziare a pianificare gli shot prima.

---

## Decision

Disaccoppiare completamente Piano di Ripresa dallo Schedule. Per ora non esiste flusso di dati tra le due sezioni. Il binding piano → schedule verrà ridisegnato in una spec successiva.

---

## Scope of Changes

### Rimosso

1. **`syncStripEffort` server-side** (`shooting-plan.server.ts`) — eliminata la funzione e tutte le chiamate da `addShot`, `updateShot`, `deleteShot`, `reorderShots`, `addManualTransition`, `updateTransition`, `deleteTransition`, `setActiveScenario`.
2. **`DayBalanceTimeline` component** (Compare C — bilanciamento giorno) e relativo CSS module.
3. **Day picker sidebar** all'interno di `ShootingPlanPage` (i bottoni GG 1 / GG 2 / ... e il footer "Pesi default").
4. **Tutto il codice che legge `scheduleQueryOptions`** dalla `ShootingPlanPage` — la pagina non dipende più dallo schedule.
5. **Empty state "genera prima uno schedule"** — non serve più.

### Modificato

1. **`ShootingPlanPage`** diventa: sidebar con elenco scene del progetto + main area con `SceneShotTimeline` per la scena selezionata. Niente concetto di giorno.
2. **Route** `_app.projects.$id_.shooting-plan.tsx` resta uguale (l'URL non cambia, ma il contenuto della pagina sì).
3. **Sidebar app principale** (`features/app-shell/components/Sidebar.tsx`): nessun cambio di posizione — Piano di Ripresa resta tra Breakdown e Schedule (è già lì, è il punto giusto nel workflow).

### Non toccato

1. Schema DB — `shot_plans`, `shot_plan_scenarios`, `shots`, `transition_slots`, `schedules.effort_weights` restano.
2. Domain pure functions — `resolveShotMinutes`, `inferTransitions`, `computeScenarioTotal` restano.
3. Schedule server e domain — `generateStrips`, `resolveEffortHours` continuano a usare solo `pageCount` + `strips.estimatedHours` come oggi.
4. `SceneShotTimeline`, `ShotBlock`, `TransitionBlock`, `ScenarioTabs`, `ShotDetailPanel` — il cuore funzionale del piano di ripresa resta intatto.

---

## New Page Layout

```
ShootingPlanPage
├── Sidebar (scene list)
│   ├── "Scene del progetto" header
│   ├── Scene 1 · INT. CASA – GIORNO    [● 4 shot · 2h 05m]
│   ├── Scene 2 · INT. RISTORANTE – SERA [● 5 shot · 2h 55m]
│   ├── Scene 3 · EXT. ANGOLO – NOTTE   [○ non pianificata]
│   └── ...
└── Main area
    └── SceneShotTimeline (active scenario tabs + shot/transition blocks)
        └── ShotDetailPanel (inline editor when shot selected)
```

Stato vuoto: "Seleziona una scena dalla lista per iniziare a pianificare gli shot."

La sidebar mostra per ogni scena: numero, heading abbreviato, badge con conteggio shot e totale ore dello scenario attivo (o "non pianificata" se nessuno shot esiste).

---

## Server Function Changes

`shooting-plan.server.ts`:

- **Rimuovi**: `syncStripEffort` (helper interno) e tutte le sue invocazioni.
- **Lascia invariato**: tutte le altre funzioni CRUD (`getShotPlan`, `createShotPlanAndScenario`, `setActiveScenario`, `addShot`, `updateShot`, `deleteShot`, `reorderShots`, `addManualTransition`, `updateTransition`, `deleteTransition`, `getEffortWeights`, `updateEffortWeights`).
- **Nuovo (opzionale)**: `listScenesWithPlanSummary({ projectId })` — ritorna `Array<{ sceneId, sceneNumber, sceneHeading, shotCount, totalMinutes | null }>` per popolare la sidebar in una sola query.

---

## Migration / Data

Nessuna migration DB. Le tabelle restano. I dati esistenti restano validi. Eventuali valori `strips.estimatedHours` scritti da `syncStripEffort` in passato non vengono toccati (sono già lì come override manuali, restano tali).

---

## Testing

- **Vitest unit tests** del domain (`shot-plan.test.ts`) — invariati, già non dipendono dallo schedule.
- **Playwright E2E** (`tests/shooting-plan/shooting-plan.spec.ts`) — da rivedere:
  - Rimuovi i test che verificano `strips.estimatedHours` dopo mutation di shot.
  - Rimuovi test che entrano dal day picker.
  - Aggiungi test: "Apri Piano di Ripresa senza schedule generato, seleziona una scena, aggiungi shot, verifica persistenza."
  - Aggiungi test: "Sidebar mostra conteggio shot per scena pianificata e 'non pianificata' altrimenti."

---

## Future Work (out of scope)

In una spec successiva (es. "Spec 22b — Piano di Ripresa come input dello schedule") affronteremo:

- Come la generazione schedule legge le ore computate dagli shot plan attivi.
- Se `strips.estimatedHours` diventa override manuale puro o se viene rimosso.
- Se serve un trigger di "ricalcolo schedule" quando un piano cambia, o se è solo a generazione manuale.
- Reintroduzione di una vista "bilanciamento giorno" quando il binding sarà definito.
