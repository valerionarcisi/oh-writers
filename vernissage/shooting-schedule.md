# Vernissage — Agent D · Shooting blocking propose + Schedule polish

- **Spec**: implementato in `plans/sorted-nibbling-treehouse.md` § "Agent D"
- **Story**: `vernissage/_stories/shooting-schedule.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-shooting-schedule.spec.ts`
- **Mock scenario**: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts` (`propose_blocking_for_scene`)
- **Branch**: agent-a8627e8685b011ff3
- **Walked at**: TBD
- **Target**: dev

## Cosa è cambiato

- Cesare può proporre un'intera disposizione di blocking 2D (`propose_blocking_for_scene`) + due tool puntuali (`propose_move_actor_position`, `propose_move_camera_pin`). I tool restituiscono ghost-pin senza scrivere a DB.
- BlockingCanvas accetta `proposedChanges` e disegna ghost dashed sopra gli attori/camere esistenti; un pannello `BlockingProposalPanel` (react-aria) ancorato al canvas espone accept/reject per pin o in blocco.
- Schedule: nuovo `getDayLocationWarnings` server fn + helper puro `buildDayLocationWarnings`. `DayLocationWarningBanner` (con dismiss in sessionStorage) compare in ogni giornata che ha scene con location pending/scouting.
- `suggest_reorder` accetta `respect_location_confirmed` e restituisce `locationWarnings`; il system prompt invita Cesare ad attivarlo quando vede location non confermate.
- `DayDifficultyBadge`: font 13px, peso semibold, contrasto su `--ds-text`, sfondo `color-mix` warning per stacco visivo, `aria-label` ricca ("Difficoltà giorno N: medio-alta, 3 punti su 5. Riuscita stimata …").

## Screenshot del walk

![Step 1 — Blocking card aperta](screenshots/01-blocking-card.png)
![Step 2 — Pannello proposta Cesare visibile](screenshots/02-cesare-blocking-proposal.png)

## Verifica manuale (Valerio)

- [ ] Apri `/projects/<id>/shooting-plan`, seleziona una scena, chiedi a Cesare "Suggerisci blocking per questa scena."
- [ ] Verifica che compaiano i ghost-pin (cerchi tratteggiati verdi per gli attori, rettangoli tratteggiati rossi per le camere)
- [ ] Verifica che il pannello "Suggerimento Cesare" mostri lista delle proposte + Accetta tutto / Scarta tutto
- [ ] Premi Accetta tutto e verifica che i pin "permanenti" si aggiornino (chiamate `saveActorPositions` / `saveCameraPin`)
- [ ] Apri `/projects/<id>/schedule`. Se ci sono scene con location pending, verifica che ogni giornata interessata mostri il banner "Questa giornata ha N scene con location non ancora confermate"
- [ ] Dismisia il banner — verifica che resti chiuso fino al refresh del tab
- [ ] Ispeziona un `DayDifficultyBadge` con devtools: `aria-label` deve includere "Difficoltà giorno N", il valore "punti su 5" e "Riuscita stimata"

## Risultato walk script

- Step eseguiti: TBD
- Fallimenti: TBD

## Note

I propose tools NON persistono nulla — la proposta viaggia come marker invisibile `<!--ohw:blocking-proposal:{...}-->` nel reply di Cesare; `CesareSheet` lo decodifica e dispatcha un `CustomEvent("ohw:cesare:blocking-proposal")` su `window`, che `BlockingCard` ascolta per popolare i ghost. È volutamente leggero per non introdurre nuove tabelle.
