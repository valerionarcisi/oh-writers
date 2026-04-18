# Spec 07b — Screenplay Front Page (page-zero inline)

**Status:** active rewrite. **Supersedes:** [07](07-title-page-legacy.md), [14](14-title-page.md). Sostituisce anche il primo draft di 07b (route dedicata).

## Goal

Il frontespizio è la **pagina 0 dello screenplay editor**: una pagina aggiuntiva sopra il body della sceneggiatura, con la stessa carta bianca/typography del resto, in cui l'Owner del progetto edita inline titolo, autore, "based on", contatti, note, WGA reg., draft date e draft color. È visibile e modificabile **solo all'Owner**. È salvata su `projects.title_page_*` (e `projects.title` per il titolo). È snapshottata insieme allo screenplay quando si crea una versione. È renderizzata come pagina 1 in fase di export PDF.

## Why

Il frontespizio non è un dato accessorio nel flusso del writer: è la prima cosa che vedi quando apri uno script. Una route separata o una modale spezzano il flusso e fanno percepire il frontespizio come "Settings". Trattandolo come pagina 0 dell'editor:

- **Coerenza visiva** con Final Draft / Highland (la title page **è** pagina 1)
- **Zero context switch** per l'Owner (apre il progetto e ce l'ha sotto al cursore)
- **Visibility chiara**: solo l'Owner la vede, niente confusione di ruoli su chi può cambiare cosa
- **Naturale per export PDF** (quello che vedi è quello che esporti)

## Decisioni architetturali (2026-04-18)

| Tema                | Decisione                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage             | Colonne `title_page_*` flat su `projects` (già migrate). Titolo riusa `projects.title`.                                                                                                                                                                                                 |
| Granularità         | **Una** title page per progetto.                                                                                                                                                                                                                                                        |
| UI primaria         | **Page-zero inline** nello screenplay editor — secondo `EditorView` ProseMirror montato sopra il body screenplay, stessa CSS/page shell.                                                                                                                                                |
| Visibilità          | **Solo Owner**: page-zero rendered + voce menu "Frontespizio" visibile + permission server-side. Editor (ruolo) e Viewer non vedono page-zero, non vedono la voce menu.                                                                                                                 |
| Yjs                 | Page-zero **fuori** da Yjs. Edits locali → debounced (~600ms) `updateTitlePage` server fn. Niente collaboration sulla title page (solo Owner edita comunque).                                                                                                                           |
| Schema PM page-zero | Schema PM **separato** dal body screenplay. Nodi inline-only per i campi text + nodi-decoration per date/color. Vedi sotto.                                                                                                                                                             |
| Date + Draft color  | **Popover non-text** accanto al rispettivo blocco nel page-zero (date input nativo + select colori). PM non è la UI giusta per data ed enum.                                                                                                                                            |
| Title inline        | Sì. Edit del titolo nel page-zero → `updateProjectTitle` → riallinea `projects.title` (e quindi slug, breadcrumb).                                                                                                                                                                      |
| Versioning          | Snapshot: quando si crea una versione dello screenplay, lo snapshot include anche `title_page_*` + `project.title` correnti. Tabella `screenplay_versions` esistente: aggiungere colonna `title_page_snapshot jsonb`.                                                                   |
| Export fallback     | Se `projects.title_page_*` è vuoto al momento dell'export, server cerca l'ultima versione con title page non-vuota e restituisce un prompt al client: _"Frontespizio attuale vuoto. Usare quello di [Draft 2 — 12/03/26]?"_ Sì → usa lo snapshot. No → export con solo `project.title`. |
| Scene count         | Page-zero **escluso** da renumber e da scene count. Refactor in tutti i posti che iterano `doc.descendants` per cercare scene heading.                                                                                                                                                  |
| Permessi            | Edit page-zero + edit title page = solo Owner. Reading via export PDF: chiunque abbia accesso al progetto vede pagina 1 nel PDF.                                                                                                                                                        |
| Naming              | In codice e DB: `titlePage` / `title_page_*` + `pageZero` per il nodo PM. Nei doc utente / pitch: "Frontespizio".                                                                                                                                                                       |

## Out of scope

- Multiple title page per progetto (revisioni colore/data → versioning, vedi sopra)
- Logo / immagine di copertina
- Localizzazione label ("Written by" → "Scritto da") — Spec 18
- Layout custom / template editor — un solo template hardcoded industry-standard
- Cast list / scene count summary come pagine aggiuntive
- Title page per documenti narrativi — fuori da questa spec
- Collaboration real-time sul page-zero (solo Owner edita; se in futuro più Owner co-editano, si sposta dentro Yjs)

