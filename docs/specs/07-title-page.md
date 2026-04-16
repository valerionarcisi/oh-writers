# Spec 07 — Title Page (Frontespizio)

## Context

Screenplays ship with a title page: central block with title, author, contacts; bottom row with left / center / right footer fields (draft date, revisions, production company). Spec 05c's PDF import currently doesn't touch the title page — this spec makes it first-class:

- **On import**: drop the first page from the extracted text; parse the dropped page into structured title-page fields and store them on the screenplay.
- **In the editor**: a title-page editor opens from the toolbar popover (Spec 06) and lets the writer compose central block + three footer slots.
- **On export** (Spec 08): the renderer uses these fields to produce the first page of the PDF.

This spec covers storage, parsing of the imported first page, and the UI for composing title-page data. Export rendering is Spec 08.

---

## User Story

As a writer, I want a dedicated frontespizio section where I can set title, author, contacts, and footer lines, so that imports carry over the original title page and exports produce a professional first page without me editing the screenplay body.

---

## Behaviour

### Data model

Title page data is stored on the `screenplays` row as a single JSONB column `title_page` with Zod-validated shape:

```ts
TitlePageSchema = z.object({
  centerBlock: z.object({
    title: z.string().max(200).default(""),
    subtitle: z.string().max(200).default(""),
    credit: z.string().max(100).default(""), // "written by", "based on", etc.
    author: z.string().max(200).default(""),
    source: z.string().max(200).default(""), // "based on the novel by…"
    contact: z.string().max(500).default(""), // multi-line free text
  }),
  footer: z.object({
    left: z.string().max(200).default(""),
    center: z.string().max(200).default(""),
    right: z.string().max(200).default(""),
  }),
});
```

Default value is an empty object conforming to the schema (all fields empty strings). Screenplays created before this spec land keep `null` until first save, at which point the default is persisted.

### Import PDF — first-page handling (amends Spec 05c)

In `fountainFromPdf` (Spec 05c), introduce a **Pass 0** that splits off the first logical page:

- Detect the page boundary via the existing page-number / `Buff Revised Pages` heuristics already used by Pass 1
- If the first page contains **no scene heading** (no `INT./EXT./EST.` line), classify it as title page and remove it from the input to Pass 1
- Pass the removed lines through a separate `parseTitlePage` pure function that returns a `TitlePage` best-effort: title (biggest-looking line or line above "written by"), author (line after "written by" / "by"), contacts (block of lines with email/phone regex), footer (bottom-anchored lines, split by horizontal position if available — otherwise `left` = everything, `center`/`right` = empty)
- If the first page **does** contain a scene heading, leave it alone — it is not a title page

`importPdf` server function returns both the Fountain body and the parsed `TitlePage`. The client persists the title page alongside the `pm_doc` update.

### UI — Frontespizio editor

Opens from the toolbar popover "Frontespizio" item (Spec 06 reserves the slot).

A modal / side panel with two sections:

1. **Blocco centrale** — labelled inputs for `title`, `subtitle`, `credit`, `author`, `source`, and a `contact` textarea
2. **Footer** — three inputs side-by-side (`left`, `center`, `right`)

Footer preview renders the three footer inputs in a single row that mirrors their export position. Central block preview stacks the fields with the same spacing `afterwriting` uses (visual approximation, not pixel-perfect).

Save button persists via a `saveTitlePage` server function. Cancel discards. No autosave — explicit save keeps the interaction predictable and avoids racing with the Yjs doc sync.

### Export (hand-off to Spec 08)

Export is out of scope here, but Spec 08 will read `title_page` and hand it to `afterwriting` as Fountain title-page metadata. This spec guarantees the stored shape matches what Spec 08 needs.

---

## Parser — `parseTitlePage(lines: string[]): TitlePage`

Pure function in `features/screenplay-editor/lib/title-page-from-pdf.ts`. Deterministic, no I/O, no regex lookaheads that would make it fragile.

| Heuristic                                                      | Field                          |
| -------------------------------------------------------------- | ------------------------------ | -------------------------- | -------------------- |
| Line immediately above `written by` / `by` / `scritto da`      | `centerBlock.title`            |
| Line matching `^\s\*(written                                   | scritto                        | adapted)\s+by\s\*$` i-case | `centerBlock.credit` |
| Line after the credit line                                     | `centerBlock.author`           |
| `based on …` / `tratto da …`                                   | `centerBlock.source`           |
| Block of lines containing `@`, a phone regex, or "Agent:"      | `centerBlock.contact` (joined) |
| Bottom 3 non-empty lines, split by leading whitespace position | `footer.left/center/right`     |

Anything it can't place is dropped — the writer re-enters it in the UI. The parser never throws; worst case it returns an all-empty `TitlePage`.

---

## Test fixtures

### Unit — `tests/fixtures/title-pages/*.txt`

