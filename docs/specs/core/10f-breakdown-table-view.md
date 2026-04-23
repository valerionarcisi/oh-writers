# Spec 10f — Breakdown table view (Movie Magic-style editable spreadsheet)

> **Status:** open
> **Depends on:** Spec 10 (Breakdown), Spec 10c (Inline tagging), Spec 10e (Auto-spoglio regex)
> **Date:** 2026-04-23

## Goal

Il prodotto finale del breakdown deve essere consumabile **dentro Oh Writers** come una tabella editabile in stile Movie Magic, non solo un PDF da esportare. L'AD apre la tab "Per progetto", vede TUTTI gli elementi del film in una griglia, modifica nome/categoria/quantità/stato in linea, archivia o ri-categorizza in massa, e in più ha un terzo tab "Matrice" che mostra la classica scene × elemento (colonne = scene, righe = elementi, celle = quantità) — la vista che Movie Magic chiama _Element Crossplot_.

L'utente non clicca mai "Esporta" per vedere il prodotto: lo vede già nell'editor, e può operarci sopra. Il PDF resta opzionale per condividere fuori dal team.

## Problema corrente

`ProjectBreakdownTable.tsx` (139 LOC, già esistente) mostra le colonne `Nome / Categoria / Quantità / Scene` ma è **read-only**. Il context menu permette rename + archivia, niente di più. Niente bulk select, niente filtri, niente cambio di categoria, niente vista matrice. La lamentela esplicita è: _"mi aspetto anche una tabella in ohwriters editabile con il risultato dello spoglio, non solo l'export su pdf. Stile Movie Magic"._

## Non-goals (Spec 10f)

