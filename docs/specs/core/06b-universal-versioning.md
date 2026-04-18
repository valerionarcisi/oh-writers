# Spec 06b — Universal Document Versioning (rewrite)

**Status:** supersedes all previous revisions of this file. Extends Spec 06.

## Goal

Ogni documento di un progetto — **logline, synopsis, outline, treatment, screenplay** — ha lo stesso modello di versioning, **puramente manuale**: nessun salvataggio automatico di versioni, solo auto-save del contenuto della versione attiva.

Il writer decide quando creare una nuova versione, la rinomina opzionalmente, può duplicare una versione esistente, confrontare due versioni affiancate con diff stile git, e switchare a qualunque versione precedente.

## Model

Il modello è identico per tutti i tipi di documento. Il **contenuto live** risiede sempre su una riga in `*_versions`; la tabella "documento" tiene solo metadati e il puntatore alla versione attiva.

### Schema (narrative + outline)

```sql
-- NUOVA
CREATE TABLE document_versions (
  id uuid PK,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  number integer NOT NULL,          -- 1, 2, 3... per document_id
  label text,                        -- opzionale, user-defined
  content text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE (document_id, number)
);

-- CAMBIA
ALTER TABLE documents
  ADD COLUMN current_version_id uuid REFERENCES document_versions(id);
```

`documents.content` **resta** (legacy). La migration per ogni riga esistente crea una `document_versions` con `number=1`, `content=documents.content`, e setta `current_version_id` a quella. Dopo la migrazione `documents.content` non è più scritto — diventa campo deprecato da rimuovere in spec successiva.

### Schema (screenplay)

- **Rimuoviamo** `screenplay_versions.is_auto`.
- **Rimuoviamo** `maybeCreateAutoVersion` e ogni chiamante.
- **Aggiungiamo** `screenplays.current_version_id uuid REFERENCES screenplay_versions(id)`.
- Per ogni screenplay senza versioni creiamo `number=1` con il content corrente; per quelle con versioni esistenti puntiamo alla `createdAt` più recente.
- `screenplay_branches` resta in schema ma non è referenziato dalla UI (deprecation in spec successiva).

### Invariant

- Ogni documento ha almeno una versione non cancellabile.
- `current_version_id` mai NULL dopo migration.
- `number` monotono per documento: cancellando v2, la prossima nuova versione sarà v3 (niente riuso).

## Operations

Tutte esposte come `createServerFn`, shape identica per narrative e screenplay:

| Operation                              | Effetto                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `listVersions(documentId)`             | Ritorna tutte le versioni ordinate per `number` desc.             |
| `createVersionFromScratch(documentId)` | Crea `VERSION-N+1` con `content=""` e la setta attiva.            |
| `duplicateVersion(versionId)`          | Copia `content` della sorgente in `VERSION-N+1`, la setta attiva. |
| `renameVersion(versionId, label)`      | Aggiorna solo `label` (≤ 80 chars, null consentito).              |
| `switchToVersion(versionId)`           | Cambia `current_version_id` del documento.                        |
| `deleteVersion(versionId)`             | Rifiuta se unica o corrente.                                      |
| `saveVersionContent(versionId, text)`  | Scrive `content` della versione. Target dell'auto-save.           |

**Auto-save** resta invariato: debounce 30s (override E2E), ma il target è `currentVersion.content`, non `documents.content`.

## UI

### Toolbar sopra l'editor

Sostituisce il bottone "Save" singolo con un popover "Versions":

```
[ ← Back ]  [ Logline ]  [ Saved 2m ago ]        [ Versions ▼ ]  [ Export PDF ]
```

Il popover `Versions ▼` è l'**unica** UI del sistema (niente drawer separato). Contiene la lista + micro-azioni per riga + azioni globali in fondo:

```
──────────────────────────────────────────────
● VERSION-3 "Final"   (current)       ✎  🗑
○ VERSION-2 "Director notes"          ✎  🗑
○ VERSION-1 "First draft"             ✎  🗑
──────────────────────────────────────────────
+ New version from scratch
🗗 Duplicate current
⇄ Compare versions…
──────────────────────────────────────────────
```

