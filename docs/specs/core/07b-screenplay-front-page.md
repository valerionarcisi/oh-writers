# Spec 07b — Screenplay Front Page (riconciliazione 07 + 14)

**Status:** active. **Supersedes:** [07](07-title-page-legacy.md), [14](14-title-page.md).

## Goal

Una sola **front page** per progetto, editabile, importabile dalla prima pagina di un PDF di sceneggiatura, e renderizzata come pagina 1 in fase di export PDF. Industry-standard (USA): titolo centrato, "written by", autore, contatti in basso-destra, draft info in basso-sinistra.

## Why

Le spec 07 e 14 coprono pezzi diversi della stessa feature e si contraddicono (07: JSONB su `screenplays`, modale dalla toolbar, parsing import; 14: colonne flat su `projects`, route dedicata, draft colors industry-standard). La roadmap README chiede esplicitamente di riconciliarle. Le colonne `title_page_*` di 14 sono **già in DB** ([projects.ts:41-60](packages/db/src/schema/projects.ts:41)) — questa spec le adotta come storage e ci costruisce sopra editor + import + export.

## Decisioni di riconciliazione

| Tema          | Decisione                                                                                       | Da quale spec     |
| ------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| Storage       | Colonne `title_page_*` flat su `projects` (già migrate)                                         | 14                |
| Granularità   | **Una** front page per progetto (no per-screenplay, no per-draft)                               | 14                |
| Editor        | **Modale** aperta dalla toolbar dello screenplay editor (writer non esce dal contesto)          | 07                |
| Route         | No route dedicata `/title-page` — la modale basta. La route 14 è scartata.                      | nuova             |
| Schema fields | Flat: `author`, `basedOn`, `contact`, `draftDate`, `draftColor`, `wgaRegistration`, `notes`     | 14                |
| Title source  | `projects.title` riusato come titolo (no campo separato)                                        | 14                |
| Import PDF    | Pass 0 in `fountainFromPdf` che splitta la prima pagina e popola i campi `title_page_*`         | 07                |
| Export PDF    | `renderFrontPagePdf(doc, project)` invocato come pagina 1 dalla pipeline fountain→PDF (Spec 08) | 14 (formalizzato) |
| Permessi      | Edit: Owner + Editor. Read: Viewer (form disabled).                                             | 14                |

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

## UI — Editor modale

Componente `FrontPageEditor.tsx` aperto dalla voce **"Frontespizio"** del menu toolbar dello screenplay editor ([ToolbarMenu.tsx](apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx)).

```
┌─ Frontespizio ────────────────────────── [Annulla] [Salva] ─┐
│  Titolo            [readonly: project.title]                │
│  Scritto da        [input]                                  │
│  Tratto da         [input]                                  │
│  Contatti          [textarea, 4 righe]                      │
│  ────────────────────────────────────────────────────────── │
│  Data draft        [date]    Colore  [select 10 colori]     │
│  Note              [input]   (es. "FIRST DRAFT")            │
│  WGA Reg.          [input]                                  │
│  ────────────────────────────────────────────────────────── │
│  Anteprima:                                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │              [TITOLO IN MAIUSCOLO]                   │   │
│  │                                                      │   │
│  │                  Written by                          │   │
│  │                                                      │   │
│  │                  [Author Name]                       │   │
│  │                                                      │   │
│  │   [Draft date · Color · Notes]   [Contact block]     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- `useReducer` + ts-pattern (pattern CLAUDE.md), action creators `setAuthor`, `setBasedOn`, ecc.
- Salva esplicito (no autosave) — l'utente non sta scrivendo prosa qui, sono dati strutturati
- Dirty tracking → bottone "Salva" disabilitato se non c'è nulla da salvare
- Viewer: tutti gli input `disabled`, bottoni nascosti, anteprima visibile
- `Esc` chiude (con conferma se dirty)
- CSS Module + transition `prefers-reduced-motion`-safe

## Import PDF — Pass 0

Estensione di `fountainFromPdf` ([fountain-from-pdf.ts](apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts)):

```ts
// Prima delle pass esistenti
const { firstPage, rest } = splitFirstPage(pages);
const frontPage = parseFrontPage(firstPage); // pure
// rest → pipeline fountain esistente
return { fountain: ..., frontPage };
```

### `splitFirstPage(pages)`

- Identifica la prima pagina logica via i marker già usati dalla pipeline (page-number / `Buff Revised Pages`)
- Se la prima pagina contiene una scene heading (`SCENE_HEADING_RE` di `fountain-constants.ts`), **non è una front page** → ritorna `{ firstPage: [], rest: pages }`
- Altrimenti la rimuove dall'input e la passa a `parseFrontPage`

### `parseFrontPage(lines: string[]): FrontPage`

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

Quello che non si riconosce viene scartato — il writer corregge nella modale.

### Server-side flow

`importPdf` server function (Spec 05c, esistente) ritorna `{ fountain, frontPage }`. Il client chiama `updateFrontPage` con `frontPage` **prima** di scrivere il `pm_doc`, così la front page è già pronta al primo open dell'editor.

## Export PDF — Pagina 1

Funzione pura `renderFrontPagePdf(doc: PDFKit.PDFDocument, project: Project): void` in `apps/web/app/features/screenplay-editor/lib/pdf-front-page.ts`.

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

### Create

| File                                                                      | Scopo                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/web/app/features/projects/front-page.schema.ts`                     | `FrontPageSchema`, `DraftColors`, tipi inferiti           |
| `apps/web/app/features/projects/front-page.errors.ts`                     | Errori tipati (plain value)                               |
| `apps/web/app/features/projects/server/front-page.server.ts`              | `getFrontPage`, `updateFrontPage`                         |
| `apps/web/app/features/projects/hooks/useFrontPage.ts`                    | Query + mutation hook                                     |
| `apps/web/app/features/projects/components/FrontPageEditor.tsx` + css     | Modale editor + anteprima                                 |
| `apps/web/app/features/screenplay-editor/lib/front-page-from-pdf.ts`      | `splitFirstPage` + `parseFrontPage` puri                  |
| `apps/web/app/features/screenplay-editor/lib/front-page-from-pdf.test.ts` | Vitest, una `describe` per fixture                        |
| `apps/web/app/features/screenplay-editor/lib/pdf-front-page.ts`           | `renderFrontPagePdf` puro                                 |
| `apps/web/app/features/screenplay-editor/lib/pdf-front-page.test.ts`      | Vitest, render → buffer non-empty + testo via `pdf-parse` |
| `tests/fixtures/front-pages/01..06.txt`                                   | Estratti raw prima pagina (vedi tabella sotto)            |
| `tests/editor/front-page.spec.ts`                                         | Playwright OHW-FP01..09                                   |

