# Spec 14 — Title Page / Frontespizio

> **Superseded by [07b — Screenplay Front Page](07b-screenplay-front-page.md).**
> Riconciliata con [07](07-title-page-legacy.md) in un'unica spec attiva. Tenuta come storico: le colonne `title_page_*` su `projects` e i `DraftColors` di questa spec sono adottati da 07b.

## Goal

Ogni progetto può definire un **frontespizio** (title page) secondo la convenzione standard dell'industria. Il frontespizio compare come prima pagina nel PDF esportato — sia della sceneggiatura (Spec 05 fountain export) sia dei documenti narrativi (Spec 04c), quando applicabile. È un dato strutturato del progetto, non un documento editabile a mano.

## Status at spec time

Feature non implementata. Nessun campo frontespizio nel DB. La toolbar del progetto non ha sezione dedicata.

## Out of scope

- **Multiple title pages per project** (es. draft v1 + draft v2) — non serve, uno solo
- **Localization** dei label (Title / Written by / Based on) — Spec 18
- **Contatti agente / manager multipli** — un solo blocco contatti, plain text
- **Layout custom / template editor** — un solo template hardcoded, industry-standard
- **Pagine aggiuntive** (cast list, scene count summary) — eventuali sub-spec

## Data model

**Decisione: campi strutturati sulla tabella `projects`**, non JSON blob. Alternativa (JSONB) scartata: title page è un oggetto piccolo e piatto, meglio query-friendly.

```sql
-- Aggiunti a `projects`:
title_page_author         text NULL,
title_page_based_on       text NULL,
title_page_contact        text NULL,           -- free-text block (email/phone/agent)
title_page_draft_date     date NULL,
title_page_draft_color    text NULL,           -- "white", "blue", "pink", …
title_page_wga_registration text NULL,
title_page_notes          text NULL            -- "FIRST DRAFT", "FINAL", custom
```

Campo `projects.title` già esiste (titolo del progetto) → riusato come titolo sul frontespizio.

### Zod schema

```ts
// features/projects/title-page.schema.ts
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
} as const; // Industry-standard revision colors

export const TitlePageSchema = z.object({
  author: z.string().max(200).nullable().default(null),
  basedOn: z.string().max(500).nullable().default(null),
  contact: z.string().max(1000).nullable().default(null),
  draftDate: z.string().date().nullable().default(null),
  draftColor: z.nativeEnum(DraftColors).nullable().default(null),
  wgaRegistration: z.string().max(50).nullable().default(null),
  notes: z.string().max(200).nullable().default(null),
});
export type TitlePage = z.infer<typeof TitlePageSchema>;
```

## Server functions

```ts
// features/projects/server/projects.server.ts
export const getTitlePage = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(/* read project → extract title_page_* fields */);

export const updateTitlePage = createServerFn({ method: "POST" })
  .validator(
    z.object({ projectId: z.string().uuid(), titlePage: TitlePageSchema }),
  )
  .handler(/* canEdit guard + update columns */);
```

## UI contract

### Route

`/projects/:id/title-page` — nuova route, nel layout del progetto.

### Layout

```
Project Settings · Title Page                             [Save]

┌──────────────────────────────────────────────────────┐
│ Title              [read-only, shows project.title]  │
│ Written by         [input]                           │
│ Based on           [input]                           │
│ Contact            [textarea, 4 rows]                │
│                                                      │
│ Draft date         [date input]                      │
│ Draft color        [select]                          │
│ Notes              [input] (e.g., "FIRST DRAFT")     │
│                                                      │
│ WGA Registration # [input]                           │
└──────────────────────────────────────────────────────┘

Preview:
┌──────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│                 [PROJECT TITLE]                      │
│                                                      │
│                   Written by                         │
│                                                      │
│                  [Author Name]                       │
│                                                      │
│                 Based on a novel                     │
│                  by X. (optional)                    │
│                                                      │
│                                                      │
│                                                      │
│                                                      │
│                                [Contact block,       │
│                                 bottom-right]        │
│                                                      │
│                                    [Date · Color]    │
└──────────────────────────────────────────────────────┘
```

- Input: single form con `useReducer` + action creators (pattern CLAUDE.md)
- Preview in tempo reale sulla destra
- `Save` abilitato solo se dirty; permission check lato client via `canEdit` field su project (riuso pattern Spec 04)
- Viewer vede la form in read-only (fieldset disabled) + il preview

### PDF render

Funzione pura `renderTitlePagePdf(doc: PDFKit.PDFDocument, project, titlePage)`:

- Centra titolo verticalmente 1/3 dall'alto
- "Written by" + nome autore sotto (spacing standard)
- "Based on" solo se popolato
- Contact block in basso-destra (convenzione industria USA)
- Draft info (date, color, notes, WGA) in basso-sinistra

Invocata da:

- Pipeline fountain→PDF esistente (Spec 05) come pagina 1
- `exportNarrativePdf` (Spec 04c) opzionalmente come pagina 1

## User stories → OHW IDs

Prossimo ID libero: **OHW-230** (dopo 04c).

| ID      | User story                                                                                |
| ------- | ----------------------------------------------------------------------------------------- |
| OHW-230 | Owner su `/projects/:id/title-page` vede form vuota (no campi pre-compilati tranne Title) |
| OHW-231 | Owner compila Author + DraftDate + Color → Save → reload → campi persistono               |
| OHW-232 | Viewer su team project: form in read-only, Save button nascosto                           |
| OHW-233 | Non-member di un team project: server rifiuta updateTitlePage con ForbiddenError          |
| OHW-234 | Draft color select espone tutti e 10 i valori industry-standard                           |
| OHW-235 | Preview aggiornamento live: digito Author → preview mostra il nome senza salvataggio      |

## Implementation order (TDD)

1. Blocco 1 — DB migration: aggiunta colonne `title_page_*` con default NULL
2. Blocco 2 — schema Zod + server fn `getTitlePage` + `updateTitlePage`
3. Blocco 3 — route + form + preview (client)
4. Blocco 4 — PDF render function (`renderTitlePagePdf`) — inizialmente isolata, wired in Spec 04c e 05 separatamente
5. Blocco 5 — E2E: OHW-230..235
6. Blocco 6 — regression & commit

## Testing

- **Vitest**: Zod schema (date format, enum colors, string limits); `renderTitlePagePdf` → PDF buffer non-empty, testo chiave presente via `pdf-parse`
- **Playwright E2E**: OHW-230..235
- **Integration**: Spec 05 e Spec 04c aggiungeranno test che verificano la title page come pagina 1 del rispettivo PDF quando popolata

## Files touched / created

```
packages/db/
├── src/schema/projects.ts                    ← +7 colonne title_page_*
└── migrations/NNNN_add_title_page.sql        ← NEW

apps/web/app/features/projects/
├── title-page.schema.ts                      ← NEW, Zod schema + DraftColors
├── server/title-page.server.ts               ← NEW, getTitlePage + updateTitlePage
├── hooks/useTitlePage.ts                     ← NEW
└── components/TitlePageForm.tsx + .module.css ← NEW

apps/web/app/features/documents/
└── lib/pdf-title-page.ts                     ← NEW, renderTitlePagePdf

apps/web/app/routes/
└── _app.projects.$id_.title-page.tsx         ← NEW

tests/projects/
└── title-page.spec.ts                        ← NEW, OHW-230..235
```

## Open questions

- Slot "Revisions" (storia dei colori/date) è Spec 06b territory? Decisione: v1 ha **un** colore + **una** data. Storia via document-versions se serve.
- Logo / immagine di copertina: esplicitamente fuori v1. Riapriamo se emerge richiesta.
