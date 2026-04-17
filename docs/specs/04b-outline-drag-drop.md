# Spec 04b — Outline / Scaletta (Drag-and-Drop + Hierarchy Completion)

## Goal

Completare la Scaletta come strumento di pianificazione strutturale. Oggi esistono il data model gerarchico (Acts → Sequences → Scenes) e un editor base; mancano drag-and-drop, editing inline completo dei campi scena (heading + pageEstimate), gestione degli atti (collapse, rename, reorder, add/delete) e un character picker vero.

Questa spec è una **estensione** di 04 (già approvata e in parte implementata), non una riscrittura.

## Status at spec time

Implementato:

- `OutlineContentSchema` con gerarchia Acts → Sequences → Scenes (`packages/domain/src/outline.ts`)
- `OutlineEditor` component con rendering statico
- Inline edit di `description`, `notes`
- Auto-save debounced integrato con `useDocument`

Gap da chiudere:

1. **Drag-and-drop mancante** — scene non riordinabili
2. **`scene.heading` e `scene.pageEstimate`** — presenti nello schema storico, oggi non editabili (rimossi in una refactor precedente); vanno ri-esposti in UI
3. **Atti**: non collapsible, non rinominabili via UI, non riordinabili, no add/delete
4. **Character tags**: array plain text, nessun picker con autocomplete
5. **Empty state generico**

## Out of scope

- **Sync outline ↔ screenplay** (scene headings propagate) — Spec 04d futura
- **Navigazione outline → screenplay editor** (click card → jump to scene) — Spec 04d
- **Versioning dell'outline** — copertura da Spec 06b (universale, non serve nulla qui)
- **Export outline in PDF** — fuori scope (futuro, eventualmente dentro 04c pitch package)

## Decisioni tecniche

### Library drag-and-drop: HTML5 native

**Scelta: HTML5 Drag and Drop API nativa**, non `@dnd-kit`.

Ragioni:

- Zero dipendenze aggiunte (attualmente nessuna libreria dnd nel repo)
- Il riordinamento qui è monodimensionale dentro liste piccole (tipicamente < 40 scene/atto). HTML5 dnd copre perfettamente questo caso
- Accessibility: l'API nativa espone `draggable` ARIA out of the box; aggiungiamo fallback keyboard (`Alt+↑/↓` per spostare scene) come complemento
- `@dnd-kit` resta un candidato se in futuro servirà drag multi-axis, sensors touch avanzati, o preview custom. A quel punto si valuta il bump di dipendenze

Incapsulamento: tutta la logica drag vive in `apps/web/app/features/outline/lib/drag.ts` (event handlers puri che ritornano nuovi array), i componenti UI chiamano quei helper. Così un eventuale switch a `@dnd-kit` tocca un file.

### Schema: ripristino campi scena

Aggiorno `OutlineSceneSchema` in `packages/domain/src/outline.ts`:

```ts
export const OutlineSceneSchema = z.object({
  id: z.string().uuid(),
  heading: z.string().max(200).default(""), // RESTORED
  description: z.string().max(2000).default(""),
  characters: z.array(z.string().max(100)).default([]),
  pageEstimate: z.number().min(0).max(20).nullable().default(null), // RESTORED
  notes: z.string().max(1000).nullable().default(null),
});
```

Migrazione dati: le scene esistenti in DB vengono lette e i campi mancanti defaultati (`heading: ""`, `pageEstimate: null`) — nessuna migration SQL necessaria perché `documents.content` è JSONB e Zod `.default()` fa il lavoro.

### Gerarchia Acts → Sequences → Scenes

Manteniamo la gerarchia a 3 livelli (già nello schema). Drag and drop in v1:

- **Scene** riordinabili **dentro la stessa sequenza**
- **Scene** trascinabili **tra sequenze** (anche in atti diversi)
- **Sequenze** riordinabili **dentro lo stesso atto** e trascinabili tra atti
- **Atti** riordinabili tra loro

Niente drag di "Act into Act" — gli atti sono al livello top.

### Atti: UI management

| Azione          | Come                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapse/expand | Click sull'header dell'atto (chevron)                                                                                                       |
| Rename          | Double-click sul titolo → input inline                                                                                                      |
| Add act         | Bottone `+ Add act` in fondo alla lista                                                                                                     |
| Delete act      | Menu `...` sull'header: **"Delete (moves scenes up)"** — mai cancella le scene, le fonde con l'atto precedente (o successivo se è il primo) |
| Reorder act     | Drag sull'header                                                                                                                            |

Quando un atto è collapsed, header mostra: `Act II — 3 sequences · 12 scenes · ~18pg`.

### Character picker

Nuovo componente `<CharacterPicker selected={string[]} onChange={(next) => void}>`:

- Input con autocomplete; suggerimenti tratti da:
  - Characters già presenti in altre scene dell'outline (fonte primaria)
  - Characters estratti dallo screenplay se esistente (via nuovo helper `extractCharactersFromScreenplay(doc)`, puro, in `packages/domain`)
