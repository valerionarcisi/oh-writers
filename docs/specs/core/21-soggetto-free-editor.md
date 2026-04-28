# Spec 21 — Soggetto Free Editor

**Status:** Draft
**Supersedes (partially):** Spec 04f — Soggetto (sections + per-section AI generation)
**Owner:** Valerio
**Last updated:** 2026-04-28

---

## 1. Goal

Replace the section-based `SubjectEditor` (with `= CARTELLA …` markers and per-section AI generation) with a free-narrative editor. The writer works on the soggetto as a single continuous narrative — like a Word page — without imposed structural sections.

## 2. Non-goals

- **No AI on the soggetto** in this spec. The "controllore garbato" Cesare pattern (ghost suggestions) and any premium "man in the loop" assisted mode are deferred to a future spec.
- **No runtime migration** of existing soggetti. We are pre-production: a reseed + manual cleanup of dev data is acceptable.
- **No changes to the underlying `NarrativeEditor`** (ProseMirror engine). The new component composes it.
- **No changes to other documents** (logline, sinossi, outline, treatment).

## 3. Decisions

| #   | Decision                                                                                    | Rationale                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | Initial template is editorial placeholder text, not semantic markers                        | A blank page intimidates; structured suggestions help. But the user must be free to delete/rewrite without fighting a schema. |
| D2  | New `FreeNarrativeEditor` wrapper component, not direct reuse of `NarrativeEditor`          | The soggetto needs a Word-like page frame and a "cartelle" counter that other documents don't need. Wrapper isolates that UX. |
| D3  | SIAE export becomes form-based at export time, not derived from document structure          | Separates the writer's working document (free) from the deposit document (structured form). Form values persist per-project.  |
| D4  | No runtime migration; reseed dev environments                                               | Pre-production, no real users. A migrator costs more code than the problem warrants.                                          |
| D5  | Cartelle counter is character-based (`ceil(chars / 1800)`, min 1)                           | Italian industry standard. Simple pure function, easy to test.                                                                |
| D6  | SIAE metadata stored as a JSON column on `projects` (`siae_metadata`), not a separate table | 1:1 with project, no join needed, schema flexible for future SIAE field changes.                                              |

## 4. Architecture

### 4.1 New / changed files

```
apps/web/app/features/documents/
├── components/
│   ├── FreeNarrativeEditor.tsx           [NEW] wrapper over NarrativeEditor
│   └── FreeNarrativeEditor.module.css    [NEW] page frame, cartelle counter
├── lib/
│   └── cartelle-counter.ts               [NEW] pure: charCount → cartelle
├── hooks/
│   ├── useSiaeMetadata.ts                [NEW] read/save siae_metadata
│   └── useExportSubjectSiae.ts           [REFACTOR] takes form payload
└── server/
    ├── subject-export-siae.server.ts     [REFACTOR] no more subject-headings
    └── subject-siae-metadata.server.ts   [NEW] CRUD for siae_metadata
```

### 4.2 Files to delete (after route swap)

- `apps/web/app/features/documents/components/SubjectEditor.tsx` + `.module.css`
- `apps/web/app/features/documents/hooks/useGenerateSubjectSection.ts`
- `apps/web/app/features/documents/lib/cartella-marker-plugin.ts` + test
- `apps/web/app/features/documents/lib/subject-insert.ts` + test
- `apps/web/app/features/documents/lib/subject-headings.ts` + test
- `apps/web/app/features/documents/server/subject-ai.server.ts` + test (only `generateSubjectSection`; verify no other consumers)
- `apps/web/app/features/documents/lib/subject-prompt.ts` + test (consumed only by `subject-ai.server.ts`)
- Exports of the above in `apps/web/app/features/documents/index.ts`
- `SubjectSection` type and the `sections.ts` module in `packages/domain/src/subject/` (verify no remaining consumer; the SIAE export is the last known one and gets refactored in step 3).
- `SOGGETTO_INITIAL_TEMPLATE` is **not** deleted: the constant name and export path are reused, only the value changes (see 4.4). Anything that imports the constant (seed, route) keeps compiling.

