# Spec 07c — PDF Import Pass 0 (title-page extraction)

> **Status:** done (2026-04-22). 6/6 vitest + 3/3 Playwright (OHW-FP30/31/32) verdi.
> **Implementation notes:**
>
> - Modal "Frontespizio importato dal PDF" costruito sul componente DS `<Dialog>` + `<Button variant="primary"|"ghost">` (zero markup custom, zero CSS module dedicato).
> - Helper puro `apps/web/app/features/screenplay-editor/lib/title-page-from-pdf.ts` (no PM dependency) — riusabile da CLI/mobile in futuro.
> - Hook `useImportPdf` espone `onTitlePageDetected?: (doc) => void`; `ScreenplayEditor` decide se applicare silenziosamente (front page vuoto) o aprire il confirm.
>   **Depends on:** Spec 05c (PDF import pipeline), Spec 07b (front-page editor + `projects.title_page_doc`).
>   **Sub-spec of:** 07b (residual MVP work).

## Goal

Quando l'utente importa un PDF di una sceneggiatura (Spec 05c), oggi tutta la **prima pagina/title page** viene scartata da Pass 1 come "noise". Spec 07c aggiunge un **Pass 0** che, prima del cleanup, isola le righe della title page e le converte in un PM doc compatibile con lo schema di Spec 07b, salvandolo su `projects.title_page_doc`.

Risultato per l'utente: dopo "Import PDF", anche il frontespizio è già pre-popolato e visibile su `/projects/$id/title-page`, pronto per essere editato.

## Non-goals

- Rilevare un **logo / immagine**.
- WGA registration / contact "structured" — 07b è free-form: tutto in centerBlock o footer.
- Layout pixel-perfect — contano i 5 blocchi (title / centerBlock / footerLeft / footerCenter / footerRight).
- Importare title page da PDF narrativi.
- Sovrascrivere una title page esistente senza chiedere conferma.

## Behaviour

1. User clicca **Import PDF** (flow esistente di 05c).
2. Server estrae testo via `pdf-parse` con `max: 0`.
3. **NEW:** prima di `fountainFromPdf(rawText)`, server isola le righe **della prima pagina logica** e le passa a `extractTitlePageFromPdf(firstPageLines) → TitlePagePMDoc | null`.
4. Restanti righe → pipeline esistente (Pass 1/2/3) → Fountain.
5. Server fn ritorna `{ fountain: string, titlePageDoc: PMDoc | null }`.
6. Client: se `titlePageDoc != null` **e** `projects.title_page_doc` è già non-vuoto → confirm "Replace existing front page with imported one?". Se vuoto → applica direttamente.
7. Persistenza via `updateTitlePage` (07b). Nessuna nuova server fn.

## Heuristic — "prima pagina logica"

`pdf-parse` con `max: 0` produce testo continuo. Per isolare la title page:

- Cerca la **prima slugline** via regex `^(INT\.?|EST\.?|EXT\.?|INT\.?/EXT\.?|I\.?/E\.?|INSERT|FADE IN:?)\b`.
- Tutto ciò che la **precede** = candidate title-page lines.
- Se la prima slugline appare entro le prime ~15 righe non-vuote → assume "no title page" → ritorna `null`.

Fail-safe: se l'euristica fallisce, ritorna `null` e il flow esistente non subisce regression.

## Mapping righe → 5 blocchi PM

| Regola                                                                                  | Mappa a                                       |
| --------------------------------------------------------------------------------------- | --------------------------------------------- |
| Prima riga non-vuota più "lunga del 60° percentile" e ALL-CAPS                          | `title`                                       |
| Righe tra title e l'ultimo terzo della title page (escluse le prime 2 vuote post-title) | `centerBlock`                                 |
| Ultimo terzo: split per allineamento orizzontale stimato                                | `footerLeft` / `footerCenter` / `footerRight` |

`pdf-parse` non restituisce coordinate. Per il footer triplo:

- Riga con **3+ runs separati da 4+ spazi consecutivi** → split sui run boundaries.
- Altrimenti → tutto in `footerLeft`, gli altri due `<para></para>` vuoti.

Il PM doc ha **sempre** tutti e 5 i nodi top-level (07b lo richiede); le sezioni mancanti restano `<para></para>`.

## Server contract

```ts
// pdf-import.server.ts — nuovo return type
type ImportPdfResult = {
  fountain: string;
  titlePageDoc: TitlePageDoc | null;
};

importPdf(POST) → ResultShape<ImportPdfResult, ImportPdfError>
```

Niente nuove server fn, niente migration. Scrittura DB resta `updateTitlePage` (07b).

## Files

```
apps/web/app/features/screenplay-editor/lib/
  title-page-from-pdf.ts            ← NEW
  title-page-from-pdf.test.ts       ← NEW (≥6 fixtures)

apps/web/app/features/screenplay-editor/server/
  pdf-import.server.ts              ← MOD: integra extractTitlePageFromPdf

apps/web/app/features/screenplay-editor/components/
  ImportPdfButton.tsx               ← MOD: applica titlePageDoc post-import (con confirm se non-empty)

apps/web/app/features/screenplay-editor/hooks/
  useImportPdf.ts                   ← MOD: nuova shape result

tests/screenplay-editor/
  pdf-import-titlepage.spec.ts      ← NEW: OHW-FP30..32

tests/fixtures/pdfs/
  with-title-page.pdf               ← NEW
  no-title-page.pdf                 ← NEW
  fountain-style-title.pdf          ← NEW
```

## Tests

### Vitest unit (`title-page-from-pdf.test.ts`)

1. PDF con title page classica → title corretto, centerBlock contiene "Written by", footer 3-way split.
2. PDF con fountain key:value (`Title: Foo\nAuthor: Bar`) → title="Foo", centerBlock include "Bar".
3. PDF senza title page (slugline su riga 1) → `null`.
4. Solo title, no footer → footerLeft vuoto.
5. Footer su una sola riga, no triplo → tutto in footerLeft.
6. PDF vuoto → `null`.

### Playwright E2E (`pdf-import-titlepage.spec.ts`)

- `[OHW-FP30]` import PDF con title page su screenplay vuoto + title page vuota → route `/title-page` mostra title + centerBlock.
- `[OHW-FP31]` import su title-page già popolata → confirm → conferma sostituisce, cancel preserva.
- `[OHW-FP32]` import senza title page → toast "Front page not detected" + title-page vuota.

## Implementation order

1. Pure helper `title-page-from-pdf.ts` + vitest fixtures.
2. Server fn estesa con `titlePageDoc` nel return.
3. Hook + UI: `useImportPdf` espone `titlePageDoc`; `ImportPdfButton` applica con confirm condizionato.
4. 3 nuovi PDF fixture (riusa `scripts/generate-test-pdfs.ts`).
5. Playwright OHW-FP30..32.
6. Aggiorna 07b "Open questions" con riferimento a 07c.

## Open questions risolte

- Confirm dialog: modal `<dialog>` come 05c "Replace current screenplay?".
- Nuovo progetto vuoto: skip confirm (title-page vuota = niente da perdere).
