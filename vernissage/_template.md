# Vernissage — <feature title>

> Compila questo report dopo aver eseguito `pnpm vernissage:walk` e
> `pnpm vernissage:scaffold`. La walk script genera `screenshots/`,
> `log.json` ed eventualmente `failures.json`: questo file (`report.md`) è il
> documento curato che il revisore legge.

- **Spec**: `docs/specs/NN-<feature>.md`
- **Story**: `vernissage/_stories/<id>.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-<id>.spec.ts`
- **Mock scenario**: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts` (`<scenario-match>`)
- **Branch**: `<feature-branch>`
- **Walked at**: `<ISO timestamp da log.json>`
- **Target**: `dev | test`

## Cosa è cambiato

- <bullet 1>
- <bullet 2>
- <bullet 3>

## Screenshot del walk

<!-- I path sono relativi a vernissage/<story-id>/. Il walk script numera i file
01-, 02-, … secondo l'ordine degli step `screenshot` nella story. -->

![Step 1 — descrizione](screenshots/01-...png)
![Step 2 — descrizione](screenshots/02-...png)
![Step 3 — descrizione](screenshots/03-...png)

## Verifica manuale (Valerio)

- [ ] Accesso a `<base-url>` con l'utente della story
- [ ] Apertura della pagina `<url>`
- [ ] Esecuzione dello scenario Cesare (riassunto in una riga)
- [ ] Verifica della risposta di Cesare, dell'edit applicato/proposto e del toast
- [ ] Il test `[OHW-XXX]` è verde con `pnpm test --project=mock-ui`

## Risultato walk script

<!-- Riassumi log.json. Se failures.json esiste, elenca quali step hanno fallito
e con quale errore — quello è il segnale per iterare prima della review. -->

- Step eseguiti: `<n>/<n>`
- Fallimenti: `<0 | lista>`

## Note

<spazio per appunti, decisioni, follow-up>
