# Spec 07b — Screenplay Front Page (standalone PM editor)

**Status:** active. **Supersedes:** [07](07-title-page-legacy.md), [14](14-title-page.md).
**Design history:** initial draft was a route-form; second draft was page-zero inline in the screenplay editor; **current (2026-04-18c)** is a standalone PM editor page that mirrors the printed front page 1-to-1.

## Goal

Il frontespizio è la **pagina 1** del PDF esportato. Lo si edita da una **route dedicata** (`/projects/$id/title-page`) che mostra una singola "carta" (stessa shell A4/Letter dello screenplay editor) con **un solo `EditorView` ProseMirror** e 5 regioni editabili che mappano 1-a-1 ai blocchi tipici di una title page industry-standard:

```
title          — single line, large, centered (top third)
centerBlock    — multi-line free text (Written by / author / based on …)
footerLeft     — multi-line free text (typically draft + date label)
footerCenter   — multi-line free text (typically production company)
footerRight    — multi-line free text (typically agent / contact)
```

Date e draft color **non sono nel doc PM**: stanno in un side panel "Draft metadata" a destra (date input nativo + select colore).

## Why

- **WYSIWYG totale:** quello che vedi è quello che esporti. Niente form-to-preview gap.
- **Zero struttura imposta:** non c'è nessun "Author field" obbligato. L'utente compone il blocco centrale come vuole — italiano, inglese, "based on the novel by", credit chains, niente.
- **Owner-only:** read-only per chiunque non sia Owner del progetto (già shipped, Block 1).
- **Single PM doc** = single source of truth. Niente sync tra N input e M anteprime.

## Decisioni architetturali (2026-04-18c)

| Tema             | Decisione                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI               | **Standalone route** `/projects/$id/title-page`, una "page card" centrale + side panel destro per draft date / draft color.                                                                                                                                         |
| Editor           | **Un solo `EditorView` PM** con schema dedicato (5 nodi top-level). Nessun Yjs (Owner-only).                                                                                                                                                                        |
| Storage doc      | **Nuova colonna** `projects.title_page_doc jsonb` — contiene il PM doc serializzato (`Doc.toJSON()`). Default `null` = empty front page.                                                                                                                            |
| Storage metadata | Riusa `projects.title_page_draft_date` + `projects.title_page_draft_color` (già migrati).                                                                                                                                                                           |
| Title sync       | Il nodo `title` del PM doc è **bidirezionalmente legato** a `projects.title`. Edit del nodo → debounced update di `projects.title` (e quindi slug + breadcrumb).                                                                                                    |
| Campi legacy     | `title_page_author`, `title_page_based_on`, `title_page_contact`, `title_page_wga_registration`, `title_page_notes` → **deprecati**. Restano in DB, non più scritti né letti. Migration di pulizia in spec 07c se serve.                                            |
| Save             | **No Save button.** Debounced (~500ms) `updateTitlePage` server fn ad ogni transazione PM o cambio metadata. Save indicator in alto a destra (riusa `SaveIndicator`).                                                                                               |
| Permessi         | Read = chiunque legga il progetto. Edit = **solo Owner** (server-side `isOwner` guard, già shipped Block 1).                                                                                                                                                        |
| Versioning       | Snapshot del doc quando si crea una versione dello screenplay → colonna `screenplay_versions.title_page_snapshot jsonb` (insieme a `title_page_draft_date_snapshot` e `title_page_draft_color_snapshot`).                                                           |
| Export fallback  | Se `projects.title_page_doc` è vuoto al momento dell'export, server cerca l'ultima versione con snapshot non-vuoto e restituisce un prompt al client. Sì → usa lo snapshot. No → export senza front page.                                                           |
| Naming           | Codice e DB: `titlePageDoc` / `title_page_doc`. UI label IT: "Frontespizio".                                                                                                                                                                                        |
| Styling          | **Riusa i token dello screenplay editor**: stesso `--paper-bg`, stessa font monospace tipografica, stessi `--shadow-*` per la page card, stessi colori di accent del side panel. Niente nuovi tokens — la title page deve sembrare la pagina 1 dello stesso editor. |

## Out of scope

- Multiple title page per progetto
- Logo / immagine di copertina
- Localizzazione (Spec 18)
- Layout custom / template editor
- Title page per documenti narrativi
- Collaboration real-time (solo Owner edita)
- Page-zero inline nello screenplay editor (scartato in favore della route dedicata: meno coupling con il body editor, refactor scene-count non più necessario, stesso DX)

## PM schema — `title-page-pm/schema.ts`

```ts
new Schema({
  nodes: {
    doc: {
      content: "title centerBlock footerLeft footerCenter footerRight",
    },
    title: { content: "text*", isolating: true, defining: true },
    centerBlock: { content: "para+", isolating: true, defining: true },
    footerLeft: { content: "para+", isolating: true, defining: true },
    footerCenter: { content: "para+", isolating: true, defining: true },
    footerRight: { content: "para+", isolating: true, defining: true },
    para: { content: "text*" },
    text: { group: "inline" },
  },
  marks: {
    strong: { parseDOM: [{ tag: "strong" }], toDOM: () => ["strong", 0] },
    em: { parseDOM: [{ tag: "em" }], toDOM: () => ["em", 0] },
    underline: { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] },
  },
});
```

