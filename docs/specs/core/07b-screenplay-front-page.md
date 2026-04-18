# Spec 07b — Screenplay Front Page (riconciliazione 07 + 14)

**Status:** in progress — storage + editor route già shipped, mancano parser import e renderer export. **Supersedes:** [07](07-title-page-legacy.md), [14](14-title-page.md).

## Stato implementazione (snapshot 2026-04-18)

| Pezzo                                                                      | Stato      | Note                                                                                                                                 |
| -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| DB columns `title_page_*` su `projects`                                    | ✅ shipped | [packages/db/src/schema/projects.ts:41-60](packages/db/src/schema/projects.ts:41)                                                    |
| `TitlePageSchema` + `DraftColors` + Vitest                                 | ✅ shipped | [features/projects/title-page.schema.ts](apps/web/app/features/projects/title-page.schema.ts)                                        |
| Server fn `getTitlePage` / `updateTitlePage` con `canEdit` + `ResultShape` | ✅ shipped | [features/projects/server/title-page.server.ts](apps/web/app/features/projects/server/title-page.server.ts)                          |
| Hook `useTitlePage` + `useUpdateTitlePage`                                 | ✅ shipped | [features/projects/hooks/useTitlePage.ts](apps/web/app/features/projects/hooks/useTitlePage.ts)                                      |
| `TitlePageForm` (form + preview live + dirty tracking + viewer disabled)   | ✅ shipped | [features/projects/components/TitlePageForm.tsx](apps/web/app/features/projects/components/TitlePageForm.tsx)                        |
| Route dedicata `/projects/$id/title-page`                                  | ✅ shipped | [routes/_app.projects.$id_.title-page.tsx](apps/web/app/routes/_app.projects.$id_.title-page.tsx)                                    |
| Voce "Frontespizio" in `ToolbarMenu` che naviga alla route                 | ✅ shipped | [features/screenplay-editor/components/ToolbarMenu.tsx:43-47](apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx:43) |
| **Parser import PDF** (`splitFirstPage` + `parseFrontPage`)                | ❌ missing | Block 3 sotto                                                                                                                        |
| **Pass 0 in `fountainFromPdf`** + persist via `updateTitlePage`            | ❌ missing | Block 4 sotto                                                                                                                        |
| **Renderer export PDF** (`renderTitlePagePdf`)                             | ❌ missing | Block 5 sotto                                                                                                                        |
| **Wire export pipeline** (Spec 08)                                         | ❌ missing | Block 6 sotto                                                                                                                        |
| E2E Playwright per la route Frontespizio                                   | ✅ shipped | [tests/projects/title-page.spec.ts](tests/projects/title-page.spec.ts)                                                               |

## Goal

Una sola **front page** per progetto, editabile, importabile dalla prima pagina di un PDF di sceneggiatura, e renderizzata come pagina 1 in fase di export PDF. Industry-standard (USA): titolo centrato, "written by", autore, contatti in basso-destra, draft info in basso-sinistra.

## Why

Le spec 07 e 14 coprono pezzi diversi della stessa feature e si contraddicono (07: JSONB su `screenplays`, modale dalla toolbar, parsing import; 14: colonne flat su `projects`, route dedicata, draft colors industry-standard). La roadmap README chiede esplicitamente di riconciliarle. Le colonne `title_page_*` di 14 sono **già in DB** ([projects.ts:41-60](packages/db/src/schema/projects.ts:41)) — questa spec le adotta come storage e ci costruisce sopra editor + import + export.

## Decisioni di riconciliazione

