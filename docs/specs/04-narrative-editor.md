# Spec 04 — Narrative Editor (Logline, Synopsis, Treatment)

Outline ha la sua spec dedicata — vedi **04b**. Export PDF / pitch package ha la sua spec dedicata — vedi **04c**.

## Goal

Uno scrittore apre il proprio progetto e può scrivere, salvare e versionare i tre documenti narrativi di preproduzione: **logline**, **sinossi**, **trattamento**. Ciascuno è una textarea pura (nessun rich editor), con autosave debounced e salvataggio manuale immediato.

## Status at spec time

La feature è **parzialmente implementata** quando questa spec viene scritta. Questo documento fissa il target state, quindi elenca i gap da chiudere.

Presente in codice:

- DB schema `documents` + `document_versions` (`packages/db/src/schema/documents.ts`)
- Server fn `getDocument`, `saveDocument` (`apps/web/app/features/documents/server/documents.server.ts`)
- Hook `useDocument`, `useSaveDocument`, `useAutoSave` (30s debounce)
- UI: `NarrativeEditor`, `TextEditor`, `OutlineEditor`, `AIAssistantPanel` (stub disabilitato con badge "Spec 07"), `SaveStatus`
- Route: `/projects/:id/{logline,synopsis,outline,treatment}`

Gap da chiudere in questa spec:

1. **Zero E2E test** sui narrativi oggi
2. `NarrativeEditor` passa `maxLength={500}` a `TextEditor` per la logline — target: **200**, centralizzato come costante
3. Nessun cap server-side per tipo documento (`SaveDocumentInput` accetta `z.string()` senza limiti)
4. `saveDocument` non controlla il ruolo del membro team — il viewer può oggi teoricamente salvare

## Out of scope (esplicito)

- **Outline** editing e DnD → **04b**
- **Export** PDF, Markdown, plain text, pitch package → **04c**
- **AI assist** (streaming, suggerimenti, generazione varianti) → `AIAssistantPanel` è già uno stub disabilitato con badge "Spec 07", nessuna modifica qui
- **Rich text editor** — decisione definitiva: textarea, mai TipTap / Lexical / ProseMirror dedicato
- **Markdown rendering** sul trattamento — rimane plain text; se emerge esigenza, sotto-spec dedicata
- **Yjs real-time collaboration** sui narrativi — la colonna `documents.yjsState` resta ma inutilizzata per questi tipi; la sua rimozione è decisione futura
- **i18n** delle label ("Saved", "Saving…") — copre Spec 18

## Data model

Invariato rispetto allo schema già in produzione:

```sql
documents (
  id           uuid PK,
  project_id   uuid FK → projects.id (on delete cascade),
  type         'logline' | 'synopsis' | 'outline' | 'treatment',
  title        text NOT NULL,
  content      text NOT NULL DEFAULT '',    -- plain text per narrativi, JSON per outline
  yjs_state    bytea NULLABLE,              -- inutilizzato per narrativi
  created_by   uuid FK → users.id,
  created_at, updated_at,
  UNIQUE (project_id, type)
)

document_versions ( ... gestito da Spec 06b )
```

Un documento per tipo per progetto: il vincolo `UNIQUE (project_id, type)` rende esplicito a livello DB il concetto "c'è una sola logline per film".

## Schemas (Zod)

In `apps/web/app/features/documents/documents.schema.ts` aggiungere:

```ts
export const LOGLINE_MAX = 200;
export const SYNOPSIS_MAX = 5_000;
export const TREATMENT_MAX = 200_000;

export const ContentMaxByType = {
  logline: LOGLINE_MAX,
  synopsis: SYNOPSIS_MAX,
  treatment: TREATMENT_MAX,
  outline: Number.POSITIVE_INFINITY, // caps strutturali gestiti in 04b
} as const;
```

`SaveDocumentInput` oggi accetta `content: z.string()` senza cap. La cap per-tipo va enforced **server-side** (recupero doc → lookup `type` → check lunghezza). Il client duplica il limite via `textarea.maxLength` per UX.

