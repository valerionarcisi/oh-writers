# Vernissage — Cesare cost foundation (Spec 29)

> Compila questo report dopo aver eseguito `pnpm vernissage:walk` e
> `pnpm vernissage:scaffold`. La walk script genera `screenshots/`,
> `log.json` ed eventualmente `failures.json`: questo file (`report.md`) è il
> documento curato che il revisore legge.

- **Spec**: `docs/specs/29-cesare-ui.md`
- **Story**: `vernissage/_stories/cost-foundation.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-cost-foundation.spec.ts`
- **Mock scenarios**:
  `apps/web/app/features/predictions/_mocks/cesare-tool-loop.mock.ts`
  - `/che dice john nella scena|cosa dice john nella scena|john nella scena 1|dialogo della scena 1/i` → `read_scene`
  - `/^\s*ok\s*$/i` → end_turn ack
- **Branch**: `main`
- **Commits**:
  - `b0dc538` — feat(cesare): prompt caching + lazy-RAG read tools + model tier router
  - `<this commit>` — test(cesare-cost): mock e2e (OHW-560..562) + vernissage report + cost-smoke script
- **Walked at**: `<ISO timestamp da log.json>`
- **Target**: `test`

## Cosa è cambiato

- **Prompt caching**: `buildSystemPrompt` ritorna `SystemPromptBlock[]` con
  `cache_control: ephemeral` sui blocchi statici (ruolo, contesto di
  produzione, tool guidance). Il blocco di stato dinamico (scena attiva,
  finestra di scene, dettaglio budget, locations, shot plans) resta non
  cachato così l'invalidazione segue le mutazioni dell'utente.
- **Lazy-RAG via read-tools**: 7 nuovi tool read-only in
  `cesare-read-tools.ts` (`read_scene`, `read_scene_range`, `read_document`,
  `read_budget_lines`, `read_breakdown`, `read_location_requirement`,
  `read_shooting_day`). La finestra delle scene nel system prompt ora spedisce
  solo heading; il body arriva on-demand via `read_scene(N)`.
- **Model tier router**: `cesare-model-router.ts` (pura) sceglie Haiku per
  domande brevi e Sonnet per imperativi, prompt lunghi (>200 char) o
  conversazioni profonde (>4 turni). Default conservativo: Sonnet.

## Screenshot del walk

<!-- I path sono relativi a vernissage/cost-foundation/. Il walk script numera
i file 01-, 02-, … secondo l'ordine degli step `screenshot` nella story. -->

![Step 1 — Breakdown caricato](screenshots/01-breakdown-loaded.png)
![Step 2 — Cesare sheet aperto](screenshots/02-cesare-open.png)
![Step 3 — Risposta da `read_scene`](screenshots/03-read-scene-reply.png)

## Verifica manuale (Valerio)

- [ ] Avvia il dev server con `CESARE_DEBUG=true pnpm dev`
- [ ] Apri `/projects/00000000-0000-4000-a000-000000000011/screenplay`
- [ ] Apri Cesare e invia "Che pensi?" → nei log del server deve comparire
      `[cesare] tier=haiku model=claude-haiku-4-5-20251001 page=screenplay …`
- [ ] Invia "Aggiungi una nota sul ritmo" → log deve mostrare `tier=sonnet`
- [ ] Invia un messaggio lungo (>200 char) → log deve mostrare `tier=sonnet`
- [ ] Vai su `/projects/.../breakdown`, chiedi "Che dice John nella scena 1?"
      → la rete (DevTools → Network) mostra `askCesare` 200, e la risposta
      contiene la battuta seedata "Non avrei mai dovuto tornare"
- [ ] Apri 5 volte un "ok" sul Cesare delle locations → tutte le 5 risposte
      arrivano, nessuno stallo, nessun errore 5xx
- [ ] I test `[OHW-560]`, `[OHW-561]`, `[OHW-562]` sono verdi con
      `pnpm test --project=mock-ui`

## Risultato walk script

<!-- Riassumi log.json. Se failures.json esiste, elenca quali step hanno fallito
e con quale errore — quello è il segnale per iterare prima della review. -->

- Step eseguiti: `<n>/<n>`
- Fallimenti: `<0 | lista>`

## Verifica costi (cost-smoke, opzionale)

Lo script `scripts/cost-smoke-cesare.ts` esegue 3 interazioni reali contro
l'API Anthropic e produce un report dei token usati (cached read, cached
write, output) con cost projection. Richiede `ANTHROPIC_API_KEY`. Non
eseguire in CI — è opzionale, su richiesta.

- [ ] (Opzionale) `pnpm cost:smoke:cesare` → report salvato in
      `vernissage/cost-foundation/cost-report-<timestamp>.md`
- [ ] Confronto con baseline pre-foundation (all-Sonnet, no cache): da
      compilare manualmente dopo la prima run

## Note

- L'asserzione testuale di OHW-561 dipende dal seed
  (`packages/db/src/seed/fixtures/breakdown-fixtures.ts` — scene 1, notes).
  Se il seed cambia, aggiornare anche lo scenario mock corrispondente.
- Il mock per `/^ok$/i` deve restare specifico: una regex più larga
  (es. `/ok/i`) ruberebbe match agli altri scenari del file.
