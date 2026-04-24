# Spec 04f — Soggetto

Extends **Spec 04** (Narrative Editor) with a new document type: the **soggetto**, the narrative core of the project in the Italian screenwriting tradition.

Generic PDF/Markdown export stays in **04c**. The SIAE-style export defined here is specific to the soggetto.

## Goal

An Italian screenwriter opens their project, writes the **soggetto** (2–5 "cartelle" of structured narrative prose with 5 suggested headings), Cesare helps generate it section by section, and the author can export it either as a clean document (PDF/DOCX) or as a SIAE-ready PDF by filling in a modal with authors, genre, duration.

The soggetto is the **second step** of the document pipeline, right after the logline. The soggetto screen unifies logline and narrative body on the same route because they are iterated together.

Note: the user-facing term is `Soggetto` (kept in Italian as the industry-standard name); all specs, code, identifiers and comments are in English. UI copy is localized (IT/EN).

## Document pipeline — new order

| Order | Type        | Notes                                                                                           |
| ----- | ----------- | ----------------------------------------------------------------------------------------------- |
| 1     | `logline`   | Stored as `DocumentTypes.LOGLINE` versioned document (max 500 chars). Co-edited in `/soggetto`. |
| 2     | `soggetto`  | **New.** 2–5 cartelle, prose with Markdown headings.                                            |
| 3     | `synopsis`  | Unchanged. Useful for pressbook and short pitch.                                                |
| 4     | `outline`   | Unchanged.                                                                                      |
| 5     | `treatment` | Unchanged.                                                                                      |

The order is made **explicit** via an exported constant `DOCUMENT_PIPELINE` in `packages/domain/src/constants.ts`. All UIs (dashboard, sidebar, wizard) read from there — zero hardcoding of the order anywhere else.

## Out of scope (explicit)

- **Persistence of SIAE fields** (authors, registry, deposit date) in the DB. Only modal input → PDF render → download. When a real deposit integration arrives, it gets its own spec.
- **SIAE export in languages other than Italian.** Italian-only.
- **Cesare "generate the whole soggetto in one shot"** — section-by-section only, consistent with the "polite controller" pattern.
- **Automatic logline↔synopsis sync.** Synopsis remains an independent document.
- **Hard cap** on length. Only a soft warning above 2 cartelle / ~3,600 words.
- **Rich text** — pure Markdown prose, same pattern as synopsis/treatment.
- **New DB tables.** Reuse existing `documents` + `document_versions`.

## Data model

### DocumentType enum

Add to `packages/domain/src/constants.ts`:

```ts
export const DocumentTypes = {
  LOGLINE: "logline",
  SOGGETTO: "soggetto", // ← new
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

`DocumentTypeSchema` in `versions.schema.ts` and in `project.schema.ts`: add `DocumentTypes.SOGGETTO` to the respective `z.enum`.

### DB schema

**No migration needed if** the `documents.type` column is `text`. To be verified at plan start with `\d documents` — if it is a `CREATE TYPE document_type AS ENUM`, a migration `ALTER TYPE document_type ADD VALUE 'soggetto'` is required.

Existing constraint `UNIQUE (project_id, type)` already enforces "one soggetto per project".

### Length constants

New module `packages/domain/src/subject/length.ts`:

```ts
export const CHARS_PER_CARTELLA = 1800;
export const WORDS_PER_PAGE = 250;
export const SOGGETTO_SOFT_WARNING_WORDS = 3600;

export interface SubjectLength {
  readonly cartelle: number;   // 1 decimal, e.g. 2.3
  readonly pages: number;      // 1 decimal
  readonly words: number;
  readonly chars: number;
  readonly isOverSoftLimit: boolean;
}

export const analyzeSubjectLength = (text: string): SubjectLength => { ... };
```

Pure function, Vitest-covered.

### Initial template

Constant `SOGGETTO_INITIAL_TEMPLATE` in `packages/domain/src/subject/template.ts`:

```markdown
## Premise

## Protagonist & antagonist

## Narrative arc

## World

