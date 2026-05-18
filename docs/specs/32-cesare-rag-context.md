# Spec 32 — Cesare: RAG Context (full scene body)

## Overview

Cesare oggi riceve nel system prompt solo metadati delle scene (heading,
personaggi, numero). Il testo completo della scena — azioni, dialoghi,
didascalie — è in `scenes.notes` (estratto dal Fountain ad ogni salvataggio)
ma non viene passato a Cesare.

Questo spec aggiunge il **corpo della scena** al contesto di Cesare su tutte
le pagine, in modo che possa rispondere in modo concreto su dialogo, azioni,
ritmo, e oggetti di scena senza chiedere "cosa succede in questa scena?".

---

## Architettura: RAG senza vector store (Fase 1)

Il corpus di scene per progetto è piccolo (20–120 scene tipiche). Non serve
un vector store: carichiamo le scene rilevanti direttamente dal DB e le
inseriamo nel system prompt.

**Strategia di selezione scene:**

| Contesto Cesare | Scene incluse nel prompt |
|-----------------|--------------------------|
| `breakdown` | Scena attiva (testo completo) + 2 prima e 2 dopo |
| `screenplay` | Scena attiva (testo completo) + 2 prima e 2 dopo |
| `locations` | Scene collegate al requirement corrente (testo completo) |
| `schedule` | Ultime 5 scene visualizzate (solo heading + personaggi) |
| `budget` | Top 5 scene per costo stimato (solo heading) |
| `soggetto`, `synopsis`, `outline`, `treatment` | Nessuna scena specifica — usa il riepilogo già presente |

**Token budget:** max 2000 token per il blocco scene (~8 scene complete medie).
Se il contesto supera il limite, troncare le scene più lontane dalla scena attiva.

---

## Dati disponibili

`scenes.notes` contiene il body Fountain della scena: azioni, dialoghi,
parentetiche. Estratto da `syncScenesFromFountain` ad ogni `saveScreenplay`.

```typescript
// Già nel DB — nessuna migrazione necessaria
scenes.notes = `Marco entra nel bar. È vuoto.

MARCO
(guardandosi attorno)
C'è nessuno?

Il barista emerge dal retro, lento.`;
```

---

## Fase 2 — pgvector (future spec 32b)

Quando il corpus cresce (sceneggiature lunghe, multi-episodio):

1. Aggiungere `scenes.embedding vector(1536)` via migrazione
2. Al salvataggio, calcolare `text-embedding-3-small` (OpenAI, $0.02/1M token)
   o `voyage-3-lite` (Anthropic partner)
3. `assembleContext` usa cosine similarity invece di window fissa
4. Nessun Redis, nessun servizio aggiuntivo — pgvector è un'extension

---

## Implementazione Fase 1

### `cesare.server.ts` — `loadSceneBody`

Nuova funzione che carica heading + notes per una finestra di scene attorno
alla scena corrente:

```typescript
const loadSceneWindow = (
  db: Db,
  screenplayId: string,
  centerSceneNumber: number | null,
  windowSize: number = 2,
): ResultAsync<SceneBodyRow[], CesareError>
```

### `CesareContext` — `sceneWindow`

```typescript
interface CesareContext {
  // ... existing fields
  sceneWindow: SceneBodyRow[];
}
```

### System prompt — nuovo blocco `SCENA CORRENTE`

```
SCENA CORRENTE (breakdown corpo):
Scena 7: INT. RISTORANTE — SERA
---
Marco entra nel locale. È quasi chiuso.

MARCO
Ho bisogno di un tavolo.

Il cameriere scuote la testa.
---
Scena precedente (6): EXT. STRADA — SERA — [sintesi breve]
Scena successiva (8): INT. RISTORANTE — SERA — [sintesi breve]
```

---

## Tests

**File:** `apps/web/app/features/predictions/cesare.server.test.ts`

- `[OHW-511]` `loadSceneWindow` con scena centrale — restituisce finestra corretta
- `[OHW-512]` `loadSceneWindow` con scena null — restituisce array vuoto
- `[OHW-513]` system prompt include corpo scena quando scena attiva

**File:** `tests/breakdown/cesare-scene-context.spec.ts`

- `[OHW-514]` Apri Cesare su breakdown con scena selezionata — risposta
  Cesare cita elementi della scena (dialogo, azione)