### 4.3 `FreeNarrativeEditor` component

```ts
interface FreeNarrativeEditorProps {
  readonly content: string;
  readonly onChange: (next: string) => void;
  readonly canEdit: boolean;
  readonly initialTemplate: string;
  readonly testId?: string;
}
```

Behaviour:

- Mounts `NarrativeEditor` internally — does not duplicate ProseMirror logic.
- If `content === ""`, the editor opens with `initialTemplate` as plain editable text (it becomes part of the document on first save).
- Adds a CSS "page frame" (white page, side margins, drop shadow) around the editor surface.
- Renders a cartelle counter pinned to the bottom-right of the page frame: `N cartelle · M caratteri`.
- Reuses the toolbar exposed by `NarrativeEditor`. No custom toolbar.

### 4.4 Initial template (placeholder editoriale)

`packages/domain/src/subject/template.ts` exports `SOGGETTO_INITIAL_TEMPLATE` (name reused, value replaced). New value is plain narrative prose — no `= CARTELLA …` markers, no semantic structure. Suggested content:

> Scrivi qui il tuo soggetto. Inizia dalla situazione di partenza: chi è il protagonista, in che mondo vive, qual è la sua mancanza o desiderio. Poi racconta cosa cambia.
>
> Non ci sono regole di formato. Usa i titoli (H1) se vuoi dividere il testo, oppure scrivi tutto di seguito.

The user can delete it entirely on first edit.

### 4.5 Cartelle counter

`apps/web/app/features/documents/lib/cartelle-counter.ts`:

```ts
export const CARTELLA_CHARS = 1800;

export const toCartelle = (charCount: number): number =>
  charCount <= 0 ? 0 : Math.max(1, Math.ceil(charCount / CARTELLA_CHARS));
```

Char count ignores ProseMirror markup — counts only visible text. Implementation detail: walk the editor's text nodes, sum `textContent.length`. Memoised inside `FreeNarrativeEditor`.

### 4.6 SIAE export — form-based flow

1. User clicks "Esporta SIAE" → opens `ExportSiaeModal` (existing component, extended).
2. Modal calls `useSiaeMetadata(projectId)` to pre-fill fields. Empty fields on first use (not an error).
3. Modal collects: `title`, `declaredGenre`, `ownerFullName`, `synopsisShort` (max 500 chars), `subjectExtended` (free text). Validated by Zod.
4. Submit:
   - Saves form values via `useSaveSiaeMetadata(projectId, fields)` (idempotent upsert).
   - Calls `useExportSubjectSiae(projectId)` — server function reads `siae_metadata` and produces the DOCX.
5. Subsequent opens of the modal re-populate from saved metadata.

### 4.7 Database

New column on `projects`:

```sql
ALTER TABLE projects ADD COLUMN siae_metadata jsonb;
```

Drizzle schema in `packages/db/schema/projects.ts` adds `siaeMetadata: jsonb('siae_metadata')`. Zod schema in `packages/domain/src/projects/siae.ts`:

```ts
export const SiaeMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  declaredGenre: z.string().min(1).max(100),
  ownerFullName: z.string().min(1).max(200),
  synopsisShort: z.string().min(1).max(500),
  subjectExtended: z.string().min(1),
});
export type SiaeMetadata = z.infer<typeof SiaeMetadataSchema>;
```

Migration: `pnpm db:migrate:create add_projects_siae_metadata`.

## 5. Data flow

**Open `/projects/$id/soggetto`:**

1. `useDocument(id, SOGGETTO)` loads the document (unchanged).
2. Route renders `<FreeNarrativeEditor content={…} initialTemplate={SOGGETTO_INITIAL_TEMPLATE} … />`.
3. `useAutoSave` on `content` (unchanged).

**Cartelle counter:** derived from current editor text, memoised. Updates live as the user types.

**SIAE export:** see 4.6.

**Migration:** none at runtime. `pnpm db:reset && pnpm db:seed` resets dev data with the new template.

## 6. Error handling

No new error paths in `FreeNarrativeEditor` — it is UI over `NarrativeEditor`.

