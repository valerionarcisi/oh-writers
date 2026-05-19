# Vernissage — Budget intelligence (cap, weekly view, propose flags)

- **Spec**: `docs/specs/30-budget-intelligence.md` (TBD — Wave 3 Agent C)
- **Story**: `vernissage/_stories/budget-intelligence.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-budget-intelligence.spec.ts`
- **Mock scenarios**: `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts`
  - `imposta tetto|fissa il tetto|non superare`
  - `siamo nel budget|siamo dentro budget|quanto rimane`
  - `voci eccessive|voci anomale|cosa costa troppo`
- **Branch**: `main` (Wave 3 — Agent C)
- **Walked at**: <to fill at run time>
- **Target**: `test`

## Cosa è cambiato

- Nuova migrazione `0029_budget_caps.sql` (tabella `budget_caps` con cap globale + per topsheet).
- Nuovi server fn: `getBudgetCaps`, `setBudgetCap`, `removeBudgetCap`, `getBudgetWeeklyOverview`.
- Nuovi tool Cesare in `cesare-tools.ts`: `set_budget_cap`, `evaluate_against_cap`, `propose_excessive_lines_flags`, `propose_missing_lines`.
- Nuovo helper puro `aggregateProductionLinesByWeek` (testato Vitest).
- Nuovi componenti UI: `BudgetCapBar` (barra cap inline editabile) e `BudgetWeeklyView` (timeline + tabella settimanale).
- Nuova tab "Settimane" su `BudgetPage`.
- System prompt aggiornato (`buildBudgetToolsGuidance`) con le quattro nuove capability.

## Screenshot del walk

![Step 1 — pagina budget caricata](screenshots/01-budget-loaded.png)
![Step 2 — Cesare imposta cap a €50.000](screenshots/02-cap-set.png)
![Step 3 — Cesare valuta vs cap](screenshots/03-evaluate-cap.png)
![Step 4 — Cesare segnala voci eccessive](screenshots/04-excessive-lines.png)
![Step 5 — Tab Settimane con timeline](screenshots/05-weekly-view.png)

## Verifica manuale (Valerio)

- [ ] Accesso al test env con `test@ohwriters.dev`
- [ ] Apertura `/projects/<id>/budget`: vedi la barra "Tetto budget" sopra le tab
- [ ] Click sulla barra cap → input numerico inline → digit `50000` → Enter
- [ ] La progress bar appare e mostra `€xxx · restano €yyy`
- [ ] Cesare "Siamo nel budget?" → risposta menziona residuo/tetto
- [ ] Cesare "Ci sono voci eccessive?" → risposta cita voci/media
- [ ] Tab "Settimane" mostra timeline orizzontale con almeno una card OR empty state se schedule mancante
- [ ] Test `[OHW-590..593]` verde con `pnpm test --project=mock-ui cesare-agentic-budget-intelligence`

## Risultato walk script

- Step eseguiti: `<n>/<n>`
- Fallimenti: `<0 | lista>`

## Note

- I tool `propose_excessive_lines_flags` e `propose_missing_lines` sono read-only: Cesare propone, l'utente decide manualmente nei pannelli esistenti (per ora non c'è un bottone "accetta" sul flag — è un suggerimento testuale).
- L'editor cap inline usa react-aria su button/input dove disponibili; il pattern è equivalente agli altri SettingChip della pagina (commit / Escape, focus visibile).
- TODO follow-up (spec-30b): pagina Settings progetto per editare `production_rates` (oggi solo via SQL).
