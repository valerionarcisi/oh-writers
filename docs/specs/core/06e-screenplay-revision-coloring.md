# Spec 06e — Screenplay Revision Coloring

**Status:** extends Spec 06b (Universal Versioning) and Spec 07b (Title Page).
**Supersedes:** the per-title-page `draftColor` / `draftDate` introduced in Spec 14 / 07b.

## Goal

Allineare Oh Writers alla convenzione Hollywood delle "colored pages": ogni
**revisione** dello screenplay (= una `screenplay_versions` row) porta con sé
**due metadati di produzione**:

- `draftColor` — uno dei 10 valori standard
- `draftDate` — data della revisione (date-only, no timezone)

Title page, drawer versioni, export PDF e import (FDX/PDF) leggono e
scrivono questi metadati dalla **versione corrente**, non più dal title page.

> Ambito di questa spec: **solo screenplay**. Logline / Synopsis / Outline /
> Treatment non hanno colored pages e restano fuori da questo lavoro. Se in
> futuro vorremo colorare anche quelle versioni, sarà una spec separata che
> riusa la stessa palette.

## The 10 standard colors

Ordine di rotazione fisso (industry standard, immutabile):

```
white → blue → pink → yellow → green → goldenrod → buff → salmon → cherry → tan → (cycle)
```

`white` è riservato al **first draft** (numero 1, mai sovrascrivibile via UI).
Dalla revisione 2 in poi la palette parte da `blue`.

I valori e l'ordine vivono già in `apps/web/app/features/projects/title-page.schema.ts`
come `DRAFT_COLOR_VALUES` — vengono **promossi** in `packages/domain` come
`DRAFT_REVISION_COLORS` per essere riusabili da screenplay + import + export.

## Data model

### Migration

```sql
ALTER TABLE screenplay_versions
  ADD COLUMN draft_color text,
  ADD COLUMN draft_date  date;

-- backfill: per ogni screenplay, la versione con number=1 prende 'white',
-- e le altre numerate progressivamente seguendo il ciclo a partire da 'blue'.
```

`draftColor` è nullable (legacy versioni create prima della spec restano `NULL`
finché un editor non le tocca; la UI le mostra come "no color" ma le tratta come
white nel calcolo del prossimo colore). `draftDate` è nullable e default `NULL`.

### Title page cleanup

`projects.title_page_draft_color` e `projects.title_page_draft_date`
diventano **deprecated**: la migration li copia (per ogni progetto) sulla
versione _corrente_ dello screenplay attivo, poi mantiene le colonne in DB
finché Spec 07c non rimuove l'editor del pannello Draft dal title page.
Il title page legge il colore della versione corrente — non scrive più.

## Color suggester

Quando l'utente crea una nuova versione (`createVersionFromScratch` /
`duplicateVersion`), il server suggerisce `draftColor` automaticamente:

```ts
// packages/domain/src/revision-color.ts
export const suggestNextColor = (existing: ReadonlyArray<DraftColor>): DraftColor
```

Regole:

1. Se `existing` è vuoto → `white`.
2. Altrimenti: prendi l'ultimo colore della lista (per `number` desc), trova
   il suo indice in `DRAFT_REVISION_COLORS`, ritorna l'elemento successivo
   in modulo. `white` viene saltato dal ciclo (riservato a v1).
3. `draftDate` suggerito = oggi (UTC date-only).

Il suggerimento è **non vincolante**: l'utente può cambiarlo dal drawer
versioni. Il server applica solo se il client non passa override.

## Import

### FDX (Final Draft) — Spec 05c esistente

Il formato `<TitlePage>` di FDX espone:

- `<DraftDate>` → mappato 1:1 su `draftDate`
- `<DraftColor>` (raro, alcuni esportano una stringa libera) → matchato
  case-insensitive contro `DRAFT_REVISION_COLORS`; se non matcha, scartato
  e si applica `suggestNextColor`.

Il parser FDX live in `packages/fdx-parser` (o equivalente, da verificare in
implementazione) viene esteso per estrarre questi due campi. Cambia il tipo
di ritorno: la version creata dall'import include i metadati.

### PDF — Spec 05c esistente

I PDF di copione raramente espongono draft metadata in modo strutturato.
Heuristic: se la prima pagina contiene un token `\b(BLUE|PINK|YELLOW|GREEN|GOLDENROD|BUFF|SALMON|CHERRY|TAN|WHITE)\s+(REVISIONS?|DRAFT)\b`, mappa il colore.
Altrimenti `suggestNextColor`. Data: cerca `(YYYY[-/]MM[-/]DD)` o
`MM[-/]DD[-/]YYYY` nelle prime 3 righe; altrimenti `null`.

## Export

Lo PDF export (Spec 08, ancora da scrivere) leggerà `draftColor` e
`draftDate` dalla versione esportata. Per ora **questa spec non implementa
l'export colorato** — si limita a esporre i metadati nelle query e nel
component di anteprima per non bloccare Spec 08.