- Niente budget per element (Spec 11).
- Niente DOOD / Day-Out-of-Days schedule view (Spec 12).
- Niente drag & drop per riordinare elementi (l'ordine è derivato: alfabetico o per primo appare).
- Niente cell-level revision tracking (l'undo resta su mutate-level via TanStack Query).
- Niente import da CSV (lo abbiamo come export, l'import lo faremo se serve davvero).

## UX — tre tab

Il tabset esistente in `BreakdownPage` ha già "Per scena" / "Per progetto". Aggiungiamo un terzo: **"Matrice"**.

```
[Per scena]   [Per progetto]   [Matrice]              [Esporta ▾]
```

### Tab "Per scena" (esistente)

Resta uguale: ScriptReader al centro, BreakdownPanel a destra con gli elementi della scena selezionata.

### Tab "Per progetto" (estesa, editable)

La tabella attuale viene rifatta sopra `DataTable` (DS) con:

- **Colonne editabili in-place** (cell click → input):
  - `Nome` (text)
  - `Categoria` (select dei 15 BREAKDOWN_CATEGORIES)
  - `Cast tier` (visibile solo se `category === "cast"`)
  - `Quantità` (number, somma su tutte le scene → readonly aggregato; per-scena editabile dalla matrice)
- **Colonne info** (read-only):
  - `Scene` (lista compatta con tooltip per >5 scene)
  - `Stato` (pallini: ✓ accepted, • pending, ⚠ stale)
  - `Origine` ultima occurrence (regex/cesare/manuale)
- **Bulk select**:
  - Checkbox in prima colonna + "select all" in header.
  - Toolbar in alto compare quando ≥1 riga selezionata: `Ricategorizza ▾ | Archivia | Esporta selezione`.
- **Filtri** in header tabella:
  - Per categoria (multi-select chip).
  - Per stato (accepted / pending / stale).
  - Per scena (range "da N a M").
  - Search box per nome (debounced 200ms).
- **Sort** sulle colonne sortable (già supportato da `DataTable`).
- **Persistenza filtri**: in URL search params (`?cat=cast,locations&status=pending`), così il link è condivisibile e il tab è stateful.

### Tab "Matrice" (nuova) — Element Crossplot

```
                    │ Sc.1 │ Sc.2 │ Sc.3 │ Sc.4 │ ...
────────────────────┼──────┼──────┼──────┼──────┼──────
Cast                │      │      │      │      │
  Filippo           │  7   │  ·   │  3   │  ·   │
  Tea               │  1   │  ·   │  4   │  ·   │
  Vecchia 1         │  6   │  ·   │  ·   │  ·   │
Locations           │      │      │      │      │
  Angolo Open Grezzo│  ✓   │  ·   │  ·   │  ✓   │
...
```

- Righe = elementi raggruppati per categoria (header di gruppo non scrollabile).
- Colonne = scene (header sticky orizzontalmente, con `sceneNumber + heading.location` truncato).
- Celle = quantità se `qty > 1`, `✓` se `qty === 1`, `·` se assente.
- **Click cella**:
  - Cella vuota → "Aggiungi" con `quantity=1`.
  - Cella piena → popover inline con quantity input + "Rimuovi".
- **Heatmap toggle**: bottone "Heatmap" in toolbar che colora le celle in base alla densità — utile per spotting di scene complesse a colpo d'occhio.
- **Sticky** prima colonna (nome elemento) e prima riga (numeri scena) durante scroll.
- **Virtualizzazione** righe e colonne quando il film supera 50 scene o 100 elementi (TanStack Virtual già in dipendenze? Da verificare; in caso aggiungere come dipendenza).

## Server functions

Tutte già esistenti, niente nuovi endpoint:

- `getProjectBreakdown(projectId, versionId)` → list `ProjectBreakdownRow` (esistente).
- `updateBreakdownElement({ elementId, patch })` → patch `name`, `category`, `castTier`, `description` (esistente).
- `archiveBreakdownElement({ elementId })` (esistente).
- `addBreakdownOccurrence({ elementId, sceneId, versionId, quantity })` — verificare se esiste; se no, aggiungere come `feature/breakdown/server/occurrences.server.ts`.
- `removeBreakdownOccurrence({ occurrenceId })` — idem.
- `bulkUpdateBreakdownElements({ elementIds, patch })` — NUOVO. Nessun endpoint singolo per ricategorizzazione di massa, lo aggiungiamo per evitare N round-trip.

`bulkUpdateBreakdownElements` shape:

```ts
export const bulkUpdateBreakdownElements = createServerFn({ method: "POST" })
  .validator(
    z.object({
      elementIds: z.array(z.string().uuid()).min(1).max(200),
      patch: z.object({
        category: z.enum(BREAKDOWN_CATEGORIES).optional(),
        archivedAt: z.union([z.literal("now"), z.null()]).optional(),
      }),
    }),
  )
  .handler(/* tx → update ... where in (...) */);
```

Limite di 200 per call per evitare lockup; UI mostra progress se serve splittare.

## Componenti DS

**Esistenti** (riuso, nessun nuovo atomo):

- `[EXISTING DS]` `DataTable`, `Tag`, `ContextMenu`, `Dialog`, `Select`, `Button`, `Input`, `Checkbox`, `Toolbar`.

**Nuovi** in `packages/ui/src/components/`:

- `[NEW DS]` `EditableCell` — wrapper che mostra il valore in lettura, switch a `Input` o `Select` su click/`Enter`, conferma su `blur`/`Enter`, annulla su `Esc`. Generic su `T extends string | number`. Riusabile per altre tabelle future (budget, schedule).
- `[NEW DS]` `MatrixGrid` — vista a matrice con sticky header riga/colonna, virtualizzazione opzionale, slot per render-cell custom. Ne avrà bisogno anche lo schedule (Spec 12) per la striscia delle scene per giorno.

Decisione DS-first: prima il componente DS isolato con storybook + test, poi la composizione nel feature folder.

## Data shape per la matrice

Il payload da `getProjectBreakdown` già contiene `scenesPresent: { sceneId, sceneNumber, quantity }[]` per ogni element row. La matrice è una proiezione client-side:

```ts
const matrix = useMemo(() => {
  const sceneCols = scenes.map((s) => ({
    id: s.id,
    number: s.number,
    label: s.location,
  }));
  const rowsByCategory = groupBy(rows, (r) => r.element.category);
  return { sceneCols, rowsByCategory };
}, [rows, scenes]);
```

Niente nuove query, niente N+1.

## Tests

### Unit (Vitest)

- `EditableCell.test.tsx` — switch text → input, Enter saves, Esc cancels, click outside saves, disabled mode.
- `MatrixGrid.test.tsx` — sticky behaviour mock-via-CSS, virtualization toggles correctly past the threshold.
- `ProjectBreakdownTable.bulk.test.tsx` — select all → toolbar appears, click "Archivia" calls bulk endpoint with all IDs.
- `bulk-update.server.test.ts` — bulk patch updates all rows in one tx, returns count, fails atomically on partial error.

### E2E (Playwright)

`tests/breakdown/table-view.spec.ts`:

- `[OHW-340]` Apri tab "Per progetto", clicca su nome elemento → input visibile → digita "Filippo Renato" → blur → riga aggiornata, refresh → cambio persistito.
- `[OHW-341]` Cambia categoria di "Macchina" da `vehicles` a `props` via cell-edit → la riga si sposta nel raggruppamento corretto, il tag colore cambia.
- `[OHW-342]` Seleziona 3 righe → bulk archive → tutte spariscono → undo via toast (se implementato) le ripristina.
- `[OHW-343]` Filtro `?cat=cast` in URL → solo cast visibile al load; toggle filtro chip aggiunge `locations`.
- `[OHW-344]` Apri tab "Matrice" → vedi righe per Filippo / Tea / Vecchia 1 con celle popolate sulle scene corrette.
- `[OHW-345]` Click su cella matrice vuota → popover quantity → Submit → cella mostra "1", refresh persistita.
- `[OHW-346]` Heatmap toggle ON → celle popolate hanno background-color crescente con quantità.

## Migration & rollout

- Niente schema delta.
- `bulkUpdateBreakdownElements` è additivo, non breaking.
- I filtri persistiti in URL sono opt-in: senza query param il tab si comporta come oggi.
- Rollout: dietro flag `breakdown.tableV2` (boolean in user settings) per i primi 2 design partner; rimuovere il flag quando OHW-340..346 sono tutti verdi su CI per 1 settimana.

## Out of scope

- Editing della scena dalla tabella (la scena si edita solo dallo screenplay editor — la tabella mostra/edita gli elementi, non le scene).
- Drag & drop di elementi tra scene (un click su cella matrice è il pattern v1).
- Saved views / preset filtri (post-MVP).
- Comparazione fra versioni in matrice (covered da Spec 10 stale-awareness; in matrice mostriamo solo la versione corrente).
- Esportazione XLSX nativa (CSV già esiste; XLSX dipende da una libreria che vogliamo evitare per ora).

## Prerequisites

- `[NEW DS]` `EditableCell`, `MatrixGrid`.
- `[EXISTING DS]` `DataTable`, `Tag`, `ContextMenu`, `Dialog`, `Select`, `Toolbar`.
- Verificare presenza di `@tanstack/react-virtual` nelle dipendenze; se assente, aggiungere come dipendenza pinned (chiedere conferma prima).

## Open questions

1. La matrice deve mostrare **anche le scene archiviate** o solo le scene attive? (Default proposto: solo attive, con toggle "Mostra archiviate" in toolbar.)
2. Il bulk "Archivia" è soft-delete (già pattern esistente) o hard-delete via separate confirm? (Default proposto: soft, undo via toast 5s.)
3. La categoria "ricategorizza" su un cast element fa fall-back tier `null`? (Default proposto: sì, con avviso "I tier verranno persi" se ≥1 selected è cast.)
