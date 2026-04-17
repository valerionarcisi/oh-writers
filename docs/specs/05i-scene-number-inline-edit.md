# Spec 05i — Inline Scene Number Edit + Resequence

## Goal

Nell'editor di sceneggiatura, il numero di scena è oggi **derivato** (auto-assegnato al parse + aggiornato a runtime). Gli sceneggiatori professionisti hanno bisogno di:

1. **Editare manualmente** il numero di una singola scena per bloccarla su un valore specifico (convenzione industria: una volta bloccato uno shooting script, le scene aggiunte prendono suffissi lettere `5A`, `5B`, invece di rinumerare tutto).
2. **Ricalcolare (resequence)** l'intera sceneggiatura su richiesta — bottone esplicito, non automatico, mai silenzioso.

Questa spec è **sub-spec di 05g** (scene numbering con lettere, già implementato) e lo completa aggiungendo l'editing diretto e il comando di resequence.

## Status at spec time

Presente in codice:

- `packages/domain/src/scene-numbers.ts` — algoritmo numerazione con lettere (`parseSceneNumber`, `nextLetterSuffix`, `compareSceneNumbers`, `sceneNumberForInsertion`)
- Attributo `scene_number` sul nodo `heading` ProseMirror
- Assegnazione iniziale da `fountain-to-doc.ts` (sequenziale 1,2,3…)
- `doc-to-fountain.ts` serializza il numero nel fountain

Gap da chiudere:

1. **Nessuna UI per editare il numero** direttamente sull'heading
2. **Nessun comando "resequence"** — l'unico modo oggi di rinumerare è ri-importare il fountain
3. **Nessun concetto di "locked" vs "auto"** — tutti i numeri sono ugualmente editabili/ricalcolabili; non c'è un flag che dica "questa scena ha un numero fissato dall'utente, non toccarlo"

## Out of scope

- **Lock / unlock massivo** (bloccare tutta la sceneggiatura tipo "lock for production") — eventuale Spec 06c
- **Revision marks** (asterischi a margine delle scene modificate post-lock) — Spec 14 extension o dedicata
- **Scene number display styling** (prefix `A-` per episodio, postfix `*` per revision) — out of v1

## Decisioni tecniche

### Lock flag

Aggiungo un attributo `scene_number_locked: boolean` al nodo `heading`:

```ts
// ProseMirror schema (features/screenplay-editor/lib/schema.ts)
heading: {
  attrs: {
    scene_number: { default: "" },
    scene_number_locked: { default: false },  // NEW
  },
  // …
}
```

Semantica:

- `locked=false` (default): il numero è auto-gestito. Resequence lo sovrascrive.
- `locked=true`: l'utente ha deciso. Resequence **rispetta** questo numero come fixed point; rinumera solo gli adiacenti.

Un edit manuale imposta `locked=true` automaticamente. Unlock esplicito via pulsante nel popover scene ("Unlock number").

### Inline edit UX

**Trigger:** click sul numero di scena nell'heading rendering (`.pm-heading .scene-number`).

**Interazione:**

