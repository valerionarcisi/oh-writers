# Spec 05c — PDF Import

## Context

Writers have existing screenplays in PDF format (Final Draft, Fade In, Highland, Movie Magic). This spec adds the ability to import a PDF into the editor as structured screenplay content (Fountain → ProseMirror doc), making it editable immediately.

Spec 05 and 05b must be complete before this. PDF **export** is Spec 08 (separate, uses the same `afterwriting` library — see [project-pdf-library memory](../../MEMORY.md)).

---

## User Story

As a writer, I want to import an existing screenplay PDF into the editor so I can continue working on it in Oh Writers without retyping everything — even when the PDF is a shooting script with scene numbers, revision asterisks and production annotations.

---

## Behaviour

### Entry point

An **Import PDF** button in the screenplay toolbar (next to Export PDF). Clicking opens the system file picker filtered to `.pdf`.

### Flow

1. User clicks "Import PDF" → file picker opens
2. User selects a `.pdf` file
3. File is sent to the `importPdf` server function as multipart
4. Server extracts text (`pdf-parse`), cleans it, classifies it, returns a Fountain string
5. If the current screenplay has existing content → confirmation dialog: _"Replace current screenplay with imported content?"_
6. On confirm → Fountain is parsed into a ProseMirror doc via existing `fountainToDoc`, editor content is replaced, `pm_doc` saved
7. On cancel → nothing changes

Importing into an **empty** screenplay skips step 5.

---

## Parser architecture — multi-pass

The existing single-pass regex classifier in `fountain-from-pdf.ts` is insufficient for shooting scripts. Replace it with three sequential passes over the raw line array:

### Pass 1 — Cleanup (line-level)

Drop or rewrite noise lines before any classification is attempted.

| Input pattern                                                                                    | Action          |
| ------------------------------------------------------------------------------------------------ | --------------- |
| Title/production header: `… Buff Revised Pages … <date>`                                         | Drop            |
| Bare page number: `^\s*\d+\.?\s*$`                                                               | Drop            |
| Revision asterisks at EOL: trailing `\s*\*+\s*$`                                                 | Strip from line |
| Scene number columns: leading `^\s*\d+[A-Z]?\s+` / trailing `\s+\d+[A-Z]?\s*$` around a slugline | Strip           |
| Date annotations in sluglines: `\s*\([A-Z]+ '?\d{2,4}\)\s*$`                                     | Strip           |
| Standalone `*`, `* 42`, `*46A` fragments                                                         | Drop            |

### Pass 2 — Classify (line-level)

Each surviving line gets exactly one type. Order matters — first match wins.

| Order | Rule                                                                                                       | Type            |
| ----- | ---------------------------------------------------------------------------------------------------------- | --------------- |
| 1     | `^(INT\.?\|EST\.?\|EXT\.?\|INT\.?/EXT\.?\|I\.?/E\.?\|INSERT)\b` (case-insens.)                             | `scene_heading` |
| 2     | ALL-CAPS line ending with `TO:`, or `FADE IN:`, `FADE OUT.`, `FADE TO BLACK.`                              | `transition`    |
| 3     | `^\(.*\)$`                                                                                                 | `parenthetical` |
| 4     | ALL-CAPS (letters/digits/spaces/`#`/`(`/`)`/`.`/`'`) preceded by blank, no trailing punctuation except `)` | `character`     |
| 5     | Default                                                                                                    | `action`        |

Special case: `SCENES N – M OMITTED` → kept as `action` (writer intent signal, not dropped).

### Pass 3 — Group (multi-line)

Walk the classified lines and emit Fountain blocks:

- Consecutive `action` lines → a single action block with newlines preserved
- `character` followed by zero or more `parenthetical` + `dialogue` lines → grouped into one dialogue block (6-space character indent, 10-space dialogue/paren indent)
- Blank lines between blocks are preserved as separators

Character text is emitted **verbatim** — `JORDAN (V.O.) (CONT'D)` stays as one string. The `character` node in `schema.ts` is plain text with no sub-slots; the parser must not split name from extension.

---

## Test fixtures

Two layers — unit and E2E.

### Unit (Vitest) — `tests/fixtures/screenplays/*.txt`

Pure-text inputs for `fountainFromPdf` (the conversion function that takes `pdf-parse` output and returns Fountain). Each file targets one concern:

| File                          | Covers                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `01-minimal.txt`              | Smoke: 1 scene + 1 character + 1 dialogue                             |
| `02-first-draft-clean.txt`    | Final Draft export, no revisions                                      |
| `03-shooting-script.txt`      | Wolf-style: scene numbers, OMITTED, INSERT PHOTO, asterisks, Buff hdr |
| `04-italian-short.txt`        | INT./EST., accented characters, Italian cues                          |
| `05-character-extensions.txt` | V.O., V.O. CONT'D, O.S., (CONT'D)                                     |
| `06-wolf-page-1.txt`          | Real Wolf page 1 raw extract — regression fixture                     |
| `07-transitions.txt`          | CUT TO:, FADE IN/OUT, SMASH CUT, DISSOLVE, MATCH CUT                  |
| `08-continueds.txt`           | `(MORE)` / `(CONT'D)` page-break artefacts                            |

### E2E (Playwright) — `tests/fixtures/*.pdf`

| File                                         | Role                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `tests/fixtures/the-wolf-of-wall-street.pdf` | Worst-case shooting script                                                                     |
| `tests/fixtures/screenplays/clean-short.pdf` | Happy path — generated from `clean-short.fountain` via `pnpm test:fixtures:pdf` (afterwriting) |

