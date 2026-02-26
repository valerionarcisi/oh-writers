# Spec 05c — PDF Import

## Context

Writers have existing screenplays in PDF format (exported from Final Draft, Fade In, Highland, etc.). This spec adds the ability to import a PDF into the editor as Fountain-formatted text, making it editable immediately.

Spec 05 and 05b must be complete before this spec. PDF export is Spec 08 (separate).

---

## User Story

As a writer, I want to import an existing screenplay PDF into the editor so I can continue working on it in Oh Writers without retyping everything.

---

## Behaviour

### Entry point

An **Import PDF** button in the screenplay toolbar (next to Export PDF). Clicking opens the system file picker filtered to `.pdf`.

### Flow

1. User clicks "Import PDF" → file picker opens
2. User selects a `.pdf` file
3. File is sent to a server function
4. Server extracts text and converts it to Fountain format (with 6-space character indent, 10-space dialogue indent matching the editor's conventions)
5. If the current screenplay has existing content → show a confirmation dialog: "Replace current screenplay with imported content?"
6. On confirm → editor content is replaced and saved immediately
7. On cancel → nothing changes

### Extraction heuristics (server-side)

Standard screenplay PDFs use consistent formatting that can be detected by text patterns:

| Pattern                                                         | Detected as                       |
| --------------------------------------------------------------- | --------------------------------- | ---------------- | ------------------------- |
| Line matches `/^(INT\.                                          | EXT\.                             | INT\.\/EXT\.)/i` | Scene heading (no indent) |
| ALL CAPS line, preceded by blank line, no trailing punctuation  | CHARACTER cue (→ 6-space indent)  |
| Line matches `/^\(.*\)$/` following a character cue or dialogue | Parenthetical (→ 10-space indent) |
| Line following a character cue (not parenthetical, not blank)   | Dialogue (→ 10-space indent)      |
| Line matches ALL CAPS ending with `TO:`, `IN.`, `OUT.`          | Transition (no indent)            |
| Everything else                                                 | Action (no indent)                |

The output is plain text using the Oh Writers Fountain conventions:

```
INT. COFFEE SHOP - DAY

She walks in.

      ANNA
          (quietly)
          We need to talk.
```

### Error handling

| Error                                 | User-facing message                                                    |
| ------------------------------------- | ---------------------------------------------------------------------- |
| File is not a valid PDF               | "This file doesn't appear to be a valid PDF."                          |
| PDF is encrypted/password-protected   | "This PDF is password-protected and cannot be imported."               |
| Text extraction produces empty result | "No text could be extracted from this PDF. It may be a scanned image." |
| File too large (> 10 MB)              | "PDF must be under 10 MB."                                             |

---

## New Dependency

**`pdf-parse@1.1.1`** — lightweight server-side PDF text extraction (no native modules, works in Node).

Must be pinned to `1.1.1`. Added to `apps/web/package.json`. **Requires user approval before adding.**

---

## Routes / Files

### Create

| File                                                                        | Purpose                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| `features/screenplay-editor/server/pdf-import.server.ts`                    | Server function for PDF import                  |
| `features/screenplay-editor/lib/fountain-from-pdf.ts`                       | Pure conversion: raw PDF text → Fountain string |
| `features/screenplay-editor/components/ImportPdfButton.tsx` + `.module.css` | File picker trigger + confirmation dialog       |

### Modify

| File                                                          | Change                                             |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `features/screenplay-editor/components/ScreenplayToolbar.tsx` | Add `<ImportPdfButton>` between Versions and Focus |
| `features/screenplay-editor/components/ScreenplayEditor.tsx`  | Pass `onImport` handler to toolbar                 |
| `features/screenplay-editor/index.ts`                         | Export new components and helpers                  |

---

## Server Function

```typescript
// POST — accepts a PDF file as FormData, returns extracted Fountain text
export const importPdf = createServerFn({ method: "POST" }).handler(
  async ({ request }): Promise<ResultShape<string, ImportPdfError>> => {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return toShape(err(new InvalidPdfError("No file provided")));
    if (file.size > 10 * 1024 * 1024)
      return toShape(err(new FileTooLargeError()));
    const buffer = Buffer.from(await file.arrayBuffer());
    // extract text with pdf-parse
    // convert to Fountain
    // return
  },
);
```

---

## Error Classes (`pdf-import.errors.ts`)

Plain value pattern (same as other features):

```typescript
export class InvalidPdfError    { readonly _tag = 'InvalidPdfError'    as const ... }
export class EncryptedPdfError  { readonly _tag = 'EncryptedPdfError'  as const ... }
export class EmptyPdfError      { readonly _tag = 'EmptyPdfError'      as const ... }
export class FileTooLargeError  { readonly _tag = 'FileTooLargeError'  as const ... }
export type ImportPdfError = InvalidPdfError | EncryptedPdfError | EmptyPdfError | FileTooLargeError
```

---

## Mock Mode

In mock mode (`MOCK_API=true`), the server function returns a fixed Fountain sample instead of parsing a PDF. This allows UI testing without a real file.

---

## Tests

File: `tests/screenplay/pdf-import.spec.ts`

| Tag     | Description                                                                                |
| ------- | ------------------------------------------------------------------------------------------ |
| OHW-066 | Import PDF button is visible in toolbar                                                    |
| OHW-067 | Importing a valid PDF (mock mode) replaces editor content                                  |
| OHW-068 | Cancelling the confirmation dialog keeps existing content unchanged                        |
| OHW-069 | `fountainFromPdf` correctly identifies CHARACTER, DIALOGUE, SCENE HEADING from sample text |

---

## Scope — Not In This Spec

- PDF export → Spec 08
- Image-based/scanned PDF OCR → future (requires Tesseract, out of scope)
- Preserving formatting metadata from Final Draft XML PDFs → future
