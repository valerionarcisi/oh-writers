# Spec 04f — Soggetto

Estende **Spec 04** (Narrative Editor) con un nuovo document type: il **soggetto**, cuore narrativo del progetto nella tradizione italiana.

Export PDF/Markdown generico resta in **04c**. L'export SIAE-style definito qui è specifico del soggetto.

## Goal

Uno sceneggiatore italiano apre il proprio progetto, scrive il **soggetto** (2–5 cartelle di prosa narrativa strutturata con 5 heading suggeriti), Cesare lo aiuta a generare sezione per sezione, e può esportarlo sia in formato documento pulito (PDF/DOCX) sia in un formato SIAE-ready compilando un modal con autori, genere, durata.

Il soggetto è il **secondo step** della pipeline documenti, subito dopo la logline. La schermata del soggetto unifica logline e corpo narrativo sulla stessa route, perché si scrivono iterando insieme.

## Pipeline documenti — nuovo ordine

| Ordine | Tipo        | Note                                                                  |
| ------ | ----------- | --------------------------------------------------------------------- |
| 1      | `logline`   | Campo scalare sul progetto (max 500 char). Co-editato in `/soggetto`. |
| 2      | `soggetto`  | **Nuovo.** 2–5 cartelle, prosa con heading Markdown.                  |
| 3      | `synopsis`  | Resta invariato. Utile per pressbook e pitch breve.                   |
| 4      | `outline`   | Resta invariato.                                                      |
| 5      | `treatment` | Resta invariato.                                                      |

L'ordine viene reso **esplicito** come costante esportata `DOCUMENT_PIPELINE` in `packages/domain/src/constants.ts`. Tutte le UI (dashboard, sidebar, wizard) leggono da lì — zero hardcoding dell'ordine altrove.

## Out of scope (esplicito)

- **Persistenza dei campi SIAE** (autori, registro, data deposito) su DB. Solo input modal → render PDF → download. Quando arriverà l'integrazione deposito reale, spec separata.
- **Export SIAE in lingue ≠ italiano.** Only-IT.
- **Cesare "genera tutto il soggetto in un colpo"** — solo section-by-section, coerente con pattern "controllore garbato".
- **Sync automatica logline↔synopsis.** Synopsis resta documento indipendente.
- **Hard cap** su lunghezza. Solo soft warning sopra 2 cartelle/~3.600 parole.
- **Rich text** — prosa Markdown pura, stesso pattern di synopsis/treatment.
- **Nuove tabelle DB.** Riuso `documents` + `document_versions` esistenti.

## Data model

### DocumentType enum

Aggiungere a `packages/domain/src/constants.ts`:

```ts
export const DocumentTypes = {
  LOGLINE: "logline",
  SOGGETTO: "soggetto", // ← nuovo
  SYNOPSIS: "synopsis",
  OUTLINE: "outline",
  TREATMENT: "treatment",
} as const;

export const DOCUMENT_PIPELINE = [
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
] as const;
```

`DocumentTypeSchema` in `versions.schema.ts` e in `project.schema.ts` aggiungere `DocumentTypes.SOGGETTO` ai rispettivi `z.enum`.

### DB schema

**Nessuna migration se** la colonna `documents.type` è `text`. Da verificare allo start del plan con `\d documents` — se è un `CREATE TYPE document_type AS ENUM`, serve migration `ALTER TYPE document_type ADD VALUE 'soggetto'`.

Constraint esistente `UNIQUE (project_id, type)` già copre "un solo soggetto per progetto".

### Length costants

Nuovo modulo `packages/domain/src/subject/length.ts`:

```ts
export const CHARS_PER_CARTELLA = 1800;
export const WORDS_PER_PAGE = 250;
export const SOGGETTO_SOFT_WARNING_WORDS = 3600;

export interface SubjectLength {
  readonly cartelle: number;   // 1 decimal, es. 2.3
  readonly pages: number;      // 1 decimal
  readonly words: number;
  readonly chars: number;
  readonly isOverSoftLimit: boolean;
}

export const analyzeSubjectLength = (text: string): SubjectLength => { ... };
```

Funzione pura, Vitest.

### Template iniziale

Costante `SOGGETTO_INITIAL_TEMPLATE` in `packages/domain/src/subject/template.ts`:

```markdown
## Premessa

## Protagonista & antagonista

## Arco narrativo

## Mondo

## Finale
```

Usato alla creazione del primo version del soggetto se `content === ""`.

## Route & UI

### Nuova route

`apps/web/app/routes/projects/$projectId/soggetto.tsx`.

### Layout