## Stato implementazione (snapshot 2026-04-18)

| Pezzo                                                       | Stato         | Note                                                                                                        |
| ----------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| DB columns `title_page_*` su `projects`                     | ✅ shipped    | [packages/db/src/schema/projects.ts:41-60](packages/db/src/schema/projects.ts:41)                           |
| `TitlePageSchema` + `DraftColors` + Vitest                  | ✅ shipped    | [features/projects/title-page.schema.ts](apps/web/app/features/projects/title-page.schema.ts)               |
| Server fn `getTitlePage` / `updateTitlePage` con `canEdit`  | ✅ shipped    | [features/projects/server/title-page.server.ts](apps/web/app/features/projects/server/title-page.server.ts) |
| `TitlePageForm` (route dedicata)                            | 🟡 deprecated | Sostituito dalla page-zero come UX primaria. Route resta solo come fallback Owner-only per debug.           |
| Voce "Frontespizio" in `ToolbarMenu`                        | 🟡 to rewire  | Oggi naviga alla route. Diventa toggle che fa scroll-to-top sul page-zero (è già lì, sempre montata).       |
| **Page-zero PM view + schema**                              | ❌ missing    | Block 1 sotto                                                                                               |
| **Owner-only visibility (server + UI guard)**               | ❌ missing    | Block 2 sotto                                                                                               |
| **Date + draft color popovers**                             | ❌ missing    | Block 3 sotto                                                                                               |
| **Title inline edit → updateProjectTitle**                  | ❌ missing    | Block 4 sotto                                                                                               |
| **Esclusione page-zero da scene count + renumber**          | ❌ missing    | Block 5 sotto                                                                                               |
| **Versioning snapshot + export fallback prompt**            | ❌ missing    | Block 6 sotto                                                                                               |
| **Parser import PDF** (`splitFirstPage` + `parseTitlePage`) | ❌ missing    | Block 7 sotto                                                                                               |
| **Renderer export PDF** (`renderTitlePagePdf`)              | ❌ missing    | Block 8 sotto                                                                                               |

## Architettura — page-zero come secondo `EditorView`

Lo screenplay editor oggi monta **un** `EditorView` di ProseMirror per il body, sincronizzato via Yjs ([ProseMirrorView.tsx](apps/web/app/features/screenplay-editor/components/ProseMirrorView.tsx)).

Aggiungiamo un **secondo** `EditorView`, montato sopra il primo, con:

- **Schema PM separato** (`page-zero-schema.ts`): nodi minimali, una per riga del template title page
- **No Yjs**: edit locali → reducer `pageZeroState` + debounced `updateTitlePage`
- **Stessa CSS page shell** del body (carta bianca, typography Courier Prime, margini Letter format) → visivamente è "una pagina prima" delle altre
- **Mounting condizionale**: solo se `currentUser.id === project.ownerId` (server lo certifica + client guard come UX hint)

### Schema PM page-zero

```ts
// apps/web/app/features/screenplay-editor/lib/page-zero-schema.ts
const pageZeroSchema = new Schema({
  nodes: {
    doc: { content: "title author basedOn? contact? draftBlock? notes? wga?" },
    // Ognuno è un blocco con un solo paragrafo inline editabile.
    // attrs.field identifica il campo per il dispatcher di save.
    title: {
      content: "text*",
      attrs: { field: { default: "title" } },
      toDOM: () => ["h1", { class: "pz-title" }, 0],
      parseDOM: [{ tag: "h1.pz-title" }],
    },
    author: {
      content: "text*",
      attrs: { field: { default: "author" } },
      toDOM: () => ["p", { class: "pz-author" }, 0],
      parseDOM: [{ tag: "p.pz-author" }],
    },
    basedOn: {
      content: "text*",
      attrs: { field: { default: "basedOn" } },
      toDOM: () => ["p", { class: "pz-based-on" }, 0],
      parseDOM: [{ tag: "p.pz-based-on" }],
    },
    contact: {
      content: "text*",
      attrs: { field: { default: "contact" } },
      toDOM: () => ["p", { class: "pz-contact" }, 0],
      parseDOM: [{ tag: "p.pz-contact" }],
    },
    notes: {
      content: "text*",
      attrs: { field: { default: "notes" } },
      toDOM: () => ["p", { class: "pz-notes" }, 0],
      parseDOM: [{ tag: "p.pz-notes" }],
    },
    wga: {
      content: "text*",
      attrs: { field: { default: "wgaRegistration" } },
      toDOM: () => ["p", { class: "pz-wga" }, 0],
      parseDOM: [{ tag: "p.pz-wga" }],
    },
    // draftBlock: nodo "atom" con custom NodeView che renderizza i due popover (date + color)
    draftBlock: {
      atom: true,
      attrs: { draftDate: { default: null }, draftColor: { default: null } },
      toDOM: () => ["div", { class: "pz-draft-block" }],
    },
    text: {},
  },
});
```