## Server functions

Esistenti, con le seguenti modifiche richieste:

- `getDocument({ projectId, type })` → invariata
- `saveDocument({ documentId, content })`:
  1. **Cap per-tipo**: dopo aver caricato il documento, verificare `content.length <= ContentMaxByType[doc.type]` → ritornare `ValidationError` altrimenti (aggiungere al tipo di ritorno).
  2. **Role check**: lookup membership dell'utente sul team del progetto. Se `viewer` → `ForbiddenError("save document: viewer role")`. Owner ed editor passano.

`getDocument` non cambia: viewer può leggere.

## UI contract

### Logline (`/projects/:id/logline`)

- `<TextEditor>` con `maxLength={LOGLINE_MAX}`, singola area di testo multi-riga (ma il limite forza di fatto 1–3 righe)
- Counter live `{n}/200`, classe warning a ≥ 180
- Placeholder: `A [protagonist] must [goal] before [stakes]…`

### Sinossi (`/projects/:id/synopsis`)

- `<TextEditor>` multi-riga auto-resize, `maxLength={SYNOPSIS_MAX}`
- Counter live `{n}/5000`, warning a ≥ 4500
- Placeholder: `Begin your synopsis here…`

### Trattamento (`/projects/:id/treatment`)

- `<TextEditor>` multi-riga auto-resize
- Nessun counter visibile — il cap 200K è server-side a tutela DB, non UX guidance
- Placeholder: `Begin your treatment here…`

### Shared (toolbar narrative)

- Back link → `/projects/:id`
- Titolo documento a sinistra (Logline / Synopsis / Treatment)
- A destra: `SaveStatus` → `Save` button (disabilitato se non dirty) → `Versioni` button → toggle `Free/Assisted` (Assisted mostra `AIAssistantPanel` stub)
- Autosave: 30s debounce dopo l'ultima modifica
- Save manuale: flush immediato
- `Versioni` button apre il drawer universale (Spec 06b, già integrato)

## User stories → OHW IDs

Prossimo ID libero: **OHW-200** (ultimo usato nei test: OHW-184).

| ID      | User story                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| OHW-200 | Utente non autenticato su `/projects/:id/logline` è reindirizzato a login                                                     |
| OHW-201 | Owner apre logline vuota → textarea vuota, placeholder visibile, `SaveStatus` "Saved"                                         |
| OHW-202 | Owner digita → dopo il debounce autosave, il contenuto persiste al reload senza click esplicito                               |
| OHW-203 | Owner digita e clicca `Save` → salva subito, non aspetta il debounce                                                          |
| OHW-204 | Logline: counter mostra `charCountWarn` oltre 180 caratteri                                                                   |
| OHW-205 | Logline: textarea rifiuta input oltre 200 caratteri (HTML `maxLength` enforcement)                                            |
| OHW-206 | Server rifiuta `saveDocument` con `content.length > LOGLINE_MAX` per doc di tipo `logline` (bypass HTML via chiamata diretta) |
| OHW-207 | Sinossi: contenuto round-trip dopo reload                                                                                     |
| OHW-208 | Trattamento: contenuto round-trip dopo reload                                                                                 |
| OHW-209 | Navigazione tra `/logline` e `/synopsis` preserva i contenuti rispettivi                                                      |
| OHW-210 | `SaveStatus` mostra "Error saving" se il server ritorna `DbError` (verifica via intercept)                                    |
| OHW-211 | Viewer apre `/logline` → textarea `readOnly`, bottone Save disabilitato                                                       |
| OHW-212 | Viewer tenta chiamata diretta a `saveDocument` → server risponde con `ForbiddenError`                                         |
| OHW-213 | Progetto archiviato → save rifiutato con `ForbiddenError` (guard già implementato, manca il test)                             |
| OHW-214 | Click su `Versioni` → drawer apre con scope `{ kind: "document", documentId, docType }`                                       |

## Implementation order (TDD)

Blocco 1 — allineamento limiti e caps:

1. Definire `LOGLINE_MAX / SYNOPSIS_MAX / TREATMENT_MAX / ContentMaxByType` in `documents.schema.ts`
2. Aggiornare `NarrativeEditor` per passare `LOGLINE_MAX` a `TextEditor` invece di 500 hardcoded
3. Aggiungere cap server-side in `saveDocument` (test OHW-206)

Blocco 2 — permessi: ✅ done (commit Blocco 2)

4. Estratto `canEdit / isOwner / getMembership` in `~/server/permissions.ts` (già
   presenti come helper privati in `projects.server.ts`, ora condivisi tra
   `projects` e `documents`). Refactor di `projects.server.ts` per consumarli.
5. Role guard in `saveDocument`: carica project + membership, se `!canEdit` →
   `ForbiddenError` (test OHW-212).
6. `getDocument` restituisce `DocumentViewWithPermission` (DocumentView + `canEdit`)
   così il client sa se rendere read-only senza una seconda query.
7. Front-end: `NarrativeEditor` legge `document.canEdit` → se false:
   - Badge "Read only" nella toolbar
   - `readOnly` prop passata a `TextEditor` (+ attributo HTML `readonly`)
   - `readOnly` prop passata a `OutlineEditor` (wrapper `<fieldset disabled>`
     disabilita tutti gli input/button nativi senza riscrivere gli handler)
   - Bottone Save nascosto (HTML `hidden` via conditional render)
   - `SaveStatus` nascosto (nulla da salvare)
8. Seed esteso: `viewer@ohwriters.dev` + team "Test Team" + team project
   "Team Thriller" (TEST_TEAM_PROJECT_ID). `tests/fixtures.ts` espone
   `authenticatedViewerPage` fixture + costante `TEST_TEAM_PROJECT_ID`.

Blocco 3 — test E2E: ✅ done (commit Blocco 3)

7. `tests/documents/narrative-editor.spec.ts` ora copre OHW-200..213 (14 test
   verdi); OHW-214 (drawer versioni narrative) è `test.skip` — dipende
   dall'integrazione drawer universale di Spec 06b, non ancora wired nella
   toolbar `NarrativeEditor`.
8. Autosave: il debounce resta 30s in produzione ma è ora overridabile in E2E
   tramite `window.__ohWritersAutoSaveDelayMs` (letto in `useAutoSave`), così
   OHW-202 può testare l'autosave senza attese reali di 30s.

Blocco 4 — regression & commit:

9. `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test -- tests/documents`
10. Commit `[OHW] feat: Spec 04 — narrative editor limits, role guard, E2E coverage`

## Testing

- **Playwright E2E** — `tests/documents/narrative-editor.spec.ts` (tutti gli OHW-200..214)
- **Vitest** — nessun test unit necessario in questa spec. Logica pura emerge solo in 04b (outline reducer). Cap validation e role check sono 1–2 righe ciascuno → coperti via E2E.
- Seeded users/project: Giuseppe (owner), Maria (editor), Marco (viewer); progetto con `documents` rows create on-demand al primo save.

## Files touched / created

```
apps/web/app/features/documents/
├── documents.schema.ts                 ← +LOGLINE_MAX/SYNOPSIS_MAX/TREATMENT_MAX, +ContentMaxByType
├── documents.errors.ts                 ← +ValidationError re-export
├── server/documents.server.ts          ← +cap check, +role check
├── components/NarrativeEditor.tsx      ← 500→LOGLINE_MAX, isReadOnly prop
└── components/TextEditor.tsx           ← +readOnly prop

apps/web/app/features/teams/
└── teams.server.ts                     ← +requireTeamRole (se assente)

tests/documents/
└── narrative-editor.spec.ts            ← NEW, OHW-200..214
```

## Non-goals (again, one more time)

- Outline → **04b**
- Export → **04c**
- AI assist → futuro (stub disabilitato già in UI)
- Markdown → mai (o sub-spec se richiesto)
- Yjs narrative → mai