- Enter aggiunge; `×` sul tag rimuove; Backspace su input vuoto rimuove l'ultimo

Personaggi sono stringhe free-form in v1 (non entità DB). Questo allinea col data model esistente.

### Auto-save

Riuso pattern già implementato di `useDocument` + `DEFAULT_AUTO_SAVE_DELAY_MS`. Ogni mutazione alla content struct produce una nuova istanza (immutability) e schedula il save.

Drag drop = **un singolo save** a fine drop (non durante il drag), per evitare flooding.

## User stories → OHW IDs

Prossimo ID libero: **OHW-215**.

| ID      | User story                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------- |
| OHW-215 | Owner drag-and-drop scene dentro stessa sequenza → ordine persiste dopo reload                            |
| OHW-216 | Owner drag scena tra atti diversi → scena appare sotto la sequenza target, numerazione globale aggiornata |
| OHW-217 | Owner edit inline di `scene.heading` → Enter salva → reload, testo persiste                               |
| OHW-218 | Owner edit `pageEstimate` con numero → salva, header atto collapsed riflette totale aggiornato            |
| OHW-219 | Owner clicca chevron atto → sequenze collassano, re-click espande                                         |
| OHW-220 | Owner double-click titolo atto → input inline, typing + Enter rinomina                                    |
| OHW-221 | Owner `...` menu atto → Delete → scene spostate nell'atto precedente, conferma inline                     |
| OHW-222 | Owner drag atto in altra posizione → ordine atti persiste                                                 |
| OHW-223 | Owner character picker: digita prime lettere → autocomplete mostra personaggi esistenti → Enter aggiunge  |
| OHW-224 | Viewer: drag handles nascosti, doppio-click atto non attiva rename, tutti i campi read-only               |

## Implementation order (TDD)

**Blocco 1 — schema update:**

1. Estendere `OutlineSceneSchema` con `heading` + `pageEstimate`
2. Vitest: parse di documenti vecchi (senza i campi) → default applicati

**Blocco 2 — drag helpers puri:**

3. `moveSceneWithinSequence`, `moveSceneBetweenSequences`, `moveSequenceBetweenActs`, `moveAct` — tutti in `lib/drag.ts`
4. Vitest exhaustive per ciascuno

**Blocco 3 — UI drag:**

5. `draggable`/`onDragStart`/`onDragOver`/`onDrop` attaccati a `SceneCard`, `SequenceGroup`, `ActHeader`
6. CSS: drop zone highlight, drag preview

**Blocco 4 — scene field edit UI:**

7. Input inline per `heading` (con validazione soft: uppercase auto, no regex rigida qui — è pianificazione, non fountain)
8. Input number per `pageEstimate`

**Blocco 5 — act management:**

9. Chevron + collapsed state in client state
10. Rename modal-free (inline)
11. Menu `...` con Delete / Add-below / duplicate

**Blocco 6 — character picker:**

12. `<CharacterPicker>` con `extractCharactersFromScreenplay` helper
13. Integrazione in `SceneCard`

**Blocco 7 — viewer mode:**

14. Guard tutti i trigger interattivi su `canEdit`

**Blocco 8 — E2E:**

15. `tests/outline/outline-editor.spec.ts` OHW-215..224 (Playwright)

**Blocco 9 — regression & commit**

## Testing

- **Vitest** (dominio): helper drag puri, estrattore personaggi dallo screenplay, zod default backfill
- **Playwright E2E**: OHW-215..224. Per i drag test usare `page.locator().dragTo()` — API nativa Playwright

## Files touched / created

```
packages/domain/
├── src/outline.ts                             ← +heading +pageEstimate su scene schema
└── src/outline-characters.ts                  ← NEW, extractCharactersFromScreenplay

apps/web/app/features/outline/
├── lib/drag.ts                                ← NEW, helper puri move*
├── components/OutlineEditor.tsx               ← +drag wiring +collapsed state atti
├── components/ActHeader.tsx                   ← NEW (estratto), chevron + rename + menu
├── components/SequenceGroup.tsx               ← +drop zones
├── components/SceneCard.tsx                   ← +drag handle +heading input +pageEstimate input
├── components/CharacterPicker.tsx + .module.css ← NEW
└── styles/OutlineEditor.module.css            ← +drop highlight, +chevron, +handle

tests/outline/
└── outline-editor.spec.ts                     ← NEW, OHW-215..224
```

## Open questions

- "Move to act..." nel menu scena: utile shortcut per riordinamenti grandi senza drag. Valutato in Blocco 5, tagliabile se scope stretto.
- Keyboard a11y per drag: `Alt+↑/↓` scena, `Shift+Alt+↑/↓` sequenza, `Ctrl+Alt+↑/↓` atto. Blocco opzionale — se tempo stringe va in sub-spec 04b2.