## Ending
```

Used on creation of the first soggetto version when `content === ""`. UI renders the localized Italian labels (`Premessa`, `Protagonista & antagonista`, `Arco narrativo`, `Mondo`, `Finale`) via i18n; the canonical section keys are English.

## Route & UI

### New route

`apps/web/app/routes/projects/$projectId/soggetto.tsx`.

### Layout

```
┌─────────────────────────────────────────────┐
│  ← Project: Title                           │
├─────────────────────────────────────────────┤
│  LOGLINE               [✨ extract]         │
│  ┌───────────────────────────────────────┐  │
│  │ <textarea max 500 chars>             │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  SOGGETTO       [↓ export] [↓ export SIAE] │
│  ┌───────────────────────────────────────┐  │
│  │ ## Premise             [✨ generate]  │  │
│  │ ...                                   │  │
│  │ ─── cartella 2 ───                    │  │
│  │ ## Protagonist...      [✨ generate]  │  │
│  │ ...                                   │  │
│  └───────────────────────────────────────┘  │
│  2.3 cartelle · page 3 of 5 · 680 words    │
└─────────────────────────────────────────────┘
```

### Editor

**Reuse the existing `NarrativeEditor`** (ProseMirror — see Spec 04e). No new library.

Minimal extensions:

1. **Cartella marker plugin**: decoration that inserts a widget `<div class="cartellaMarker">— cartella N —</div>` every `CHARS_PER_CARTELLA` chars from the start of the doc. Decorative, not persisted.
2. **Heading → ✨ button**: every `heading` node (level 2) in a soggetto shows an inline "✨ generate" button on the right. Implemented as a ProseMirror NodeView or as a React overlay positioned via `coordsAtPos`. The button calls `generateSubjectSection`, passing the heading's canonical section key.
3. **Footer counter**: component `<SubjectFooter subject={content} />` below the editor, recomputes `analyzeSubjectLength` on change. Shows `{cartelle} cartelle · page X of Y · N words`. If `isOverSoftLimit` → non-blocking warning banner ("You are entering treatment territory…"), dismissible.

### Logline field

Above the editor, the `LoglineBlock` component (max 500). Persisted as a `DocumentTypes.LOGLINE` document via `useSaveDocument` — same pipeline as the standalone `/logline` route. The soggetto route auto-saves both documents with the shared `useAutoSave` hook.

Button **✨ extract** next to the label: calls `generateLoglineFromSubject`, opens a popover with the suggestion; accept → overwrite the field, reject → close.

### Navigation

- **Project dashboard**: "Soggetto" card between Logline and Synopsis. State: `updatedAt` of the latest version, or placeholder "No soggetto yet".
- **Project sidebar**: new "Soggetto" link.
- Everything ordered via `DOCUMENT_PIPELINE`.

## Cesare integration

### Server functions

New file `apps/web/app/features/documents/server/subject-ai.server.ts`.

#### `generateSubjectSection`

```ts
export const generateSubjectSection = createServerFn({ method: "POST" })
  .validator(z.object({
    projectId: z.string().uuid(),
    section: z.enum([
      "premise", "protagonist", "arc", "world", "ending",
    ]),
  }))
  .handler(async ({ data }) => { ... });