Nessuna lista, nessun heading, nessun bold/italic. Una linea per nodo. `Enter` dentro un campo non fa newline — sposta il cursore al campo successivo (keymap custom).

### Plugin

| Plugin              | Cosa fa                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `history()`         | Undo/redo locale (separato dal body screenplay)                                                  |
| keymap navigation   | `Enter` / `Tab` → cursore al campo successivo. `Shift-Tab` → precedente.                         |
| keymap save         | `Mod-s` → flush immediato del debounce                                                           |
| `placeholderPlugin` | Decoration sui campi vuoti ("Author", "Based on…", ecc.)                                         |
| `saveDispatcher`    | Plugin che osserva `tr.docChanged`, estrae lo stato corrente, debounce 600ms → `updateTitlePage` |

### NodeView per `draftBlock`

`atom: true` significa che PM non lo edita: lo deleghiamo a un componente React renderizzato via NodeView. Il componente mostra `[date · color]` e al click apre due popover non-text:

- Date: `<input type="date">`
- Color: `<select>` con i 10 `DraftColors`

Cambio → `view.dispatch(view.state.tr.setNodeAttribute(pos, "draftDate", value))` → trigger del `saveDispatcher`.

### Sync con DB

```
On editor mount (Owner only):
  1. fetch getTitlePage(projectId) → titlePage + projectTitle
  2. seed page-zero PM doc da titlePage + projectTitle
  3. mount EditorView

On any tr.docChanged in page-zero:
  saveDispatcher debounce 600ms:
    extract { title, author, basedOn, contact, notes, wgaRegistration } from PM doc
    extract { draftDate, draftColor } from draftBlock attrs
    if title !== current projects.title:
      updateProjectTitle(projectId, title)  ← server fn separata
    updateTitlePage(projectId, titlePage)
```

Conflict handling: se `getTitlePage` ritorna dati cambiati lato server (es. import PDF appena fatto) mentre l'Owner stava editando → invalidiate query e re-seed del page-zero **solo se non isDirty**. Se isDirty → toast non-bloccante "Frontespizio aggiornato altrove, perderai le modifiche correnti se ricarichi". Edge case raro (un solo Owner edita), accettabile.

## UI primaria — visual layout

```
┌──────────────────────────────────────┐
│           [project.title]            │   ← <h1 class="pz-title">, MAIUSCOLO
│                                      │
│             Written by               │   ← label statica
│           [author]                   │
│                                      │
│         Based on [basedOn]           │   ← solo visibile se popolato (placeholder se vuoto e Owner)
│                                      │
│  …                                   │
│                                      │
│  [draftDate · draftColor]            │   ← bottom-left, draftBlock NodeView
│  [notes]                             │
│  [wga]                               │
│                                      │
│             [contact]                │   ← bottom-right
│                                      │
└──────────────────────────────────────┘
        ↓ scrolla giù ↓
┌──────────────────────────────────────┐
│  INT. CUCINA - GIORNO                │   ← body screenplay, Yjs-backed
│  …                                   │
```

Per **Editor / Viewer** (non-Owner): il page-zero **non è renderizzato**. Lo screenplay parte direttamente dalla prima scena. Voce menu "Frontespizio" nascosta.

## Permessi e ownership

- `projects.owner_id` è già in DB.
- Server fn `updateTitlePage` e nuova `updateProjectTitle` validano che `user.id === project.ownerId`. Se il progetto è di un team con più Owner → check membership con `role === OWNER`.
- Client guard: la voce menu "Frontespizio" è renderizzata solo se `currentUser.id === project.ownerId` (o membership.role === OWNER). UX hint: se un non-Owner manda comunque la mutation (devtools), server risponde `ForbiddenError`.

## Versioning — snapshot + export fallback

### Snapshot

Quando si crea una versione dello screenplay (Spec 06), oltre a `pm_doc` snapshottiamo anche:

```ts
// in screenplay_versions, nuova colonna:
title_page_snapshot jsonb NULL  -- { titlePage: TitlePage; projectTitle: string } | null
```

Migration: aggiungi colonna nullable. Snapshots vecchi restano `null` → al replay l'editor mostra il page-zero con i dati **correnti** del progetto (fallback ragionevole, è quello che già succede oggi).

### Export fallback

```
exportScreenplayPdf(projectId, screenplayVersionId?):
  if screenplayVersionId provided:
    use snapshot.title_page_snapshot if not null
    else fallback to projects.title_page_* (current)
  else (export current):
    if projects.title_page_* is empty:
      lastNonEmptyVersion = find latest version where title_page_snapshot.titlePage is non-empty
      if lastNonEmptyVersion:
        return { needsConfirm: true, suggestion: { versionLabel, snapshot } }
      else:
        proceed with empty title page (just project.title)
    else:
      use current
```

Il client riceve `needsConfirm`, mostra dialog "Frontespizio attuale vuoto. Usare quello di [Draft 2 — 12/03/26]?":

- **Sì** → re-call `exportScreenplayPdf` con `useTitlePageFromVersion: versionId`
- **No** → re-call con `useEmptyTitlePage: true`

## Esclusione page-zero da scene count + renumber

Il page-zero **non è nel `pm_doc` del body screenplay** — è un EditorView separato. Quindi `getSceneNodes(bodyDoc)`, `renumberScenes(bodyDoc)`, `countScenes(bodyDoc)` continuano a funzionare senza modifiche.

L'unica cosa da verificare: `pm_doc` salvato su `screenplays` table **non deve** mai contenere il page-zero (è proprio un altro doc). Verificare in `ProseMirrorView.tsx` che il save handler punti solo al body.

## Import PDF — Pass 0 (TODO)

Estensione di `fountainFromPdf` ([fountain-from-pdf.ts](apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts)):

```ts
const { firstPage, rest } = splitFirstPage(pages);
const titlePage = parseTitlePage(firstPage); // pure
return { fountain: ..., titlePage };
```

### `splitFirstPage(pages)`

- Identifica la prima pagina logica via i marker già usati dalla pipeline (page-number / `Buff Revised Pages`)
- Se la prima pagina contiene una scene heading (`SCENE_HEADING_RE`), **non è una title page** → ritorna `{ firstPage: [], rest: pages }`
- Altrimenti la rimuove dall'input e la passa a `parseTitlePage`

### `parseTitlePage(lines: string[]): TitlePage`

Funzione pura, deterministica, mai throw. Heuristics:

| Pattern                                                 | Campo                                        |
| ------------------------------------------------------- | -------------------------------------------- |
| Linea sopra `written by` / `by` / `scritto da` (i-case) | (titolo → ignorato, già in `projects.title`) |
| Linea dopo `written by` / `scritto da`                  | `author`                                     |
| `based on …` / `tratto da …`                            | `basedOn`                                    |
| Blocco linee con `@` (email), telefono, "Agent:"        | `contact` (joined)                           |
| Pattern `WGA #12345` / `WGAW No. …`                     | `wgaRegistration`                            |
| Linea con `FIRST DRAFT` / `FINAL` / `REV.`              | `notes`                                      |
| Pattern data ISO o `Month DD, YYYY`                     | `draftDate`                                  |
| Nome colore industry (`PINK REVISIONS`, ecc.)           | `draftColor`                                 |

### Server-side flow

`importPdf` (Spec 05c) ritorna `{ fountain, titlePage }`. Il client chiama `updateTitlePage` con il `titlePage` **prima** di scrivere il `pm_doc`, così il page-zero è già pronto al primo open per l'Owner.

## Export PDF — Pagina 1 (TODO)

Funzione pura `renderTitlePagePdf(doc: PDFKit.PDFDocument, payload: { projectTitle, titlePage }): void` in `apps/web/app/features/screenplay-editor/lib/pdf-title-page.ts`.

Layout USA standard:

- Titolo centrato verticalmente a 1/3 dall'alto, MAIUSCOLO
- Spacer + `Written by` + autore, centrati
- `Based on …` sotto, centrato — solo se popolato
- **Bottom-left**: `draftDate · draftColor · notes · WGA reg.` impilati
- **Bottom-right**: `contact` (multi-line)

Invocata sempre come pagina 1 da [Spec 08](08-scene-renumber.md) — anche se title page è vuota, renderizza almeno `projectTitle`.

## Files

### Da creare