`scripts/generate-test-pdfs.ts` regenerates PDFs from `.fountain` sources when stale. Keeps fixture generation on the same renderer that Spec 08 will use for export.

---

## Error handling

| Error                                 | User-facing message                                                    |
| ------------------------------------- | ---------------------------------------------------------------------- |
| File is not a valid PDF               | "This file doesn't appear to be a valid PDF."                          |
| PDF is encrypted/password-protected   | "This PDF is password-protected and cannot be imported."               |
| Text extraction produces empty result | "No text could be extracted from this PDF. It may be a scanned image." |
| File too large (> 10 MB)              | "PDF must be under 10 MB."                                             |

---

## New dependency

**`pdf-parse@1.1.1`** — server-side text extraction, no native modules.
**`afterwriting@1.17.3`** — **already added** as devDep for test fixture PDF generation. Will be promoted to runtime dep in Spec 08 for PDF export.

Pin both to the versions above. `pdf-parse` requires user approval before adding.

---

## Routes / Files

### Create

| File                                                                        | Purpose                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `features/screenplay-editor/server/pdf-import.server.ts`                    | Server function                                         |
| `features/screenplay-editor/lib/fountain-from-pdf.ts` (rewrite)             | Pure 3-pass converter: raw PDF text → Fountain string   |
| `features/screenplay-editor/lib/fountain-from-pdf.test.ts`                  | Vitest — runs each `.txt` fixture through the converter |
| `features/screenplay-editor/components/ImportPdfButton.tsx` + `.module.css` | File picker trigger + confirmation dialog               |
| `features/screenplay-editor/pdf-import.errors.ts`                           | Typed errors (plain value pattern)                      |

### Modify

| File                                                          | Change                                          |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `features/screenplay-editor/components/ScreenplayToolbar.tsx` | Add `<ImportPdfButton>` next to the Export slot |
| `features/screenplay-editor/components/ScreenplayEditor.tsx`  | Pass `onImport(fountain)` handler to toolbar    |
| `features/screenplay-editor/index.ts`                         | Export new public surface                       |

---

## Server function shape

```typescript
export const importPdf = createServerFn({ method: "POST" }).handler(
  async ({ request }): Promise<ResultShape<string, ImportPdfError>> => {
    await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return toShape(err(new InvalidPdfError("No file provided")));
    if (file.size > 10 * 1024 * 1024)
      return toShape(err(new FileTooLargeError()));
    // pdf-parse → fountainFromPdf → ok(fountain)
  },
);
```

---

## Error classes (`pdf-import.errors.ts`)

Plain value pattern — `_tag`, `message`, no `extends Error` (JSON-safe).

```typescript
export class InvalidPdfError    { readonly _tag = 'InvalidPdfError'    as const; ... }
export class EncryptedPdfError  { readonly _tag = 'EncryptedPdfError'  as const; ... }
export class EmptyPdfError      { readonly _tag = 'EmptyPdfError'      as const; ... }
export class FileTooLargeError  { readonly _tag = 'FileTooLargeError'  as const; ... }
export type ImportPdfError = InvalidPdfError | EncryptedPdfError | EmptyPdfError | FileTooLargeError
```

---

## Tests

### Vitest — `fountain-from-pdf.test.ts`

One `describe` per fixture. Each test reads the `.txt`, runs `fountainFromPdf`, snapshots the Fountain output, and asserts specific invariants (no `Buff Revised Pages`, no bare page numbers, character cues preserved verbatim, etc.).

### Playwright — `tests/editor/pdf-import.spec.ts`

26 tags OHW-070 … OHW-095 (already stubbed as `test.todo()`). Un-stub as each UI piece lands. Highlights:

| Tag     | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| OHW-070 | Import PDF button visible in toolbar                               |
| OHW-073 | Non-empty screenplay shows replace-content confirmation            |
| OHW-075 | Scene headings — scene numbers + `(FEB '95)` date stripped         |
| OHW-078 | Compound `JORDAN (V.O.) (CONT'D)` stays as single character node   |
| OHW-083 | `58A   CUT TO:   58A` → transition with scene numbers stripped     |
| OHW-085 | `Buff Revised Pages` header stripped (**already implemented**)     |
| OHW-086 | Bare page numbers stripped                                         |
| OHW-087 | Revision asterisks stripped                                        |
| OHW-088 | `SCENES 42 – 46 OMITTED` preserved as action                       |
| OHW-089 | `INSERT ID PHOTO – TOBY WELCH` → scene_heading                     |
| OHW-090 | Editing an imported scene heading keeps it typed as scene_heading  |
| OHW-091 | Alt+c shortcut works on imported content identically to hand-typed |
| OHW-093 | > 10 MB → error                                                    |
| OHW-094 | Encrypted PDF → error                                              |
| OHW-095 | Non-PDF file → error                                               |

---

## Mock mode

`MOCK_AI=true` has no effect here (no AI calls). For UI-only development, a `MOCK_PDF_IMPORT=true` env flag makes the server function return a fixed Fountain string bypassing `pdf-parse`.

---

## Scope — not in this spec

- PDF **export** → Spec 08 (will reuse `afterwriting`)
- Image/scanned PDF OCR (Tesseract) → future
- Preserving Final Draft XML metadata embedded in PDF → future
- Title-page import → future (first pass drops it; writer re-types in project settings)