```
┌─────────────────────────────────────────────┐
│  ← Progetto: Titolo                         │
├─────────────────────────────────────────────┤
│  LOGLINE               [✨ estrai]          │
│  ┌───────────────────────────────────────┐  │
│  │ <textarea max 500 char>              │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  SOGGETTO       [↓ export] [↓ export SIAE] │
│  ┌───────────────────────────────────────┐  │
│  │ ## Premessa              [✨ genera]  │  │
│  │ ...                                   │  │
│  │ ─── cartella 2 ───                    │  │
│  │ ## Protagonista...       [✨ genera]  │  │
│  │ ...                                   │  │
│  └───────────────────────────────────────┘  │
│  2,3 cartelle · pag. 3 di 5 · 680 parole   │
└─────────────────────────────────────────────┘
```

### Editor

**Riuso `NarrativeEditor` esistente** (ProseMirror — vedi Spec 04e). Nessuna nuova libreria.

Estensioni minime:

1. **Plugin marker cartelle**: decoration che a ogni `CHARS_PER_CARTELLA` caratteri dall'inizio del doc inserisce una widget `<div class="cartellaMarker">— cartella N —</div>`. Decorativo, non persistito.
2. **Schema heading → ✨ button**: ogni node `heading` (livello 2) in un soggetto mostra a destra un bottone inline "✨ genera". Implementato come NodeView ProseMirror o come overlay React posizionato via `coordsAtPos`. Il bottone chiama `generateSubjectSection` passando il testo dell'heading come `section`.
3. **Footer counter**: componente `<SubjectFooter subject={content} />` sotto l'editor, ricalcola `analyzeSubjectLength` on-change. Mostra `{cartelle},{decimal} cartelle · pag. X di Y · N parole`. Se `isOverSoftLimit` → banner warning non-bloccante ("Stai entrando in territorio trattamento…"), dismissibile.

### Logline field

Sopra l'editor, campo `TextEditor` esistente (max 500). Salva al progetto (`logline` è colonna su `projects`, non un document versionato — conferma in `project.schema.ts`).

Bottone **✨ estrai** accanto alla label: chiama `generateLoglineFromSubject`, apre popover con suggerimento; accetta → sovrascrive il campo, rifiuta → chiude.

### Navigation

- **Dashboard progetto**: card "Soggetto" tra Logline e Synopsis. Stato: `updatedAt` ultima version o placeholder "Nessun soggetto ancora".
- **Sidebar progetto**: nuovo link "Soggetto".
- Tutto ordinato via `DOCUMENT_PIPELINE`.

## Cesare integration

### Server functions

Nuovo file `apps/web/app/features/documents/server/subject-ai.server.ts`.

#### `generateSubjectSection`

```ts
export const generateSubjectSection = createServerFn({ method: "POST" })
  .validator(z.object({
    projectId: z.string().uuid(),
    section: z.enum([
      "premessa", "protagonista", "arco", "mondo", "finale",
    ]),
  }))
  .handler(async ({ data }) => { ... });
```

**Output**: `ResultShape<{ text: string }, ...>`.

**Logica**:

1. `requireUser` + `canEditProject` (riuso permissions esistenti).
2. Carica `project` (title, genre, format, logline) e l'attuale soggetto (se esiste) per passare le altre sezioni come contesto.
3. Rate limit: `checkAndStampRateLimit(db, projectId, 'subject:${section}', 30_000)`.
4. Mock: `process.env.MOCK_AI === "true"` → `mockSubjectSection(section, genre)`.
5. Real: Claude **Haiku-4.5**, system prompt + few-shot in cache ephemeral (pattern Cesare). Prompt richiede italiano, tono narrativo, 200–400 parole per sezione, no meta-commento.
6. Ritorna testo puro. Il client sceglie dove inserirlo (sotto l'heading corrispondente, sostituendo eventuale testo esistente della sezione previa conferma).

#### `generateLoglineFromSubject`

```ts
export const generateLoglineFromSubject = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) => { ... });
```

**Output**: `ResultShape<{ logline: string }, ...>` dove `logline.length <= 500`.

Haiku, legge il soggetto corrente, estrae logline in ≤ 500 char. Rate limit `'subject:logline-extract'` 30s.

### Mock AI

`apps/web/app/mocks/ai-responses.ts` — aggiungere:

```ts
export const mockSubjectSection = (
  section: "premessa" | "protagonista" | "arco" | "mondo" | "finale",
  genre: Genre | null,
): string => { ... }
```

Ritorna 3–4 frasi deterministiche per coppia `section × genre`. Test separato in `ai-responses.test.ts`.

### Prompt (Claude Haiku)

Collocato in `features/documents/lib/subject-prompt.ts`. System prompt + 2 few-shot examples (un drama, un thriller). Tutto in italiano. Tool use non richiesto: output libero, estratto via `response.content[0].text`.

## Export

Due flussi, due bottoni in toolbar soggetto.

### Export normale (PDF + DOCX)

**Riuso/estensione `ExportPdfModal`** esistente. Aggiungere radio:

- `○ PDF`
- `○ DOCX` (nuovo)

**DOCX**: lib npm `docx@^9.x` (**da approvare dall'utente prima dell'install**). Server fn `exportSubjectDocx({ projectId })` → `ResultShape<{ base64: string, filename: string }>`.

**PDF**: riuso pipeline `exportDocumentPdf` di Spec 04c. Rendering: frontespizio con titolo + autore principale (dal progetto), corpo soggetto con heading e paragrafi.

Hook `useExportSubject` in `features/documents/hooks/useExportSubject.ts`.

### Export SIAE (solo PDF, solo IT)

Nuovo modal **`ExportSiaeModal`** in `features/documents/components/`.

**Form Zod** (`SiaeExportInputSchema` in `features/documents/documents.schema.ts`):

```ts
export const SiaeExportInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200), // prefill project.title
  authors: z
    .array(
      z.object({
        fullName: z.string().min(1).max(200),
        taxCode: z.string().max(16).nullable(), // codice fiscale, opzionale
      }),
    )
    .min(1),
  declaredGenre: z.string().max(100), // prefill project.genre
  estimatedDurationMinutes: z.number().int().min(1).max(600),
  compilationDate: z.string().date(), // ISO date, prefill today
  depositNotes: z.string().max(500).nullable(),
});
```

**Server fn** `exportSubjectSiae` in `subject-export.server.ts`:

```ts
.handler(async ({ data }) => {
  // 1. requireUser + permission
  // 2. carica soggetto corrente
  // 3. render PDF con frontespizio SIAE + corpo soggetto (italiano fisso)
  // 4. ritorna ResultShape<{ base64, filename }>
})
```

**Nessuna persistenza** dei campi input. Solo input → render → download.

**Layout frontespizio** (prima pagina PDF):

```
        REPUBBLICA ITALIANA
        SIAE — Sezione OLAF
        SOGGETTO PER OPERA CINEMATOGRAFICA

Titolo:              <title>
Genere dichiarato:   <declaredGenre>
Durata stimata:      <estimatedDurationMinutes> minuti
Data di compilazione: <compilationDate>

Autore/i:
  • <author 1 fullName>  [CF: <taxCode se presente>]
  • <author 2 ...>

Logline:
  <project.logline>

──────────────────────────
[Pagina 2+: corpo soggetto, heading e paragrafi,
con numerazione cartelle nel piè di pagina]
```

Lib PDF: **riuso `afterwriting`** (già in progetto per screenplay PDF — verificare in `Spec 05j`). Se non adatta al layout prosa narrativa, fallback su `pdfkit` (da approvare).

## Schemas (Zod)

Tutti gli schemas Zod centralizzati in `features/documents/documents.schema.ts`:

- `SubjectSectionSchema = z.enum(["premessa", "protagonista", "arco", "mondo", "finale"])`
- `GenerateSubjectSectionInputSchema`
- `GenerateLoglineInputSchema`
- `SiaeExportInputSchema` (vedi sopra)

## Error handling

Riuso `DbError`, `ForbiddenError`, `NotFoundError` da `packages/utils/src/errors.ts`.

Nuovi errori domain in `features/documents/documents.errors.ts`:

```ts
export class SubjectNotFoundError {
  readonly _tag = "SubjectNotFoundError" as const;
  readonly message: string;
  constructor(readonly projectId: string) {
    this.message = `Soggetto not found for project ${projectId}`;
  }
}

export class SubjectRateLimitedError {
  readonly _tag = "SubjectRateLimitedError" as const;
  readonly message = "Rate limit: riprova tra poco";
  constructor(readonly retryAfterMs: number) {}
}
```

Tutti i server fn ritornano `ResultShape` via `toShape()`. Client: `unwrapResult` + `match` su `_tag`.

## Testing

### Vitest

- `subject/length.test.ts` — `analyzeSubjectLength`: empty, 1 cartella esatta, 2.5 cartelle, sopra soft limit.
- `subject/template.test.ts` — template contiene 5 heading previsti.
- `mocks/ai-responses.test.ts` — `mockSubjectSection` per ognuna delle 5 × (null genre + 2 generi). Output deterministico.
- `documents/documents.schema.test.ts` — `SiaeExportInputSchema`: valid, authors vuoto → fail, tax code troppo lungo → fail.

### Playwright

Nuovo dir `tests/soggetto/`:

- `soggetto-flow.spec.ts` `[OHW-SOG-001]` — crea progetto, naviga `/soggetto`, vedi logline + editor con template 5 heading.
- `soggetto-flow.spec.ts` `[OHW-SOG-002]` — click "✨ genera" su Premessa → appare testo mock, versione salvata.
- `soggetto-flow.spec.ts` `[OHW-SOG-003]` — scrivi oltre 3.600 parole → banner soft warning visibile e dismissibile.
- `soggetto-export.spec.ts` `[OHW-SOG-004]` — click "Export" → modal con PDF/DOCX radio → download file.
- `soggetto-export.spec.ts` `[OHW-SOG-005]` — click "Export SIAE" → modal form con autori + CF → submit → download PDF, verifica header HTTP `content-type: application/pdf`.

## Acceptance criteria

| ID          | Criterio                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- |
| OHW-SOG-010 | `DocumentTypes.SOGGETTO` aggiunto, `DOCUMENT_PIPELINE` esportata, tutte le UI ordinano da lì        |
| OHW-SOG-011 | `/projects/:id/soggetto` route esiste, combina logline + editor soggetto                            |
| OHW-SOG-012 | Editor pre-populato con template 5 heading alla creazione                                           |
| OHW-SOG-013 | Marker cartelle visibile ogni 1.800 char                                                            |
| OHW-SOG-014 | Footer live mostra `X,Y cartelle · pag. N di M · W parole`                                          |
| OHW-SOG-015 | Soft warning sopra 3.600 parole, dismissibile, non-bloccante                                        |
| OHW-SOG-016 | Bottone `✨ genera` a ogni heading, inserisce testo sotto l'heading, richiede conferma se non vuoto |
| OHW-SOG-017 | Cesare-gen rispetta rate limit 30s per `project × section`                                          |
| OHW-SOG-018 | MOCK_AI=true restituisce sezioni deterministiche                                                    |
| OHW-SOG-019 | Export PDF/DOCX funziona da `ExportPdfModal` esteso                                                 |
| OHW-SOG-020 | Export SIAE modal chiede autori + CF opzionale + durata + data + note                               |
| OHW-SOG-021 | Export SIAE ritorna PDF con frontespizio italiano + corpo soggetto                                  |
| OHW-SOG-022 | Campi SIAE **non persistiti** — zero scritture DB da quel modal                                     |
| OHW-SOG-023 | Viewer (ruolo) non può editare soggetto né generare con Cesare                                      |
| OHW-SOG-024 | Versioning esistente (Spec 06b) funziona identico su soggetto (save → version)                      |

## Dipendenze prerequisite

- **Spec 04** (Narrative Editor) — invariata, riuso `NarrativeEditor`.
- **Spec 04c** (Export) — estendo con DOCX.
- **Spec 04e** (ProseMirror) — riuso schema narrative + aggiungo plugin marker cartelle.
- **Spec 06b** (Versioning universale) — zero modifiche, già copre il nuovo doc type.
- **Spec 10** (Breakdown) — pattern `checkAndStampRateLimit` riusato.
- **Spec 17** (Cesare) — pattern Haiku + caching + mock riusato.

## Dipendenze nuove da approvare

- `docx` npm (`^9.x`) — per export DOCX. **Da approvare prima dell'install.**

## Design-system prerequisites

Elenco degli atomi/molecole DS coinvolti (regola `feedback-design-system-driven`):

- **[EXISTING DS]** `TextEditor`, `NarrativeEditor`, `Banner`, `Modal`, `Button`, `SaveStatus`, `Tag`, `DataTable`
- **[EXISTING DS]** Radio group (già in `ExportPdfModal`)
- **[NEW DS]** `SubjectFooter` — componente footer con contatori (cartelle · pagine · parole) + colore rosso soft oltre soft limit
- **[NEW DS]** `CartellaMarker` — divider decorativo `— cartella N —` renderizzato dal plugin ProseMirror
- **[NEW DS]** `AuthorListField` — array field con aggiungi/rimuovi autore, `fullName` + `taxCode` opzionale, usato in `ExportSiaeModal`
- **[NEW DS]** `InlineGenerateButton` — bottone `✨ genera` piccolo, inline a destra di un heading, stato `idle | loading`

## Open questions

Nessuna aperta al momento della stesura.
