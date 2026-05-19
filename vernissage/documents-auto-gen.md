# Vernissage — Cesare auto-genera draft di documenti

> Compila questo report dopo aver eseguito `pnpm vernissage:walk` e
> `pnpm vernissage:scaffold`. La walk script genera `screenshots/`,
> `log.json` ed eventualmente `failures.json`: questo file (`report.md`) è il
> documento curato che il revisore legge.

- **Spec**: `docs/specs/29-cesare-ui.md` (Agent B)
- **Story**: `vernissage/_stories/documents-auto-gen.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-documents-gen.spec.ts`
- **Mock scenario**: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts` (`/scrivimi la sinossi/i`, `/genera la logline/i`, `/v2 del soggetto/i`, `/scaletta dal soggetto/i`)
- **Branch**: `main` (Agent B autogen-drafts work)
- **Walked at**: `<ISO timestamp da log.json>`
- **Target**: `dev`

## Cosa è cambiato

- Quattro nuovi tools `propose_logline_from_screenplay`, `propose_synopsis_from_screenplay`, `propose_soggetto_v2`, `propose_scaletta_from_soggetto` registrati nel tool loop di Cesare per le pagine soggetto/synopsis/outline/treatment.
- Ogni propose crea una riga in `document_versions` con `is_draft=true`. Il `NarrativeEditor` mostra un banner sopra l'editor con i pulsanti "Confronta", "Promuovi a attiva", "Scarta".
- Nuove server fns `getDocumentDrafts`, `promoteDocumentDraft`, `discardDocumentDraft` (feature `documents/server/drafts.server.ts`).
- Sistema prompt block C esteso con `buildDocumentGenToolsGuidance` per indirizzare il modello verso i tool quando l'utente chiede "genera/scrivimi/fammi" un documento.

## Screenshot del walk

<!-- I path sono relativi a vernissage/documents-auto-gen/. Il walk script numera i file
01-, 02-, … secondo l'ordine degli step `screenshot` nella story. -->

![Step 1 — pagina sinossi pulita](screenshots/01-synopsis-page-clean.png)
![Step 2 — Cesare sheet aperto](screenshots/02-cesare-open.png)
![Step 3 — banner draft visibile sopra l'editor](screenshots/03-draft-banner-visible.png)

## Verifica manuale (Valerio)

- [ ] Accesso a `http://localhost:3000` con l'utente `test@ohwriters.dev`
- [ ] Apertura della pagina `/projects/00000000-0000-4000-a000-000000000011/synopsis`
- [ ] Chiedi a Cesare "Scrivimi la sinossi" → banner draft appare sopra l'editor
- [ ] Click su "Confronta" → la diff side-by-side compare/scompare correttamente
- [ ] Click su "Promuovi a attiva" → il banner sparisce, il contenuto dell'editor si aggiorna alla bozza promossa, viene creata una versione attiva
- [ ] Click su "Scarta" su una seconda draft → la riga viene eliminata
- [ ] Cambia pagina (`/soggetto`) e chiedi "Fammi un v2 del soggetto più asciutto" → banner v2 compare sulla pagina soggetto
- [ ] Chiedi "Dato il soggetto fammi la scaletta" → banner scaletta compare sulla pagina outline
- [ ] I 4 test `[OHW-575/576/577/578]` sono verdi con `pnpm test --project=mock-ui`

## Risultato walk script

- Step eseguiti: `<n>/<n>`
- Fallimenti: `<0 | lista>`

## Note

- Il propose_soggetto_v2 richiede sia `instruction` che `label`. Senza, il tool
  restituisce errore — il modello viene istruito nel system prompt a fornire
  entrambi.
- Il propose_scaletta_from_soggetto parsa la lista numerata emessa dal modello
  e la converte in `OutlineContent` JSON, mantenendo la struttura "Atto unico /
  Sequenza unica" — la suddivisione in atti reali è lasciata all'utente.
- Quando `MOCK_AI=true` (CI e walk locale), i prompt Sonnet sono cortocircuitati
  da `MOCK_OUTPUTS` in `cesare-document-tools.ts` per evitare chiamate reali.