New typed errors (neverthrow, `_tag`-discriminated, plain value objects):

- `SiaeMetadataNotFoundError` — first access; modal opens with empty fields. Not surfaced as an error to the user.
- `SiaeMetadataValidationError` — Zod failure on form submit. Surfaced inline in the modal.
- `DbError` — reused from `packages/utils`.

All server functions return `ResultShape<…>` and are unwrapped on the client via `unwrapResult`.

## 7. Testing

### 7.1 Vitest (unit)

- `cartelle-counter.test.ts`: 0, 1, 1799, 1800, 1801, 18000, negative input.
- `siae.schema.test.ts`: required fields, length limits, happy path.

### 7.2 Playwright (E2E)

Rewrite `tests/soggetto/soggetto-flow.spec.ts`:

- Open empty soggetto → editorial template is visible and editable.
- Type text → cartelle counter increments correctly.
- Reload page → content persists (autosave).
- Export DOCX → file downloads (existing behaviour preserved).
- Export SIAE → modal opens → fill fields → submit → file downloads.
- Reopen SIAE modal → fields are pre-populated from saved metadata.

### 7.3 Tests to delete (with the code)

- `apps/web/app/features/documents/lib/subject-insert.test.ts`
- `apps/web/app/features/documents/lib/subject-headings.test.ts`
- `apps/web/app/features/documents/lib/cartella-marker-plugin.test.ts`
- `apps/web/app/features/documents/server/subject-ai.server.test.ts`
- `apps/web/app/features/documents/lib/subject-prompt.test.ts`
- Any reference to `SubjectSection` / old `SOGGETTO_INITIAL_TEMPLATE` in `packages/domain/src/subject/sections.test.ts` and `template.test.ts` (rewrite or delete those test files).

## 8. Design system prerequisites

- `[EXISTING DS]` page frame styling — reuse existing surface tokens (`--color-surface`, `--shadow-md`, `--radius-md`).
- `[EXISTING DS]` modal — `ExportSiaeModal` already exists.
- `[EXISTING DS]` form fields — text input, textarea, label.
- `[NEW DS]` none. Cartelle counter is a small inline label, no new atom needed.

## 9. Implementation order

1. Add `siae_metadata` column + migration + Zod schema.
2. Implement `subject-siae-metadata.server.ts` (CRUD) and `useSiaeMetadata` / `useSaveSiaeMetadata` hooks.
3. Refactor `subject-export-siae.server.ts` to read from `siae_metadata` instead of parsing the document. Update `useExportSubjectSiae`.
4. Extend `ExportSiaeModal` with the new fields and prefill.
5. Update `SOGGETTO_INITIAL_TEMPLATE` to the new free template.
6. Implement `cartelle-counter.ts` + tests.
7. Implement `FreeNarrativeEditor` + styles.
8. Update `_app.projects.$id_.soggetto.tsx` route to render `FreeNarrativeEditor` instead of `SubjectEditor`.
9. Update `packages/db/src/seed/index.ts` to use the new template.
10. Rewrite `tests/soggetto/soggetto-flow.spec.ts`.
11. Run typecheck + unit + E2E. All green.
12. Delete dead code (Section 4.2) and remove exports from `index.ts`.
13. Add a note at the top of `docs/specs/core/04f-soggetto.md` pointing to this spec; the section template and per-section "Genera" no longer apply.
14. Commit.

Each step is its own commit (`[OHW] feat:` / `refactor:` / `test:` as appropriate). The deletion commit message: `[OHW] refactor: remove section-based SubjectEditor (post Spec 21)`.

## 10. Open questions

None at spec time. Any ambiguity discovered during implementation must be flagged and the spec updated before proceeding (per CLAUDE.md "never silently diverge from a spec").

## 11. Future work (out of scope)

- AI assistance on the soggetto: Cesare ghost suggestions inline, or a premium "man in the loop" assisted mode. Separate spec.
- Live collaboration on the soggetto (Yjs) — currently single-author. Separate spec when the need arises.
- Cartelle counter in the toolbar of other narrative documents, if useful.
