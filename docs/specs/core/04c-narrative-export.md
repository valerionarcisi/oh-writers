# Spec 04c — Narrative Export (Logline + Synopsis + Treatment → PDF)

## Goal

Lo sceneggiatore esporta i tre documenti narrativi (**logline**, **sinossi**, **trattamento**) in un **singolo PDF** condivisibile con produttori, agenti, concorsi. Export è on-demand: un click in toolbar, il PDF viene generato server-side e **aperto in una nuova tab del browser** (preview), da cui l'utente decide se scaricare o stampare.

L'**outline** è intenzionalmente escluso: è un documento di lavoro interno (drag&drop di scene/atti, vedi 04b), non destinato al pitching esterno. Se in futuro emergerà l'esigenza di un export "working doc bundle" si valuterà uno spec dedicato.

Scope **intenzionalmente stretto**: questa spec copre solo l'export documentale testuale. Il moodboard/storyboard visuale è **Spec 19** (separata). L'export della sceneggiatura Fountain→PDF resta in **Spec 05/afterwriting**, indipendente da questa.

## Status at spec time

Feature non implementata. La libreria `afterwriting` è già presente nel repo ma è fountain-specific (pagina screenplay formattata). Per i narrativi serve un renderer diverso.

## Out of scope

- **Moodboard / immagini / video** → Spec 19
- **Screenplay PDF** → già coperto da pipeline fountain (Spec 05)
- **Markdown / TXT / DOCX export** — potenziale v2, non qui
- **Template customizzabili dall'utente** — unico template hardcoded, brutalist/clean
- **Pitch package multi-progetto** — export è sempre 1 progetto = 1 PDF
- **Email delivery** — user scarica il PDF, non lo mandiamo noi

## Decisioni tecniche

### Libreria PDF

**Scelta: `pdfkit`** (server-side, Node).

Perché:

- Mature (10+ anni), stabile, zero dipendenze native
- API imperativa semplice — perfetta per layout testuale lineare
- Genera stream: si può rispondere con PDF senza bufferizzare tutto in memoria
- `@react-pdf/renderer` è più ergonomico ma pesante e con re-render overhead inutile per testo statico

Alternative scartate:

- `puppeteer` — troppa infrastruttura (browser headless) per un PDF testuale
- `jspdf` — client-side, non allineato con la nostra filosofia "server fn only"
- `afterwriting` — fountain-specific, layout sceneggiatura non adatto a prosa

Aggiunta dipendenza richiede approvazione utente (confermata in chat `a`).

### Template PDF

**Title page opt-in via checkbox** in un piccolo modale che precede l'export (default: **off**). Quando attivata, la prima pagina è la title page (Spec 14). Quando disattivata o non disponibile, il PDF parte direttamente dalla LOGLINE.

Layout sezioni testuali con gerarchia:

```
──────────────────────────────────
[Project Title]
[Author Name · Draft Date]       ← se title page esiste
──────────────────────────────────

LOGLINE

A detective chases a killer through a silent city.

──────────────────────────────────

SYNOPSIS

[plain text trattamento, word-wrap automatico,
 salto pagina quando serve]

──────────────────────────────────

TREATMENT

[plain text esteso, word-wrap, numerazione pagine in footer]
```

- Font: serif (`Times-Roman` embedded in pdfkit default) — neutro, leggibile
- Margini: 2.5cm tutti i lati (standard industria)
- Numeri pagina in footer da pagina 2 (la 1 è la title page o la logline)
- Sezioni separate da regola orizzontale sottile
- Headers sezione: SMALL CAPS, letter-spacing aumentato

### Trigger

- Bottone **`Export PDF`** nella toolbar di `NarrativeEditor` — visibile su qualsiasi delle 3 pagine narrative (logline/synopsis/treatment), genera **sempre tutti e tre** (non solo quella corrente)
- Click → apre un piccolo modale con singolo checkbox `Includi title page` (default off, disabilitato/nascosto se la title page non è compilata) + bottone `Genera`
- Click su `Genera` → il PDF viene aperto in una nuova tab (`window.open(blobUrl, "_blank")`); la tab usa il viewer PDF nativo del browser, da lì l'utente scarica o stampa
- Disabilitato se tutti e tre i documenti sono vuoti
- Nascosto in read-only mode (viewer)

### Server function

```ts
export const exportNarrativePdf = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      includeTitlePage: z.boolean().default(false),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { pdfBase64: string; filename: string },
        ProjectNotFoundError | ForbiddenError | DbError
      >
    > => {
      // 1. Load project + 3 narrative docs + optional title page
      // 2. Permission check: user must be able to READ the project
      // 3. Stream pdfkit → base64 → return
    },
  );
```