| Tema          | Decisione                                                                                                                                                                                | Da quale spec     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Storage       | Colonne `title_page_*` flat su `projects` (già migrate)                                                                                                                                  | 14                |
| Granularità   | **Una** front page per progetto (no per-screenplay, no per-draft)                                                                                                                        | 14                |
| Editor        | **Route dedicata** `/projects/$id/title-page` aperta dalla voce "Frontespizio" del menu toolbar dello screenplay editor                                                                  | 14 (già shipped)  |
| Naming        | In codice e DB: `titlePage` / `title_page_*`. Nei doc utente / pitch: "Frontespizio". L'opzione "FrontPage" del primo draft di 07b è scartata per non rinominare codice già funzionante. | revisione         |
| Schema fields | Flat: `author`, `basedOn`, `contact`, `draftDate`, `draftColor`, `wgaRegistration`, `notes`                                                                                              | 14                |
| Title source  | `projects.title` riusato come titolo (no campo separato)                                                                                                                                 | 14                |
| Import PDF    | Pass 0 in `fountainFromPdf` che splitta la prima pagina e popola i campi `title_page_*`                                                                                                  | 07                |
| Export PDF    | `renderFrontPagePdf(doc, project)` invocato come pagina 1 dalla pipeline fountain→PDF (Spec 08)                                                                                          | 14 (formalizzato) |
| Permessi      | Edit: Owner + Editor. Read: Viewer (form disabled).                                                                                                                                      | 14                |

## Out of scope

- Multiple front page per progetto (revisioni colore/data tracciate via versioning)
- Logo / immagine di copertina
- Localizzazione label ("Written by" → "Scritto da") — Spec 18
- Layout custom / template editor — un solo template hardcoded industry-standard
- Cast list / scene count summary come pagine aggiuntive
- Title page dei documenti narrativi (logline/synopsis/treatment) — fuori da questa spec, valutata in export narrativo unificato

## Data model

Già in DB. Nessuna migration nuova. Ricapitolato per riferimento:

```ts
// packages/db/src/schema/projects.ts (esistente)
title_page_author          text NULL
title_page_based_on        text NULL
title_page_contact         text NULL   -- multi-line free text
title_page_draft_date      date NULL
title_page_draft_color     text NULL   -- enum 10 colori industry
title_page_wga_registration text NULL
title_page_notes           text NULL   -- "FIRST DRAFT", "FINAL", custom
```

### Zod schema

```ts
// apps/web/app/features/projects/front-page.schema.ts
export const DraftColors = {
  WHITE: "white",
  BLUE: "blue",
  PINK: "pink",
  YELLOW: "yellow",
  GREEN: "green",
  GOLDENROD: "goldenrod",
  BUFF: "buff",
  SALMON: "salmon",
  CHERRY: "cherry",
  TAN: "tan",
} as const;
export type DraftColor = (typeof DraftColors)[keyof typeof DraftColors];

export const FrontPageSchema = z.object({
  author: z.string().max(200).nullable().default(null),
  basedOn: z.string().max(500).nullable().default(null),
  contact: z.string().max(1000).nullable().default(null),
  draftDate: z.string().date().nullable().default(null),
  draftColor: z.nativeEnum(DraftColors).nullable().default(null),
  wgaRegistration: z.string().max(50).nullable().default(null),
  notes: z.string().max(200).nullable().default(null),
});
export type FrontPage = z.infer<typeof FrontPageSchema>;
```

## Server functions

```ts
// apps/web/app/features/projects/server/front-page.server.ts
export const getFrontPage = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ResultShape<FrontPage, NotFoundError | ForbiddenError>> => { ... });

export const updateFrontPage = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid(), frontPage: FrontPageSchema }))
  .handler(async ({ data }): Promise<ResultShape<FrontPage, ForbiddenError | DbError>> => {
    await requireUser();
    // canEdit guard (Owner | Editor) → update title_page_* columns → toShape
  });
```

`updateFrontPage` è chiamata sia dall'editor manuale sia dal pdf-import (vedi sotto).

## UI — Editor route (già shipped)

`TitlePageForm` è montato sulla route `/projects/$id/title-page` ([routes/_app.projects.$id_.title-page.tsx](apps/web/app/routes/_app.projects.$id_.title-page.tsx)). La voce "Frontespizio" del menu toolbar dello screenplay editor naviga lì ([ToolbarMenu.tsx:43-47](apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx:43)).

Caratteristiche già implementate:

- Form a sinistra + preview live a destra (industry-standard USA)
- Dirty tracking → bottone Save disabilitato se nulla da salvare
- Viewer: `fieldset disabled`, bottoni nascosti, preview visibile
- `useTitlePage` (query) + `useUpdateTitlePage` (mutation con invalidate)
- Permission check server-side via `canEdit(project, user.id, membership)` + esposto al client come `result.value.canEdit`
- Stato locale con `useState` (semplice, una form piatta — `useReducer` non necessario, regola "non over-abstract" del CLAUDE.md)