- **Click sulla label** di una versione → `switchToVersion` + chiude popover.
- **✎ (pencil)** inline → attiva inline-edit della label (Enter salva, ESC annulla). Assente per viewer.
- **🗑 (trash)** inline → conferma + `deleteVersion`. Disabled (visivamente dimmed) se la versione è unica o corrente; tooltip esplica il motivo. Assente per viewer.
- **`+ New version from scratch`** → `createVersionFromScratch` + chiude popover.
- **`🗗 Duplicate current`** → `duplicateVersion(currentVersionId)` + chiude.
- **`⇄ Compare versions…`** → apre il diff view.
- Chiude su click outside o ESC.

### Diff view (Compare versions)

Modale full-screen. Due dropdown in alto (Left / Right). Default: left=current, right=precedente.

Rendering side-by-side git-style:

- Due colonne monospace con sfondi distinti.
- Righe identiche → testo neutro.
- Solo a sinistra (rimossa) → sfondo `--color-diff-removed` sx, riga vuota grigia dx.
- Solo a destra (aggiunta) → sfondo `--color-diff-added` dx, riga vuota grigia sx.
- Modificate → contrasto su entrambi, con **intra-line highlight** dei caratteri cambiati.
- Libreria: `diff` (jsdiff). `buildSideBySideDiff(left, right)` in `packages/utils/src/diff.ts`, pure + unit-testata.

Read-only. Chiude con ESC, click fuori, pulsante X.

### Sidebar progetto

Il pattern "inline-versions-in-sidebar" della vecchia 06b **viene rimosso**. Le versioni vivono solo nell'editor (popover + drawer).

## Permissions

- **Read** (listVersions, switchTo, compare, drawer): `canRead` (any project member).
- **Mutate** (create/duplicate/rename/delete/saveContent): `canEdit` (owner + editor, no viewer).

## Migration

Singola migrazione atomica `0004_universal_versioning.sql`:

1. `CREATE TABLE document_versions …`
2. Insert: per ogni riga in `documents` → `INSERT INTO document_versions (document_id, number, content, created_by)` con `number=1`.
3. `ALTER TABLE documents ADD COLUMN current_version_id uuid`; backfill dallo step 2.
4. `ALTER TABLE screenplays ADD COLUMN current_version_id uuid`; backfill: ultima `screenplay_versions` per screenplay, o nuova `number=1` con content corrente se nessuna.
5. `ALTER TABLE screenplay_versions DROP COLUMN is_auto`.

Rollback: non reversibile automaticamente — restore da backup.

## Out of scope (v1)

- Branching (fork paralleli di una versione).
- Version tagging (`release`, `production-lock`). Solo `label` testo libero.
- Permission per-version.
- Esporre `documents.content` legacy al client.
- Merge tool. L'utente copia/incolla dal diff.

## Deferred — funzionalità da fare dopo lo MVP breakdown

Identificate il 2026-04-18 in chiusura del lavoro su 06b. Non bloccano lo spec
10 (breakdown), ma vanno chiuse prima del primo design partner per uniformare
l'esperienza versioning sui due editor.

1. **Anteprima senza switch sui documenti narrativi** — oggi switchToVersion
   sui documenti è distruttivo (cambia `currentVersionId` globale, visibile a
   tutti i collaboratori). Lo screenplay ha già la modalità "viewing" col
   banner di restore. Replicare lo stesso pattern su narrative/outline.

2. **Compare versioni sullo screenplay** — `VersionCompareModal` esiste solo
   nello scope `document`. Per uno screenplay che cresce a colpi di revisione
   è probabilmente più utile lì che sulla logline. Estendere il modal e
   passarlo a `ScreenplayVersionsList`.

3. **"Pinned/canonical" separato da "current"** — il writer vuole marcare una
   versione come "definitiva, da lì partono le altre" senza forzare la
   selezione corrente. Aggiungere `pinnedVersionId` a documents/screenplays
   come campo opzionale, distinto da `currentVersionId`. UI: pin icon sul
   row, badge "definitiva" nel drawer.

## User stories → OHW IDs

Prossimo ID libero: **OHW-248**.