Ritorna base64 perché `createServerFn` non streamma binary nativamente. Il client decodifica e crea un Blob per il download. **Trade-off**: carica tutto il PDF in memoria client lato serializzazione JSON. Accettabile per doc narrativi (max 200KB treatment → PDF ~300-500KB → base64 +33%). Se problematico → alternativa in v2: endpoint HTTP dedicato che streamma.

### Client

```ts
export const useExportNarrativePdf = () =>
  useMutation({
    mutationFn: async (input: {
      projectId: string;
      includeTitlePage: boolean;
    }) => {
      const result = unwrapResult(await exportNarrativePdf({ data: input }));
      // Decode base64 → Blob → object URL → open in new tab
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(blob);
      openPdfPreview(url, result.filename);
    },
  });
```

L'apertura della tab è isolata in `features/documents/lib/pdf-preview.ts` (browser-only wrapper, framework-agnostic per futuro Expo companion che userà invece `expo-sharing` o un PDFView nativo).

`openPdfPreview` usa `window.open(url, "_blank")` e revoca l'object URL dopo un timeout (es. 60s) per evitare leak. Se il browser blocca il popup (raro perché è dentro un click handler) → fallback a `<a target="_blank">` programmatico.

### Permission

- **Anyone with read access** può esportare (incluso viewer)
- Si bypassa il ForbiddenError del viewer che vale solo per `saveDocument`
- Ragione: l'export è una read operation anche se POST (serve body per projectId; GET con query OK altra opzione)

## User stories → OHW IDs

Prossimo ID libero: **OHW-225** (dopo 04b).

| ID      | User story                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| OHW-225 | Owner su logline clicca `Export PDF` → modale con checkbox title page, click `Genera` → si apre nuova tab con PDF |
| OHW-226 | PDF contiene almeno le sezioni `LOGLINE`, `SYNOPSIS`, `TREATMENT` con il contenuto dei 3 documenti                |
| OHW-227 | Se tutti e 3 i docs sono vuoti → bottone `Export PDF` disabilitato                                                |
| OHW-228 | Viewer su team project vede il bottone `Export PDF` (non è bloccato dal role guard — è read op)                   |
| OHW-229 | Server rifiuta `exportNarrativePdf` per progetto di altri utenti non membri → ForbiddenError                      |
| OHW-230 | Se title page non è compilata, il checkbox `Includi title page` è disabilitato nel modale                         |
| OHW-231 | Con `includeTitlePage: true` e title page compilata, la prima pagina del PDF è la title page                      |

## Implementation order (TDD)

1. Blocco 1 — server: install `pdfkit`, write `exportNarrativePdf` con unit test per la pipeline base64
2. Blocco 2 — client: `useExportNarrativePdf` hook + `downloadBlob` util + bottone in `NarrativeEditor`
3. Blocco 3 — E2E: OHW-225..229
4. Blocco 4 — regression & commit

## Testing

- **Vitest**: `buildNarrativePdf(logline, synopsis, treatment, titlePage?)` → Buffer length > 0, presenza stringhe chiave ("LOGLINE", "SYNOPSIS", "TREATMENT") tramite parsing del PDF con `pdf-parse` (già in repo per altre fixture)
- **Playwright E2E**: OHW-225..229. Per OHW-226 intercetta la response, decodifica base64, esegue `pdf-parse`, asserisce contenuto

## Files touched / created

```
apps/web/app/features/documents/
├── server/documents.server.ts              ← +exportNarrativePdf server fn
├── lib/pdf-narrative.ts                    ← NEW, buildNarrativePdf(...) pure-ish (stream → buffer)
├── lib/pdf-preview.ts                      ← NEW, browser-isolated openPdfPreview helper
├── hooks/useDocument.ts                    ← +useExportNarrativePdf mutation
└── components/
    ├── NarrativeEditor.tsx                 ← +Export PDF button
    └── ExportPdfModal.tsx                  ← NEW, title-page checkbox + Genera

tests/documents/
└── narrative-export.spec.ts                ← NEW, OHW-225..229

apps/web/package.json                       ← +pdfkit, +@types/pdfkit
```

## Open questions

- Font embedding per caratteri accentati: `Times-Roman` di pdfkit include Latin-1 base; se emergono problemi con accenti o lingue non-latine → embedding TTF (es. DejaVu).
- Revoca dell'object URL: il timeout 60s è arbitrario — se l'utente ha la tab aperta e ricarica oltre quel tempo perde il PDF. Da verificare in QA se è davvero un problema o se 60s coprono il 99% dei casi.