```

**Output**: `ResultShape<{ text: string }, ...>`.

**Logic**:

1. `requireUser` + `canEditProject` (reuse existing permissions).
2. Load `project` (title, genre, format, logline) and the current soggetto (if any) to pass other sections as context.
3. Rate limit: `checkAndStampRateLimit(db, projectId, 'subject:${section}', 30_000)`.
4. Mock: `process.env.MOCK_AI === "true"` → `mockSubjectSection(section, genre)`.
5. Real: Claude **Haiku-4.5**, system prompt + few-shot in ephemeral cache (Cesare pattern). Prompt asks for Italian, narrative tone, 200–400 words per section, no meta-commentary.
6. Returns plain text. The client decides where to insert it (under the corresponding heading, replacing any existing section body after confirmation).

#### `generateLoglineFromSubject`

```ts
export const generateLoglineFromSubject = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(async ({ data }) => { ... });
```

**Output**: `ResultShape<{ logline: string }, ...>` where `logline.length <= 500`.

Haiku, reads the current soggetto, extracts a logline in ≤ 500 chars. Rate limit `'subject:logline-extract'` 30s.

### Mock AI

`apps/web/app/mocks/ai-responses.ts` — add:

```ts
export const mockSubjectSection = (
  section: "premise" | "protagonist" | "arc" | "world" | "ending",
  genre: Genre | null,
): string => { ... }
```

Returns 3–4 deterministic sentences per `section × genre` pair. Separate test in `ai-responses.test.ts`.

### Prompt (Claude Haiku)

Located in `features/documents/lib/subject-prompt.ts`. System prompt + 2 few-shot examples (one drama, one thriller). Prompt content is Italian because user-facing output is Italian; prompt file identifiers and comments are English. No tool use: free-form output, extracted via `response.content[0].text`.

## Export

Two flows, two buttons in the soggetto toolbar.

### Normal export (PDF + DOCX)

**Reuse/extend existing `ExportPdfModal`**. Add a radio:

- `○ PDF`
- `○ DOCX` (new)

**DOCX**: npm lib `docx@^9.x` (**requires user approval before install**). Server fn `exportSubjectDocx({ projectId })` → `ResultShape<{ base64: string, filename: string }>`.

**PDF**: reuse the `exportDocumentPdf` pipeline from Spec 04c. Rendering: cover page with title + main author (from project), body with soggetto headings and paragraphs.

Hook `useExportSubject` in `features/documents/hooks/useExportSubject.ts`.

### SIAE export (PDF only, Italian only)

New modal **`ExportSiaeModal`** in `features/documents/components/`.

**Zod form schema** (`SiaeExportInputSchema` in `features/documents/documents.schema.ts`):

```ts
export const SiaeExportInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200), // prefill project.title
  authors: z
    .array(
      z.object({
        fullName: z.string().min(1).max(200),
        taxCode: z.string().max(16).nullable(), // codice fiscale, optional
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
  // 2. load current soggetto
  // 3. render PDF with SIAE cover + soggetto body (fixed Italian copy)
  // 4. return ResultShape<{ base64, filename }>
})
```

**No persistence** of input fields. Only input → render → download.

**Cover layout** (first PDF page, Italian fixed copy):

```
        REPUBBLICA ITALIANA
        SIAE — Sezione OLAF
        SOGGETTO PER OPERA CINEMATOGRAFICA

Titolo:              <title>
Genere dichiarato:   <declaredGenre>
Durata stimata:      <estimatedDurationMinutes> minuti
Data di compilazione: <compilationDate>

Autore/i:
  • <author 1 fullName>  [CF: <taxCode if present>]
  • <author 2 ...>

Logline:
  <project.logline>

──────────────────────────
[Page 2+: soggetto body, headings and paragraphs,
with cartelle numbering in the footer]
```

PDF library: **reuse `afterwriting`** (already in the project for screenplay PDF — verify in Spec 05j). If not a good fit for narrative prose layout, fallback on `pdfkit` (requires approval).

## Schemas (Zod)

All Zod schemas centralized in `features/documents/documents.schema.ts`:

- `SubjectSectionSchema = z.enum(["premise", "protagonist", "arc", "world", "ending"])`
- `GenerateSubjectSectionInputSchema`
- `GenerateLoglineInputSchema`
- `SiaeExportInputSchema` (see above)

## Error handling

Reuse `DbError`, `ForbiddenError`, `NotFoundError` from `packages/utils/src/errors.ts`.

New domain errors in `features/documents/documents.errors.ts`:

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
  readonly message = "Rate limited: try again shortly";
  constructor(readonly retryAfterMs: number) {}
}
```

All server fns return `ResultShape` via `toShape()`. Client: `unwrapResult` + `match` on `_tag`.

## Testing

### Vitest

- `subject/length.test.ts` — `analyzeSubjectLength`: empty, exactly 1 cartella, 2.5 cartelle, above soft limit.
- `subject/template.test.ts` — template contains the 5 expected headings.
- `mocks/ai-responses.test.ts` — `mockSubjectSection` for each of the 5 × (null genre + 2 genres). Deterministic output.
- `documents/documents.schema.test.ts` — `SiaeExportInputSchema`: valid, empty authors → fail, tax code too long → fail.

### Playwright

New dir `tests/soggetto/`:

- `soggetto-flow.spec.ts` `[OHW-SOG-001]` — create project, navigate `/soggetto`, see logline + editor with 5-heading template.
- `soggetto-flow.spec.ts` `[OHW-SOG-002]` — click "✨ generate" on Premise → mock text appears, version saved.
- `soggetto-flow.spec.ts` `[OHW-SOG-003]` — type past 3,600 words → soft-warning banner visible and dismissible.
- `soggetto-export.spec.ts` `[OHW-SOG-004]` — click "Export" → modal with PDF/DOCX radio → file download.
- `soggetto-export.spec.ts` `[OHW-SOG-005]` — click "Export SIAE" → form modal with authors + tax code → submit → PDF download, verify HTTP header `content-type: application/pdf`.

## Acceptance criteria

| ID          | Criterion                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| OHW-SOG-010 | `DocumentTypes.SOGGETTO` added, `DOCUMENT_PIPELINE` exported, all UIs order from it                       |
| OHW-SOG-011 | `/projects/:id/soggetto` route exists, combines logline + soggetto editor                                 |
| OHW-SOG-012 | Editor pre-populated with 5-heading template on creation                                                  |
| OHW-SOG-013 | Cartella marker visible every 1,800 chars                                                                 |
| OHW-SOG-014 | Live footer shows `X.Y cartelle · page N of M · W words`                                                  |
| OHW-SOG-015 | Soft warning above 3,600 words, dismissible, non-blocking                                                 |
| OHW-SOG-016 | `✨ generate` button next to each heading, inserts text below the heading, asks confirmation if non-empty |
| OHW-SOG-017 | Cesare-gen respects 30s rate limit per `project × section`                                                |
| OHW-SOG-018 | MOCK_AI=true returns deterministic sections                                                               |
| OHW-SOG-019 | Export PDF/DOCX works from the extended `ExportPdfModal`                                                  |
| OHW-SOG-020 | SIAE export modal asks authors + optional tax code + duration + date + notes                              |
| OHW-SOG-021 | SIAE export returns a PDF with Italian cover + soggetto body                                              |
| OHW-SOG-022 | SIAE fields are **not persisted** — zero DB writes from that modal                                        |
| OHW-SOG-023 | Viewer role cannot edit the soggetto nor generate with Cesare                                             |
| OHW-SOG-024 | Existing versioning (Spec 06b) works identically on soggetto (save → version)                             |

## Prerequisite dependencies

- **Spec 04** (Narrative Editor) — unchanged, reuse `NarrativeEditor`.
- **Spec 04c** (Export) — extended with DOCX.
- **Spec 04e** (ProseMirror) — reuse narrative schema + add cartella marker plugin.
- **Spec 06b** (Universal versioning) — no changes, already covers the new doc type.
- **Spec 10** (Breakdown) — `checkAndStampRateLimit` pattern reused.
- **Spec 17** (Cesare) — Haiku + caching + mock pattern reused.

## New dependencies to approve

- `docx` npm (`^9.x`) — for DOCX export. **Requires approval before install.**

## Design-system prerequisites

DS atoms/molecules involved (per the `feedback-design-system-driven` rule):

- **[EXISTING DS]** `TextEditor`, `NarrativeEditor`, `Banner`, `Modal`, `Button`, `SaveStatus`, `Tag`, `DataTable`
- **[EXISTING DS]** Radio group (already in `ExportPdfModal`)
- **[NEW DS]** `SubjectFooter` — footer component with counters (cartelle · pages · words) + soft-red color above the soft limit
- **[NEW DS]** `CartellaMarker` — decorative divider `— cartella N —` rendered by the ProseMirror plugin
- **[NEW DS]** `AuthorListField` — array field with add/remove author, `fullName` + optional `taxCode`, used in `ExportSiaeModal`
- **[NEW DS]** `InlineGenerateButton` — small inline `✨ generate` button to the right of a heading, states `idle | loading`

## Open questions

None at the time of writing.