- `isolating: true` su ogni regione = caret e Backspace non escono dalla regione corrente. Niente fuse accidentali tra title e centerBlock.
- `title` è **single-line** (no `para+`): keymap intercetta Enter e ridireziona il caret al primo `para` di `centerBlock`.
- Niente lists, headings, links — front page è tipograficamente piatta.

## Layout (CSS)

```
.titlePageRoute
├── .breadcrumb (project ← Close)
├── .pageCard (A4 paper shell, --shadow-md, max-inline-size 8.5in)
│   ├── .title           (PM region 1 — node "title")
│   ├── .centerBlock     (PM region 2 — node "centerBlock")
│   ├── .spacer (flex: 1)
│   └── .footerRow (display: flex; gap)
│       ├── .footerLeft   (PM region 3)
│       ├── .footerCenter (PM region 4)
│       └── .footerRight  (PM region 5)
└── .sidePanel (right, sticky)
    ├── .draftDate   (input type=date)
    └── .draftColor  (select with 10 values)
```

Tutte e 5 le regioni sono dentro **lo stesso EditorView**. La separazione visuale tra centerBlock e footerRow è puro CSS (flex column, `justify-content: space-between` sul `.pageCard`).

## Server contract

```ts
// title-page.schema.ts
export const TitlePageDocSchema = z.object({}).passthrough(); // PM doc JSON shape
export const TitlePageStateSchema = z.object({
  doc: TitlePageDocSchema.nullable(),
  draftDate: DateString.nullable(),
  draftColor: DraftColorEnum.nullable(),
});
export type TitlePageState = z.infer<typeof TitlePageStateSchema>;
```

```ts
// server fns
getTitlePage   (GET)  → ResultShape<{ projectTitle, state, canEdit }, …>
updateTitlePage(POST) → ResultShape<TitlePageState, ForbiddenError | …>
   // body: { projectId, state }
   // server-side: extract title node text from doc.content[0], if changed
   //              → also update projects.title in same tx
```

`updateTitlePage` è chiamata debounced (500ms) dal client. Idempotente.

## Implementation order

1. **DB migration** — `projects.title_page_doc jsonb null`. (~10 min)
2. **Zod schema** — `TitlePageStateSchema`, deprecate old `TitlePageSchema` fields. (~10 min)
3. **PM schema + doc converters** — `title-page-pm/schema.ts` + helpers `emptyDoc(projectTitle)` and `extractTitle(doc)`. (~30 min)
4. **`TitlePageEditor` component** — single EditorView, mount the schema, read-only first. (~45 min)
5. **Side panel** — date + color, controlled inputs. (~20 min)
6. **Wire debounced save** — single `useUpdateTitlePage` hook, fires on PM transactions and metadata changes, 500 ms debounce. (~30 min)
7. **Title sync** — server-side write of `projects.title` when title node text changes. (~20 min)
8. **Replace** `TitlePageForm` in route with `TitlePageEditor`. Drop `TitlePageForm`. (~15 min)
9. **Playwright** — OHW-FP20..27 (see below). (~60 min)
10. **Spec 08 hand-off** — export reads `title_page_doc`. (separate PR)
11. **Spec 06b hand-off** — version snapshot. (separate PR)

## User stories → OHW IDs

Reusable IDs starting at **OHW-FP20** (FP10..15 used by Block 1 owner-guard).

| ID       | Story                                                                                |
| -------- | ------------------------------------------------------------------------------------ |
| OHW-FP20 | Owner apre route → vede page card vuota con cursore nel `title`                      |
| OHW-FP21 | Type nel `title` → debounced save → reload → titolo persiste                         |
| OHW-FP22 | Type nel `title` → `projects.title` aggiornato → breadcrumb riflette il nuovo titolo |
| OHW-FP23 | Enter nel `title` → caret salta a `centerBlock`, non crea seconda riga di titolo     |
| OHW-FP24 | Type nei 3 footer (left / center / right) → ognuno salva indipendentemente           |
| OHW-FP25 | Cambia draftDate → debounced save → reload → date persiste                           |
| OHW-FP26 | Seleziona draftColor → save → reload → color persiste                                |
| OHW-FP27 | Viewer: stessa pagina, EditorView in `editable: () => false`, side panel disabled    |

## Files

```
packages/db/
├── src/schema/projects.ts                          ← + titlePageDoc jsonb
└── drizzle/NNNN_add_title_page_doc.sql             ← NEW (drizzle-kit generate)

apps/web/app/features/projects/
├── title-page.schema.ts                            ← rewrite: TitlePageStateSchema
├── server/title-page.server.ts                     ← rewrite handlers
├── hooks/useTitlePage.ts                           ← updated
├── components/
│   ├── TitlePageEditor.tsx + .module.css           ← NEW (replaces TitlePageForm)
│   ├── TitlePageDraftPanel.tsx + .module.css       ← NEW (date + color)
│   └── TitlePageForm.tsx + .module.css             ← DELETE
└── title-page-pm/                                  ← NEW folder
    ├── schema.ts                                   ← PM schema
    ├── empty-doc.ts                                ← emptyDoc(projectTitle)
    └── title-extract.ts                            ← extractTitle(doc) → string

apps/web/app/routes/
└── _app.projects.$id_.title-page.tsx               ← swap form for editor

tests/projects/
└── title-page.spec.ts                              ← rewrite to OHW-FP20..27
```

## Open questions

- Drop the deprecated `title_page_author/based_on/contact/wga/notes` columns now or in a follow-up cleanup spec? → defer, no behaviour cost.
- Do we want a "reset to empty" button in the side panel? → defer until requested.