### Limature aperte (UI polish — non bloccanti per la release MVP)

- Test Vitest sul componente `TitlePageForm` (dirty toggle, viewer disabled, color enum) — assenti
- Playwright E2E sulla route — verificare se `tests/projects/title-page.spec.ts` esiste e copre OHW-FP01..05
- Errore `update.error` mostrato come testo grezzo (`error.message`) — può diventare un toast, fuori scope di 07b

## Import PDF — Pass 0 (TODO)

Estensione di `fountainFromPdf` ([fountain-from-pdf.ts](apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts)):

```ts
// Prima delle pass esistenti
const { firstPage, rest } = splitFirstPage(pages);
const titlePage = parseTitlePage(firstPage); // pure
// rest → pipeline fountain esistente
return { fountain: ..., titlePage };
```

### `splitFirstPage(pages)`

- Identifica la prima pagina logica via i marker già usati dalla pipeline (page-number / `Buff Revised Pages`)
- Se la prima pagina contiene una scene heading (`SCENE_HEADING_RE` di `fountain-constants.ts`), **non è una title page** → ritorna `{ firstPage: [], rest: pages }`
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

Quello che non si riconosce viene scartato — il writer corregge dalla route `/title-page`.

### Server-side flow

`importPdf` server function ([Spec 05c](05c-pdf-import.md), esistente) ritorna `{ fountain, titlePage }`. Il client chiama `updateTitlePage` con il `titlePage` **prima** di scrivere il `pm_doc`, così il frontespizio è già pronto al primo open dell'editor.

## Export PDF — Pagina 1 (TODO)

Funzione pura `renderTitlePagePdf(doc: PDFKit.PDFDocument, project: Project): void` in `apps/web/app/features/screenplay-editor/lib/pdf-title-page.ts`.

Layout (industry-standard USA):

- Titolo (`project.title`) centrato verticalmente a 1/3 dall'alto, MAIUSCOLO, font default screenplay
- Spacer + `Written by` + autore (`title_page_author`), centrati
- `Based on …` (`title_page_based_on`) sotto, centrato — solo se popolato
- **Bottom-left**: `draftDate · draftColor · notes · WGA reg.` impilati
- **Bottom-right**: `contact` (multi-line), allineato a destra

Invocata da:

- Pipeline fountain→PDF della Spec 08 (export sceneggiatura) — sempre come pagina 1, anche se la front page è completamente vuota → in quel caso renderizza solo `project.title` centrato (uno screenplay senza titolo non esiste)
- **Non** invocata da export narrativo: i documenti narrativi non hanno front page in v1

## Files

### Già esistenti (no-touch)

| File                                                                       | Scopo                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web/app/features/projects/title-page.schema.ts` (+ `.test.ts`)       | `TitlePageSchema` + `DraftColors` + Vitest                  |
| `apps/web/app/features/projects/server/title-page.server.ts`               | `getTitlePage`, `updateTitlePage` + `titlePageQueryOptions` |
| `apps/web/app/features/projects/hooks/useTitlePage.ts`                     | `useTitlePage`, `useUpdateTitlePage`                        |
| `apps/web/app/features/projects/components/TitlePageForm.tsx` + module.css | Form + preview + dirty + viewer disabled                    |
| `apps/web/app/routes/_app.projects.$id_.title-page.tsx` + module.css       | Route                                                       |
| `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx`       | Voce "Frontespizio" già naviga alla route                   |

### Da creare (parser + renderer)

| File                                                                      | Scopo                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/lib/title-page-from-pdf.ts`      | `splitFirstPage` + `parseTitlePage` puri                  |
| `apps/web/app/features/screenplay-editor/lib/title-page-from-pdf.test.ts` | Vitest, una `describe` per fixture                        |
| `apps/web/app/features/screenplay-editor/lib/pdf-title-page.ts`           | `renderTitlePagePdf` puro                                 |
| `apps/web/app/features/screenplay-editor/lib/pdf-title-page.test.ts`      | Vitest, render → buffer non-empty + testo via `pdf-parse` |
| `tests/fixtures/title-pages/01..06.txt`                                   | Estratti raw prima pagina (vedi tabella sotto)            |
| `tests/editor/title-page-import.spec.ts`                                  | Playwright OHW-FP06..07 (import)                          |
| `tests/editor/title-page-export.spec.ts`                                  | Playwright OHW-FP08..09 (export)                          |