Raw first-page text extracts, one per file:

| File                          | Covers                                              |
| ----------------------------- | --------------------------------------------------- |
| `01-minimal.txt`              | Title + "written by" + author only                  |
| `02-full-contacts.txt`        | Title, author, agent block with email + phone       |
| `03-based-on.txt`             | `based on the novel by …` source line               |
| `04-footer-three-columns.txt` | Draft date left, production center, revisions right |
| `05-italian.txt`              | `scritto da`, accented characters                   |
| `06-no-title-page.txt`        | First page is already a scene → parser bails out    |

### E2E

Reuse `tests/fixtures/the-wolf-of-wall-street.pdf` (has a title page) and `tests/fixtures/screenplays/clean-short.pdf` (regenerate with a title page block via `afterwriting`).

---

## Error handling

| Situation                                 | Outcome                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| First page has a scene heading            | Not treated as title page; Fountain body unchanged               |
| Parser cannot identify title/author       | Title page saved with whatever fields matched; rest left empty   |
| `saveTitlePage` DB error                  | `DbError` → toast "Impossibile salvare il frontespizio, riprova" |
| Validation error on save (field too long) | Field-level error message in the modal                           |

Error class `TitlePageValidationError` lives in `features/screenplay-editor/title-page.errors.ts`.

---

## Files

### Create

| File                                                                         | Purpose                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `features/screenplay-editor/lib/title-page-from-pdf.ts`                      | Pure `parseTitlePage` + `splitFirstPage` functions |
| `features/screenplay-editor/lib/title-page-from-pdf.test.ts`                 | Vitest — one describe per fixture                  |
| `features/screenplay-editor/title-page.schema.ts`                            | `TitlePageSchema` + inferred type                  |
| `features/screenplay-editor/title-page.errors.ts`                            | Typed errors (plain value pattern)                 |
| `features/screenplay-editor/server/title-page.server.ts`                     | `saveTitlePage` + `getTitlePage` server functions  |
| `features/screenplay-editor/components/TitlePageEditor.tsx` + `.module.css`  | Modal UI                                           |
| `features/screenplay-editor/components/TitlePagePreview.tsx` + `.module.css` | Live preview of central block + footer             |
| `features/screenplay-editor/hooks/useTitlePage.ts`                           | Query + mutation hooks                             |
| `packages/db/schema/screenplays-title-page.migration.sql`                    | Adds `title_page jsonb null` to `screenplays`      |

### Modify

| File                                                     | Change                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/db/schema/screenplays.ts`                      | New `title_page` column                                                  |
| `features/screenplay-editor/lib/fountain-from-pdf.ts`    | New Pass 0 that splits off title page; returns `{ fountain, titlePage }` |
| `features/screenplay-editor/server/pdf-import.server.ts` | Persist `titlePage` alongside the screenplay update                      |
| `features/screenplay-editor/components/ToolbarMenu.tsx`  | Wire "Frontespizio" item to open `TitlePageEditor`                       |
| `features/screenplay-editor/index.ts`                    | Export new public surface                                                |

---

## Server function shape

```ts
export const saveTitlePage = createServerFn({ method: "POST" })
  .validator(
    z.object({ screenplayId: z.string().uuid(), titlePage: TitlePageSchema }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<TitlePage, ForbiddenError | DbError>> => {
      await requireUser();
      // permission check via screenplay → project → team membership
      // update screenplays.title_page
    },
  );
```

---

## Tests

### Vitest — `title-page-from-pdf.test.ts`

One describe per fixture. Assert: correct title, correct author, correct footer slots, and that a file with no title page returns the sentinel "no title page detected" result.

### Playwright — `tests/editor/title-page.spec.ts`

| Tag     | Description                                                                                  |
| ------- | -------------------------------------------------------------------------------------------- |
| OHW-110 | Toolbar popover "Frontespizio" opens the editor modal                                        |
| OHW-111 | Writer can enter title, author, contacts; Save persists and reopening shows the saved values |
| OHW-112 | Footer fields (left/center/right) persist and render in the preview                          |
| OHW-113 | Import PDF with title page populates title/author/contacts automatically                     |
| OHW-114 | Import PDF without title page leaves `title_page` empty and does NOT drop a scene            |
| OHW-115 | Empty title + save → succeeds (all fields default to empty strings)                          |
| OHW-116 | Field > max length → inline validation error, save button disabled                           |
| OHW-117 | Cancel discards unsaved edits                                                                |

---

## Mock mode

`MOCK_PDF_IMPORT=true` (Spec 05c) returns a fixed Fountain + fixed `TitlePage` payload.

---

## Scope — not in this spec

- PDF export of the title page → Spec 08
- Multiple title pages per screenplay (revision history) → covered by existing Versions
- Locale-specific templates → future
- Logo / image in title page → future