### Modify

| File                                                                  | Cambio                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/lib/fountain-from-pdf.ts`    | Pass 0: splitta prima pagina, ritorna `{ fountain, frontPage }`     |
| `apps/web/app/features/screenplay-editor/server/pdf-import.server.ts` | Persiste `frontPage` via `updateFrontPage` prima del `pm_doc` write |
| `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx`  | Voce "Frontespizio" apre `FrontPageEditor`                          |
| `apps/web/app/features/projects/index.ts`                             | Esporta `FrontPageEditor`, hook, schema                             |

### Decommissioned

- `docs/specs/core/07-title-page-legacy.md` → header "Superseded by 07b"
- `docs/specs/core/14-title-page.md` → header "Superseded by 07b"

## Test fixtures

`tests/fixtures/front-pages/`:

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

| ID       | Story                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------ |
| OHW-FP01 | Owner clicca "Frontespizio" in toolbar → modale aperta con form vuota (solo title popolato)      |
| OHW-FP02 | Owner compila Author + DraftDate + Color → Salva → riapre → campi persistono                     |
| OHW-FP03 | Editor (non-owner) può salvare; Viewer vede form disabled, no bottoni                            |
| OHW-FP04 | Non-member: server rifiuta `updateFrontPage` con `ForbiddenError`                                |
| OHW-FP05 | Modale: dirty + Esc → conferma "scartare modifiche?"                                             |
| OHW-FP06 | Import PDF con front page completa → campi popolati automaticamente                              |
| OHW-FP07 | Import PDF senza front page (prima pagina = scena) → `title_page_*` restano NULL, no scena persa |
| OHW-FP08 | Export PDF: pagina 1 mostra titolo + autore + contatti + draft info nelle posizioni attese       |
| OHW-FP09 | Export PDF con front page vuota → pagina 1 mostra solo `project.title`, no errori                |

## Implementation order (TDD)

1. **Schema + server fn** — `FrontPageSchema`, `getFrontPage`, `updateFrontPage` + permission tests (Vitest)
2. **Modale editor** — `FrontPageEditor` + hook + integrazione toolbar (Playwright OHW-FP01..05)
3. **Parser import** — `splitFirstPage` + `parseFrontPage` puri + fixture (Vitest)
4. **Wire import** — Pass 0 in `fountainFromPdf` + persistenza in `pdf-import.server.ts` (Playwright OHW-FP06..07)
5. **Renderer export** — `renderFrontPagePdf` (Vitest con `pdf-parse`)
6. **Wire export** — invocazione da pipeline Spec 08 (Playwright OHW-FP08..09)
7. **Cleanup** — header "superseded" su 07 e 14, README roadmap aggiornata

## Mock mode

`MOCK_PDF_IMPORT=true` (Spec 05c, esistente) ritorna anche un `frontPage` fisso, così l'E2E gira senza pipeline pdf reale.

## Open questions

Nessuna bloccante. Da rivedere se emergono in implementazione:

- Se l'utente cambia `project.title` mentre la front page è popolata → re-render anteprima OK, niente da fare server-side
- Versioning della front page: per ora no, se serve si tratta come campo del progetto e si versiona via document-versions universale (Spec 06)