### Da modificare (wiring)

| File                                                                  | Cambio                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts`    | Pass 0: splitta prima pagina, ritorna `{ fountain, titlePage }`     |
| `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts` | Persiste `titlePage` via `updateTitlePage` prima del `pm_doc` write |
| Pipeline export Spec 08 (file da definire in 08)                      | Invoca `renderTitlePagePdf` come pagina 1                           |

### Decommissioned

- `docs/specs/core/07-title-page-legacy.md` → header "Superseded by 07b"
- `docs/specs/core/14-title-page.md` → header "Superseded by 07b"

## Test fixtures

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

Prossimo blocco libero: `OHW-FP01..09`.

| ID       | Stato      | Story                                                                                            |
| -------- | ---------- | ------------------------------------------------------------------------------------------------ |
| OHW-FP01 | ✅ shipped | Owner clicca "Frontespizio" in toolbar → naviga alla route con form vuota (solo title popolato)  |
| OHW-FP02 | ✅ shipped | Owner compila Author + DraftDate + Color → Salva → reload → campi persistono                     |
| OHW-FP03 | ✅ shipped | Editor (non-owner) può salvare; Viewer vede form disabled, no bottoni                            |
| OHW-FP04 | ✅ shipped | Non-member: server rifiuta `updateTitlePage` con `ForbiddenError`                                |
| OHW-FP05 | ✅ shipped | E2E presente in `tests/projects/title-page.spec.ts` — verificare cosa copre se serve dettaglio   |
| OHW-FP06 | ❌ TODO    | Import PDF con title page completa → campi `title_page_*` popolati automaticamente               |
| OHW-FP07 | ❌ TODO    | Import PDF senza title page (prima pagina = scena) → `title_page_*` restano NULL, no scena persa |
| OHW-FP08 | ❌ TODO    | Export PDF: pagina 1 mostra titolo + autore + contatti + draft info nelle posizioni attese       |
| OHW-FP09 | ❌ TODO    | Export PDF con title page vuota → pagina 1 mostra solo `project.title`, no errori                |

## Implementation order (TDD)

1. **Parser import** — `splitFirstPage` + `parseTitlePage` puri + 6 fixture (Vitest). Pure code, niente DB, niente UI.
2. **Wire import** — Pass 0 in `fountainFromPdf` (ritorna `{ fountain, titlePage }`); `pdf-import.server.ts` chiama `updateTitlePage` prima del `pm_doc` write (Playwright OHW-FP06..07).
3. **Renderer export** — `renderTitlePagePdf` puro (Vitest con `pdf-parse`).
4. **Wire export** — invocazione da pipeline Spec 08 come pagina 1, sempre presente (Playwright OHW-FP08..09).

Nice-to-have (non bloccanti): Vitest sul componente `TitlePageForm` (dirty toggle, viewer disabled, color enum) — la copertura E2E già esiste.

## Mock mode

`MOCK_PDF_IMPORT=true` ([Spec 05c](05c-pdf-import.md), esistente) deve essere esteso a ritornare anche un `titlePage` fisso, così l'E2E gira senza pipeline pdf reale.

## Open questions

Nessuna bloccante. Da rivedere se emergono in implementazione:

- Se l'utente cambia `project.title` mentre la title page è popolata → re-render anteprima già OK lato UI; export PDF userà sempre il `project.title` corrente.
- Versioning della title page: per ora no, se serve si tratta come campo del progetto e si versiona via document-versions universale (Spec 06).
- Se decideremo poi di aprire il frontespizio come **modale invece che route** (UX più fluida, niente cambio di pagina), si tratterà di riutilizzare `TitlePageForm` dentro un dialog — la route può rimanere come deep link.