1. Click → il numero diventa un `<input>` inline (autofocus, selected-all)
2. Utente digita (`5`, `5A`, `12B`, ecc.). Validazione regex `^\d+[A-Z]?$` (case-auto-upper).
3. **Enter**:
   - Se **numero libero** (nessun'altra scena lo usa) e **non crea conflitto di ordine** → applica direttamente, flag `locked=true`.
   - Se **già usato** o **crea conflitto** (es. scena 5 diventa 3 ma la scena 4 precedente è 4) → apri modale:

```
┌────────────────────────────────────────────────────┐
│ Scene number conflict                              │
│                                                    │
│ You're changing scene 5 to "3". This conflicts     │
│ with another scene.                                │
│                                                    │
│ Choose:                                            │
│                                                    │
│   ○ Keep numbering locked — other scenes keep      │
│     their numbers, this one becomes 3-locked even  │
│     if out of order                                │
│                                                    │
│   ○ Resequence from this scene forward — everyone  │
│     after gets renumbered starting from 3          │
│                                                    │
│   ○ Cancel                                         │
│                                                    │
│                           [Cancel]   [Apply]       │
└────────────────────────────────────────────────────┘
```

4. **Escape** → annulla edit, ripristina numero originale
5. **Blur senza Enter** → stesso comportamento di Enter (validazione implicita)

**Regex di validazione:** `/^(\d+)([A-Z]?)$/` — numero obbligatorio, lettera opzionale maiuscola.

### Popover menu della scena

Le scene già hanno (o avranno — Spec 05h menzione) un popover di comandi sull'heading. Aggiungo:

- **Edit number** — apre l'input inline (equivalente al click diretto)
- **Unlock number** — solo se `locked=true`; imposta `locked=false`
- **Resequence from here** — rinumera questa scena e tutte quelle successive in base all'ordine corrente, rispettando i `locked` trovati

### Comando "Resequence all"

Bottone globale in toolbar screenplay editor: **`Resequence scenes`**. Apre modale di conferma:

```
┌───────────────────────────────────────────────┐
│ Resequence all scenes?                        │
│                                               │
│ This renumbers every scene from 1 upward      │
│ based on current document order.              │
│                                               │
│ Locked scenes keep their numbers — others     │
│ get assigned around them with letter          │
│ suffixes if needed.                           │
│                                               │
│ This cannot be undone automatically.          │
│                                               │
│                  [Cancel]   [Resequence]      │
└───────────────────────────────────────────────┘
```

Applica l'algoritmo di `sceneNumberForInsertion` (già esistente) a cascata su tutto il doc.

### Algoritmo resequence

```ts
// packages/domain/src/scene-numbers.ts (estensione)
export function resequenceAll(
  scenes: { number: string; locked: boolean }[],
): string[] {
  // 1. Identifica i fixed points (locked=true)
  // 2. Per ogni gap tra due fixed points, assegna numeri sequenziali ascending
  //    che rispettino entrambi i bound (es. tra 5-locked e 10-locked, le 3 scene
  //    in mezzo diventano 6, 7, 8, oppure 5A, 5B, 5C se c'è vincolo)
  // 3. Se un locked crea un ordine impossibile (locked=3 preceduto da locked=5
  //    non-movible) → throw ResequenceConflictError → UI mostra errore
}
```

Caso limite: utente blocca scena come "3" mentre la precedente è "5-locked". Non si può risolvere → errore esplicito, utente sblocca uno dei due.

## User stories → OHW IDs

Prossimo ID libero: **OHW-236** (dopo title page).

| ID      | User story                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| OHW-236 | Owner clicca sul numero di una scena → input inline focusato col valore corrente selezionato                  |
| OHW-237 | Owner digita "7A", preme Enter → il numero della scena diventa "7A" e `locked=true` (visibile via badge lock) |
| OHW-238 | Owner digita un numero già usato da un'altra scena → modale conflitto appare                                  |
| OHW-239 | Modale conflitto, scelta "Resequence from here" → scene successive rinumerate, doc salvato                    |
| OHW-240 | Modale conflitto, scelta "Keep locked" → la scena prende il nuovo numero + locked=true, altre invariate       |
| OHW-241 | Modale conflitto, scelta "Cancel" → numero invariato                                                          |
| OHW-242 | Popover scene, voce "Unlock number" appare solo se la scena è locked                                          |
| OHW-243 | Popover scene, click "Resequence from here" → rinumera da questa in giù, rispetta i locked, salva             |
| OHW-244 | Toolbar screenplay, click "Resequence scenes" → modale conferma → Resequence → tutta la doc rinumerata        |
| OHW-245 | Input edit: digito lettere non valide (es. "7AB") + Enter → input mostra errore inline, non chiude            |
| OHW-246 | Input edit: Escape → numero originale ripristinato, nessuna modifica al doc                                   |
| OHW-247 | Resequence con conflitto impossibile (locked=3 dopo locked=5) → toast errore, nessuna modifica                |

## Implementation order (TDD)

**Blocco 1 — schema & dominio puro:**

1. Aggiungere `scene_number_locked` al PM schema (migration logica via `migratePmDoc`)
2. Scrivere `resequenceAll(scenes) → string[]` in `packages/domain/src/scene-numbers.ts` con Vitest exhaustive

**Blocco 2 — inline edit UI:**

3. Rendering del numero scena come componente editabile (React island sopra il PM view)
4. Keyboard handling: Enter/Escape/blur
5. Regex validation + error state visuale

**Blocco 3 — conflict modale:**

6. `ConflictModal` component, 3 scelte
7. Wiring con il commit PM transaction

**Blocco 4 — popover menu entries:**

8. Aggiungere `Edit number`, `Unlock number`, `Resequence from here`
9. Handler per ciascuno

**Blocco 5 — toolbar resequence-all:**

10. Bottone + conferma modale
11. `ResequenceConflictError` handling con toast

**Blocco 6 — E2E:**

12. Scrivere `tests/screenplay/scene-number-edit.spec.ts` OHW-236..247

**Blocco 7 — regression & commit**

## Testing

- **Vitest** (dominio): `resequenceAll` con scene tutte auto, tutte locked, miste; conflitti impossibili; lettere intermedie. Copertura ampia — logica critica.
- **Playwright E2E**: OHW-236..247. Per il conflict modale → seed crea 2 scene con numeri specifici, test triggera conflitto via input.

## Files touched / created

```
packages/domain/
└── src/scene-numbers.ts                        ← +resequenceAll, +ResequenceConflictError

apps/web/app/features/screenplay-editor/
├── lib/schema.ts                                ← +scene_number_locked attr
├── lib/migrations.ts                            ← +migration idempotente per il nuovo attr
├── lib/scene-number-renderer.ts                 ← NEW, React island per rendering/edit
├── components/SceneNumberConflictModal.tsx      ← NEW
├── components/SceneNumberConflictModal.module.css ← NEW
├── components/ScenePopoverMenu.tsx              ← +voci Edit/Unlock/Resequence-from-here
├── components/ScreenplayToolbar.tsx             ← +bottone Resequence scenes
└── lib/plugins/scene-number-commands.ts         ← NEW, commands for setSceneNumber/resequenceFrom/resequenceAll

tests/screenplay/
└── scene-number-edit.spec.ts                    ← NEW, OHW-236..247
```

## Open questions

- La voce "Resequence from here" nel popover ha la stessa semantica del comando globale ma limitata allo scope dalla scena corrente in giù. Se l'utente se l'aspettasse "solo questa scena" (non transitive), UX fraintendibile — da valutare con wording preciso nella UI finale.
- Undo: ProseMirror ha history plugin già wired. La transaction di resequence deve essere un singolo step → Ctrl+Z annulla tutto l'intervento in un colpo. Verificato in Blocco 5.