| File                                                                        | Scopo                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/lib/page-zero-schema.ts`           | Schema PM page-zero                                             |
| `apps/web/app/features/screenplay-editor/lib/page-zero-schema.test.ts`      | Vitest schema                                                   |
| `apps/web/app/features/screenplay-editor/lib/page-zero-sync.ts`             | `pageZeroToTitlePage` + `titlePageToPageZeroDoc` puri + tests   |
| `apps/web/app/features/screenplay-editor/lib/plugins/page-zero-keymap.ts`   | Enter/Tab navigation                                            |
| `apps/web/app/features/screenplay-editor/lib/plugins/save-dispatcher.ts`    | Debounce + invocazione `updateTitlePage` + `updateProjectTitle` |
| `apps/web/app/features/screenplay-editor/components/PageZeroView.tsx` + css | Mount EditorView + NodeView draftBlock + popovers               |
| `apps/web/app/features/screenplay-editor/components/DraftBlockNodeView.tsx` | NodeView React per draftBlock con date + color popovers         |
| `apps/web/app/features/projects/server/project-title.server.ts`             | `updateProjectTitle` server fn (Owner-only)                     |
| `apps/web/app/features/projects/hooks/useUpdateProjectTitle.ts`             | Hook                                                            |
| `apps/web/app/features/screenplay-editor/lib/title-page-from-pdf.ts`        | Parser import (Block 7)                                         |
| `apps/web/app/features/screenplay-editor/lib/title-page-from-pdf.test.ts`   | Vitest parser                                                   |
| `apps/web/app/features/screenplay-editor/lib/pdf-title-page.ts`             | Renderer export (Block 8)                                       |
| `apps/web/app/features/screenplay-editor/lib/pdf-title-page.test.ts`        | Vitest renderer                                                 |
| `tests/fixtures/title-pages/01..06.txt`                                     | Estratti raw prima pagina (vedi sotto)                          |
| `tests/editor/title-page-page-zero.spec.ts`                                 | Playwright OHW-FP10..15 (page-zero UX)                          |
| `tests/editor/title-page-import.spec.ts`                                    | Playwright OHW-FP06..07                                         |
| `tests/editor/title-page-export.spec.ts`                                    | Playwright OHW-FP08..09                                         |
| `packages/db/migrations/NNNN_screenplay_versions_title_page_snapshot.sql`   | Add `title_page_snapshot jsonb` to `screenplay_versions`        |

### Da modificare

| File                                                                                                 | Cambio                                                                |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx`                            | Mount `<PageZeroView>` sopra `<ProseMirrorView>` solo se `isOwner`    |
| `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx`                                 | Voce "Frontespizio" visibile solo se `isOwner`; click → scroll-to-top |
| `apps/web/app/features/projects/server/title-page.server.ts`                                         | `updateTitlePage`: stretto a Owner-only (oggi è Owner+Editor)         |
| `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts`                                | Persiste `titlePage` parsato via `updateTitlePage` (Block 7)          |
| `apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts`                                   | Pass 0 (Block 7)                                                      |
| `apps/web/app/features/screenplay-editor/server/screenplay-versions.server.ts`                       | Snapshot di `title_page_*` + `projects.title` quando crea versione    |
| `apps/web/app/features/screenplay-editor/server/screenplay-export.server.ts` (o equivalente Spec 08) | Logica fallback "title page vuota → suggerisci versione precedente"   |
| `packages/db/src/schema/screenplay-versions.ts`                                                      | Nuova colonna `titlePageSnapshot jsonb`                               |

### Deprecati (no rimuovere ancora)

- Route `/projects/$id/title-page` + `TitlePageForm` + `TitlePagePreview` → restano live come fallback Owner-only per debug. Nuovo entry-point UX è il page-zero. Da rimuovere in spec successiva quando il page-zero è stabile.

### Decommissioned

- Spec 07 e Spec 14 → header "Superseded by 07b" già messi.

## Test fixtures (parser import)

`tests/fixtures/title-pages/`:

| File                   | Copre                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `01-minimal.txt`       | Titolo + "written by" + autore                               |
| `02-full-contacts.txt` | + agent block (email, telefono)                              |
| `03-based-on.txt`      | + `based on the novel by …`                                  |
| `04-revisions.txt`     | + `PINK REVISIONS - 03/15/2026` → `draftColor` + `draftDate` |
| `05-italian.txt`       | `scritto da`, accenti                                        |
| `06-no-front-page.txt` | Prima pagina è già una scena → parser bails out              |