## API

Server fns interessate (estensione, niente di nuovo):

| Fn                             | Cambio                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `createScreenplayVersion`      | Suggerisce `draftColor` se non passato; accetta override.                                            |
| `duplicateScreenplayVersion`   | Eredita `draftDate=today`; suggerisce nuovo `draftColor`.                                            |
| `updateScreenplayVersionMeta`  | **NUOVA**. `{ versionId, draftColor?, draftDate? }`. Owner+Editor.                                   |
| `listScreenplayVersions`       | Ritorna anche `draftColor` + `draftDate`.                                                            |
| `getTitlePageState` (Spec 07b) | Ritorna `draftColor` + `draftDate` derivati dalla version corrente, non più dal projects row.        |
| `updateTitlePageState`         | Rifiuta `draftColor`/`draftDate` con un errore `LegacyTitlePageMetaError` (UI smetterà di inviarli). |

Tutto via `createServerFn` + Zod + neverthrow + `requireUser` + permission
check (Owner+Editor su screenplay version, identico a `renameVersion`).

## UI

### Versions drawer (Spec 12b)

Ogni riga versione mostra:

```
[● blue]  v3  "Director cut"  · 2026-04-18  · 3 days ago
   ↑ swatch cliccabile → popover palette 10 colori
```

Click sullo swatch apre un popover con la palette + clear. Click sulla data
apre un date input inline. Entrambi chiamano `updateScreenplayVersionMeta`
con debounce 400ms (la riga non si rerender-a mentre digiti).

### Title page panel

Il pannello "DRAFT" diventa **read-only**: mostra colore + data dalla
versione corrente, con sotto un link "Edit in Versions →" che apre il
drawer. Niente più swatches editabili sul title page.

### Create / Duplicate version dialog

Prima di confermare, l'utente vede un piccolo preview del colore suggerito
con possibilità di cambiarlo. Default = `suggestNextColor` lato server.

## Tests impacted

Vitest:

- **NEW** `packages/domain/src/revision-color.test.ts` — `suggestNextColor` cycle, white-skip, idempotenza.
- **MOD** `apps/web/app/features/projects/title-page-state.schema.test.ts` — `draftColor`/`draftDate` rimossi dallo state.
- **NEW** `features/screenplay-editor/server/version-meta.server.test.ts` — `updateScreenplayVersionMeta` (Owner OK, Viewer Forbidden, color enum, date format).
- **MOD** parser FDX test — `<DraftColor>`/`<DraftDate>` estratti.
- **MOD** parser PDF test — heuristic colore + data.

Playwright:

- **MOD** `tests/projects/title-page.spec.ts` (Spec 07b) — pannello DRAFT read-only, link "Edit in Versions →".
- **NEW** `tests/screenplay/version-coloring.spec.ts` — drawer swatch + date editing, persistence, suggester sulla nuova versione.
- **MOD** `tests/screenplay/import-fdx.spec.ts` — assert color/date estratti da fixture FDX.

## Migration plan (chronological)

1. **DB migration** + drizzle schema (`screenplay_versions.draft_color`, `draft_date`).
2. **Domain** — promote `DRAFT_REVISION_COLORS` to `packages/domain`, write + test `suggestNextColor`.
3. **Server fns** — `updateScreenplayVersionMeta` + extend create/duplicate version + extend list query.
4. **Title page server** — read meta from current version; reject legacy fields.
5. **Drawer UI** — swatch popover + date input + suggester preview in create/duplicate dialog.
6. **Title page UI** — pannello DRAFT diventa read-only.
7. **Importers** — FDX + PDF heuristics.
8. **Export hook** — espone i metadati al renderer (no PDF coloring qui).
9. **Tests** — Vitest first, poi Playwright.
10. **Cleanup** — segnare deprecate le colonne `projects.title_page_draft_*` (rimosse in Spec 07c).

## Out of scope (defer)

- **PDF colored pages export** — Spec 08.
- **Diff per-pagina** che decide quali pagine ereditano il colore vs restano white — Spec 08.
- **Coloring per altri documenti** (logline / synopsis / ecc.).
- **Removal** delle colonne legacy `projects.title_page_draft_*` — Spec 07c.

## Open questions

- Vogliamo che la versione 1 sia **sempre** white o lasciamo cambiarla?
  Proposta: bloccata a white, label "First draft", non editabile dal drawer.
- Quando duplichi una v6 (cherry) la nuova v7 dovrebbe partire da `tan`
  (next nel ciclo) o da `cherry` (eredita)? Proposta: `tan` (= il colore
  è una proprietà della _revisione_, non del contenuto).
- Importando un FDX la cui versione 1 dichiara `<DraftColor>blue</DraftColor>`,
  rispettiamo l'import o forziamo white? Proposta: **rispettiamo l'import**
  e marchiamo la versione `imported=true` per evitare di rovinare la
  cronologia originale.