| ID      | User story                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------ |
| OHW-248 | Migration: ogni documento esistente ha esattamente una `VERSION-1` col content legacy                  |
| OHW-249 | Owner apre logline → vede "VERSION-1" nel popover Versions                                             |
| OHW-250 | Owner clicca "New version from scratch" → editor svuota, `VERSION-2` attiva, v1 intatta                |
| OHW-251 | Owner clicca "Duplicate current" → `VERSION-N+1` con content identico, attiva                          |
| OHW-252 | Popover: click matita → inline rename label, Enter salva, persistito su reload                         |
| OHW-253 | Owner switcha a precedente → editor carica quel content, auto-save successivi scrivono su QUELLA       |
| OHW-254 | Delete disabled su unica versione; delete su corrente → errore esplicativo                             |
| OHW-255 | Popover: click outside o ESC chiudono                                                                  |
| OHW-256 | Compare: 2 dropdown, righe neutre / verdi (add) / rosse (remove) / modificate con intra-line highlight |
| OHW-257 | Viewer: popover Versions mostra lista ma New/Duplicate/Rename/Delete assenti                           |
| OHW-258 | Screenplay: stessa UX (popover, drawer, diff); niente più "AUTO-…" nella lista                         |
| OHW-259 | Server: `createVersionFromScratch` rifiuta non-member → ForbiddenError                                 |
| OHW-260 | Diff intra-line: "The cat sat" → "The dog sat" evidenzia solo "cat"/"dog"                              |

## Implementation order (TDD)

**Blocco 1 — dominio puro & diff:**

1. Install `diff` + `@types/diff`.
2. `packages/utils/src/diff.ts`: `buildSideBySideDiff(left, right)` pure + Vitest (identical / add-only / remove-only / modified / intra-line / empty).

**Blocco 2 — DB & migration:**

3. Schema drizzle: `document_versions`, `documents.current_version_id`, `screenplays.current_version_id`, drop `screenplay_versions.is_auto`.
4. Migration SQL + journal entry + seed update.
5. Rebuild `@oh-writers/db`.

**Blocco 3 — server narrative/outline:**

6. `apps/web/app/features/documents/server/versions.server.ts`: `listVersions`, `createVersionFromScratch`, `duplicateVersion`, `renameVersion`, `switchToVersion`, `deleteVersion`, `saveVersionContent`.
7. `getDocument` ritorna content da currentVersion.
8. `saveDocument` → `saveVersionContent` (aggiorna chiamanti).

**Blocco 4 — server screenplay:**

9. Rimuovi `maybeCreateAutoVersion` + chiamanti + `is_auto` ovunque.
10. Aggiungi `currentVersionId` getter. `restoreVersion` → alias `switchToVersion`. Nuove: `createVersionFromScratch`, `duplicateVersion` per screenplay.

**Blocco 5 — UI popover:**

11. `VersionsMenu` (popover): lista con inline rename/delete + azioni globali (new, duplicate, compare). Click-outside + ESC close. Riusato da NarrativeEditor e ScreenplayToolbar.

**Blocco 6 — Compare / Diff:**

13. `VersionCompareModal`: 2 dropdown, render `DiffRow[]`.
14. CSS diff tokens (`--color-diff-added/removed/changed/neutral/intra`).

**Blocco 7 — E2E:**

15. `tests/documents/versioning.spec.ts` OHW-248..257, -259, -260.
16. `tests/editor/screenplay-versioning.spec.ts` OHW-258.

**Blocco 8 — regression & commit.**

## Files touched / created

```
packages/db/drizzle/
└── 0004_universal_versioning.sql                ← NEW + journal

packages/db/src/schema/
├── documents.ts                                  ← +current_version_id
├── document-versions.ts                          ← NEW
└── screenplays.ts                                ← +current_version_id, -is_auto

packages/utils/src/
└── diff.ts                                       ← NEW

apps/web/app/features/documents/
├── server/documents.server.ts                     ← getDocument via current version
├── server/versions.server.ts                      ← NEW
├── hooks/useVersions.ts                           ← NEW
├── components/VersionsMenu.tsx                    ← NEW + .module.css
├── components/VersionCompareModal.tsx             ← NEW + .module.css
└── components/NarrativeEditor.tsx                 ← +Versions menu

apps/web/app/features/screenplay-editor/
├── server/versions.server.ts                      ← rewrite: no auto
├── server/screenplay.server.ts                    ← reads current_version_id
├── components/ScreenplayToolbar.tsx               ← +Versions menu
└── components/VersionsList.tsx                    ← adapt

tests/documents/versioning.spec.ts                 ← NEW
tests/editor/screenplay-versioning.spec.ts         ← NEW

apps/web/package.json + root                       ← +diff, +@types/diff
```

## Open questions

- `documents.content` legacy: preservato dalla migration ma non aggiornato. Decidiamo se aggiungere trigger one-way (version → documents) per coerenza del DB, o lasciarlo stale e rimuoverlo in spec successiva.
- Compare cross-documento (logline v1 vs synopsis v3) non previsto. Aggiungiamo se emerge necessità.