## User stories → OHW IDs

| ID       | Stato   | Story                                                                                                                   |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| OHW-FP10 | ❌ TODO | Owner apre screenplay editor → vede page-zero in cima con titolo + placeholder per autore/contatti/ecc.                 |
| OHW-FP11 | ❌ TODO | Editor (ruolo, non-Owner) apre screenplay editor → page-zero **non renderizzato**, voce menu Frontespizio **nascosta**  |
| OHW-FP12 | ❌ TODO | Owner digita autore → debounce 600ms → DB aggiornato → reload mantiene il valore                                        |
| OHW-FP13 | ❌ TODO | Owner cambia titolo nel page-zero → `projects.title` aggiornato + breadcrumb/header del progetto si aggiornano          |
| OHW-FP14 | ❌ TODO | Owner clicca draftBlock → popover apre date input + color select → cambio → debounce → DB aggiornato                    |
| OHW-FP15 | ❌ TODO | Non-Owner manda `updateTitlePage` (devtools) → server risponde `ForbiddenError`                                         |
| OHW-FP16 | ❌ TODO | Versione creata dopo edit page-zero → snapshot include `title_page_snapshot`                                            |
| OHW-FP17 | ❌ TODO | Export con title page vuota + versione precedente non-vuota → dialog "Usare quella di Draft 2?" → Sì → PDF usa snapshot |
| OHW-FP18 | ❌ TODO | Export con title page vuota + nessuna versione precedente non-vuota → procede con solo `project.title`                  |
| OHW-FP06 | ❌ TODO | Import PDF con title page completa → `title_page_*` popolati → page-zero mostra i valori al primo open                  |
| OHW-FP07 | ❌ TODO | Import PDF senza title page → `title_page_*` restano NULL, prima scena non persa                                        |
| OHW-FP08 | ❌ TODO | Export PDF con title page popolata → pagina 1 PDF mostra titolo + autore + contatti + draft info nelle posizioni attese |
| OHW-FP09 | ❌ TODO | Export PDF con title page vuota e nessuna versione precedente → pagina 1 mostra solo `project.title`                    |

## Implementation order (TDD)

1. **Owner-only guard** (server + UI hint) — stretto `updateTitlePage` a Owner-only, nascondi voce menu "Frontespizio" per non-Owner. Playwright OHW-FP11 + OHW-FP15. Bassissimo rischio.
2. **Page-zero schema + sync puri** — `page-zero-schema.ts` + `page-zero-sync.ts` (`pageZeroToTitlePage`, `titlePageToPageZeroDoc`) + Vitest. Pure code.
3. **`PageZeroView` mount + read-only** — Mount sopra body screenplay solo per Owner, seed da `getTitlePage`, nessun edit ancora. Playwright OHW-FP10.
4. **Save dispatcher debounced** — Plugin save-dispatcher + integrazione `updateTitlePage`. Playwright OHW-FP12.
5. **`DraftBlockNodeView` + popovers** — date + color. Playwright OHW-FP14.
6. **Title inline edit** — `updateProjectTitle` server fn + sync con breadcrumb/header. Playwright OHW-FP13.
7. **Versioning snapshot** — Migration + estensione `screenplay-versions.server.ts`. Playwright OHW-FP16.
8. **Parser import + Pass 0** — `splitFirstPage` + `parseTitlePage` + Pass 0 + persist. Vitest fixtures + Playwright OHW-FP06..07.
9. **Renderer export + fallback prompt** — `renderTitlePagePdf` + logica fallback in `screenplay-export.server.ts`. Vitest renderer + Playwright OHW-FP08..09 + OHW-FP17..18.
10. **Cleanup** — remove route `/title-page` + `TitlePageForm` se confermato che il page-zero copre tutto.

## Mock mode

`MOCK_PDF_IMPORT=true` (Spec 05c) ritorna anche un `titlePage` fisso, così l'E2E gira senza pipeline pdf reale.

## Open questions

- **Co-Owner concorrenti**: se un team ha più Owner che editano la title page contemporaneamente → l'ultimo write vince. Edge case raro perché page-zero non è in Yjs. Se diventa un problema vero, si valuta moving page-zero dentro Yjs (vedi Out of scope).
- **Mobile companion**: il page-zero è ProseMirror → non è portabile in Expo. Per la mobile companion, si esporrà la title page via una form HTML semplice (riusare il `TitlePageForm` deprecato come Owner-only screen). Coerente con CLAUDE.md "platform reach".
