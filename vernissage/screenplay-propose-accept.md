# Vernissage — Cesare propose/accept on the screenplay editor

> Compila questo report dopo aver eseguito `pnpm vernissage:walk` e
> `pnpm vernissage:scaffold`. La walk script genera `screenshots/`,
> `log.json` ed eventualmente `failures.json`: questo file (`report.md`) è il
> documento curato che il revisore legge.

- **Spec**: `docs/specs/34-cesare-agentic-everywhere.md`
- **Story**: `vernissage/_stories/screenplay-propose-accept.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-screenplay.spec.ts`
- **Mock scenarios**: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts` (`rendi questa scena|più tesa` / `fammi una v2|riscrivi tutto` / `rinomina giulio`)
- **Branch**: `cesare-screenplay-propose-accept`
- **Walked at**: `<ISO timestamp da log.json>`
- **Target**: `dev | test`

## Cosa è cambiato

- Aggiunti 3 tool agentici sulla sceneggiatura: `propose_screenplay_edit` (micro),
  `propose_screenplay_revision` (macro, crea draft + banner), `propose_rename_entity`
  (rinomina whole-word in blocco).
- Nuovo plugin ProseMirror `proposed-edit-decoration` che renderizza un overlay
  inline con bottoni ✓/✕ e applica la modifica in una singola transazione PM
  (Cmd+Z annulla in un passo).
- Nuova migrazione `0028_draft_versions.sql` con colonna `is_draft` su
  `screenplay_versions` e `document_versions`.
- Server function `getScreenplayProposals` + helper di accept/discard del draft.

## Screenshot del walk

<!-- I path sono relativi a vernissage/<story-id>/. Il walk script numera i file
01-, 02-, … secondo l'ordine degli step `screenshot` nella story. -->

![Step 1 — editor caricato](screenshots/01-screenplay-loaded.png)
![Step 2 — Cesare aperto](screenshots/02-cesare-open.png)
![Step 3 — overlay proposta micro-edit](screenshots/03-proposal-overlay.png)
![Step 4 — modifica applicata in-place](screenshots/04-edit-applied.png)
![Step 5 — banner draft macro-edit](screenshots/05-draft-banner.png)

## Verifica manuale (Valerio)

- [ ] Accesso a `<base-url>` con l'utente `test@ohwriters.dev`
- [ ] Apertura della pagina `/projects/00000000-0000-4000-a000-000000000011/screenplay`
- [ ] Esecuzione dello scenario Cesare: "Rendi questa scena più tesa." → overlay ✓/✕
- [ ] Click su ✓ → la modifica è applicata, l'overlay scompare, lampeggia il range
- [ ] Esecuzione del secondo scenario: "Fammi una v2 più corta." → appare il banner draft
- [ ] Click su "Apri il diff →" → la pagina diff side-by-side carica le due versioni
- [ ] Click su "Promuovi a attiva" → la versione draft diventa quella attiva
- [ ] Esecuzione del terzo scenario: "Rinomina Giulio in Lucia." → tutte le occorrenze sono evidenziate
- [ ] Click su ✓ del rename → ogni occorrenza viene sostituita, Cmd+Z le ripristina tutte
- [ ] Il test `[OHW-570]`, `[OHW-571]`, `[OHW-572]` è verde con `pnpm test --project=mock-ui`

## Risultato walk script

<!-- Riassumi log.json. Se failures.json esiste, elenca quali step hanno fallito
e con quale errore — quello è il segnale per iterare prima della review. -->

- Step eseguiti: `<n>/<n>`
- Fallimenti: `<0 | lista>`

## Cost smoke

Coperto dal cost-smoke globale (`pnpm cost:smoke:agentic`), che esercita
tutti i flow agentici inclusi i tre tool della sceneggiatura.

## Note

- I propose-\* sono ephemeral: vivono in una mappa in-memory per processo,
  così non sporcano la DB. Riavvio del server = proposte azzerate (acceptable,
  l'utente ri-chiede a Cesare).
- Il PM plugin usa decorazione widget + inline highlight; auto-collassa la
  bubble alla prima accettazione.
