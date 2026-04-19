# Spec 05j — Screenplay PDF Export (Fountain → industry-standard PDF)

## Goal

Lo sceneggiatore esporta la sceneggiatura corrente in un PDF **industry-standard** (cover page opzionale, MORE/CONT'D, scene numbers, page numbers, formattazione US Letter 12pt Courier) condivisibile con produttori, agenti, festival, concorsi.

UX gemella di 04c: click `Export PDF` in toolbar → modale con checkbox cover page → click `Genera` → PDF aperto in **nuova tab** del browser (preview), da cui l'utente scarica o stampa.

## Status at spec time

Feature non implementata. La libreria **`afterwriting`** è già in `package.json` e usata in test fixtures (vedi memory `pdf-library`). Manca la pipeline server fn → PDF stream → preview tab.

## Out of scope

- **Final Draft `.fdx` export** — non lo facciamo (decisione: gli agenti AI vivono dentro Oh Writers, non serve interop col mondo legacy). Se un cliente lo chiederà esplicitamente, valutiamo dopo.
- **`.fountain` export** (download del raw fountain text) — banale (`docToFountain` esiste già) ma fuori da questo spec; eventualmente bottone secondario in v2.
- **Watermark / DRM** — non in v1
- **Numerazione scene custom** (A1, A2, lettering MGM-style) — esiste già in 05i, qui ci limitiamo a riusare i numeri scene già presenti nel doc
- **Revision colors stampati nel PDF** — Spec 06e governa la colorazione in editor; il PDF è black-and-white in v1

## Decisioni tecniche

### Libreria PDF

**Scelta: `afterwriting`** (già in repo).

Perché:

- Industry-standard: nasce per Fountain → PDF, copre cover page, MORE/CONT'D, scene numbers, dual dialogue
- Consuma direttamente Fountain text — nessun intermediate format custom
- Stesso formato che i writer professional si aspettano (compatibile col rendering di Highland, Slugline, WriterDuet)

Alternative scartate:

- `pdfkit` da zero — ricreare le regole di paginazione industry sarebbe mesi di lavoro e bug-prone
- `puppeteer + CSS print` — overhead infrastrutturale, layout meno fedele agli standard del settore

### Sorgente per il PDF

Il server riceve `screenplayId`, carica la riga DB e usa **`fountain` (la colonna text)** come input per afterwriting. Non usa `pm_doc` perché afterwriting parla solo Fountain, e il Fountain in DB è la source of truth (vedi `ProseMirrorView.tsx`: `lastValueRef` + `docToFountain` ad ogni transazione).

### Cover page

**Opt-in via checkbox** nel modale di export, default **off** (stessa UX di 04c).

Quando attivato:

- Pulla i campi della title page da Spec 14 (titolo, autore, contatti, draft date)
- Se la title page non è compilata → checkbox **disabilitato** nel modale
- Layout cover: standard industria (titolo centrato in alto, "Written by" + autore al centro, contatti in basso a sinistra, draft date in basso a destra)

afterwriting supporta nativamente la title page via metadati Fountain (`Title:`, `Credit:`, `Author:` ecc. all'inizio del file). Se i nostri dati title-page sono in DB e non nel Fountain text, li **prepend**iamo al Fountain prima di passarlo ad afterwriting.

### Trigger

- Bottone **`Export PDF`** nella toolbar di `ScreenplayEditor`
- Disabilitato se la sceneggiatura è vuota (no scene heading, no action)
- Nascosto in read-only mode (viewer)
- Click → modale `ExportScreenplayPdfModal` con singolo checkbox `Includi cover page` (default off, disabilitato se title page non compilata) + bottone `Genera`
- Click su `Genera` → nuova tab con PDF preview (riusa `openPdfPreview` di 04c)

### Server function

```ts
export const exportScreenplayPdf = createServerFn({ method: "POST" })
  .validator(
    z.object({
      screenplayId: z.string().uuid(),
      includeCoverPage: z.boolean().default(false),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ScreenplayNotFoundError | ForbiddenError | DbError
      >
    > => {
      // 1. Load screenplay row + project (per project title in filename + permission check)
      // 2. Permission check: user deve avere READ access sul progetto
      // 3. Se includeCoverPage → carica title page (Spec 14), prepend metadati Fountain
      // 4. Passa il Fountain assemblato ad afterwriting → ottiene Buffer PDF
      // 5. Encode base64 → toShape
    },
  );
```

Stesso contratto di `exportNarrativePdf` (base64 nel JSON) per coerenza. Stesso trade-off accettato: i PDF screenplay sono tipicamente 100-300KB → base64 +33% accettabile.

### Client

```ts
export const useExportScreenplayPdf = () =>
  useMutation({
    mutationFn: async (input: {
      screenplayId: string;
      includeCoverPage: boolean;
    }) => {
      const result = unwrapResult(await exportScreenplayPdf({ data: input }));
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openPdfPreview(url, result.filename); // riusa helper di 04c
    },
  });
```

`openPdfPreview` è lo stesso helper di 04c (`features/documents/lib/pdf-preview.ts`) — promosso a util cross-feature se viene usato anche qui (regola 3+ usi di CLAUDE.md è soddisfatta una volta che screenplay export entra). Se per ora i casi sono solo 2, lo lasciamo in `documents/` e lo importiamo da lì.

**Nota architetturale**: `pdf-preview.ts` non è dominio `documents`, è una browser util. Decidere se spostarlo in `apps/web/app/lib/pdf-preview.ts` quando questo spec viene implementato.

### Permission

- Anyone with **read access** sul progetto può esportare lo screenplay
- Stesso ragionamento di 04c: l'export è una read op anche se POST

### Filename

`{project-title-slug}-{screenplay-title-slug}-{YYYY-MM-DD}.pdf`

Esempio: `the-silent-detective-pilot-2026-04-19.pdf`

Slugify: lowercase, spazi → `-`, rimuove caratteri non-`[a-z0-9-]`.

## User stories → OHW IDs

Prossimo ID libero dopo 04c: **OHW-232**.

| ID      | User story                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| OHW-232 | Editor su screenplay clicca `Export PDF` → modale con checkbox cover page, click `Genera` → nuova tab apre il PDF |
| OHW-233 | Il PDF rendering rispecchia gli standard (12pt Courier, US Letter, scene heading allineato, character centrato)   |
| OHW-234 | Con `includeCoverPage: true` e title page compilata, prima pagina è la cover                                      |
| OHW-235 | Se title page non è compilata → checkbox cover page disabilitato                                                  |
| OHW-236 | Se screenplay è vuoto → bottone `Export PDF` disabilitato                                                         |
| OHW-237 | Viewer su team project vede il bottone `Export PDF` (read op, non bloccato dal role guard)                        |
| OHW-238 | Server rifiuta `exportScreenplayPdf` per progetto di altri utenti non membri → ForbiddenError                     |
| OHW-239 | Filename rispetta il pattern `{project}-{screenplay}-{date}.pdf`                                                  |

## Implementation order (TDD)

1. **Blocco 1 — server**: `exportScreenplayPdf` server fn + unit test che asserisce Buffer non vuoto e contiene la prima scene heading via `pdf-parse`
2. **Blocco 2 — title page injection**: helper `prependTitlePageToFountain(fountain, titlePage)` con test di parsing afterwriting roundtrip
3. **Blocco 3 — client**: `useExportScreenplayPdf` hook + `ExportScreenplayPdfModal` component + bottone in `ScreenplayEditor` toolbar
4. **Blocco 4 — E2E**: OHW-232..239
5. **Blocco 5 — regression & commit**

## Testing

- **Vitest**:
  - `prependTitlePageToFountain(fountain, titlePage)` → output contiene i campi Fountain title page
  - `buildScreenplayPdf(fountain)` → Buffer length > 0, `pdf-parse` mostra la prima scene heading
  - `slugifyForFilename("The Silent Detective")` → `"the-silent-detective"`
- **Playwright**: OHW-232..239 — per OHW-233 intercetta la response, decodifica base64, `pdf-parse` per asserire presenza dei tag standard ("INT.", "EXT.", nome del character in maiuscolo)

## Files touched / created

```
apps/web/app/features/screenplay-editor/
├── server/screenplay-export.server.ts      ← NEW, exportScreenplayPdf
├── lib/pdf-screenplay.ts                   ← NEW, buildScreenplayPdf via afterwriting
├── lib/title-page-prepend.ts               ← NEW, prependTitlePageToFountain
├── hooks/useExportScreenplayPdf.ts         ← NEW
└── components/
    ├── ScreenplayEditor.tsx                ← +Export PDF button in toolbar
    └── ExportScreenplayPdfModal.tsx        ← NEW

apps/web/app/features/documents/
└── lib/pdf-preview.ts                      ← riuso (creato in 04c)

tests/screenplay-editor/
└── screenplay-export.spec.ts               ← NEW, OHW-232..239
```

## Open questions

- **Pagination drift tra editor e PDF**: l'editor usa il paginator custom (vedi `lib/plugins/paginator.ts`) con `PRINTABLE_HEIGHT_PX` derivato dalla geometria DOM. afterwriting calcola la paginazione con regole proprie (line-based). Probabile lieve discrepanza tra "pagina N" mostrata nel footer dell'editor e "pagina N" del PDF. Decisione: **accettiamo la discrepanza in v1**, è normale anche in Final Draft / WriterDuet (l'editor è un'approssimazione, il PDF è la verità). Documentare nel tooltip del page indicator.
- **Localizzazione cover page**: i template afterwriting sono in inglese (`Written by`). Se il progetto è in italiano serve override. Da decidere quando partirà Spec 18 (i18n).
- **Cesare/agenti AI hand-off**: in futuro un agente potrebbe voler "leggere" il PDF prodotto. Ma noi abbiamo il Fountain originale, gli agenti useranno quello — il PDF è solo per umani.
