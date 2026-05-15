# Breakdown · Per Progetto — Audit

## Findings (versione attuale)

`ProjectBreakdownTable.tsx` è una singola tabella piatta con filtri per categoria a chip, search, filtro stato e bulk bar minima (ricategorizza + archivia). Manca:

- **KPI strip**: nessuna overview rapida (totali, % confermati, costo stimato).
- **Raggruppamento per categoria**: tutto in un'unica tabella, scrollabile a fatica con 100+ elementi. La categoria è una colonna, non un raggruppatore.
- **Range scene** (prima/ultima): solo lista dei numeri scena, senza visione "ciclo di vita" dell'elemento nel film.
- **Costo stimato per elemento**: campo non esposto pur essendo l'aggancio naturale con Spec 11c (rate card) e 11d (budget production).
- **Detezione duplicati**: nessun affordance per consolidare "Tavolo" / "tavolo" / "TAVOLO" — è il fastidio n.1 dopo lo spoglio auto+manuale.
- **Bulk azioni povere**: solo `Ricategorizza` e `Archivia`. Mancano `Conferma N`, `Unifica`, `Rinomina`, `Esporta CSV`.
- **Tier cast** visibile solo se il filtro categoria è `cast` esclusivo — UX nascosta.

## Proposta layout (mockup A — typewriter)

1. **Hero + KPI strip** (5 colonne, mono): totali, confermati, pending, obsoleti, costo stimato. Stessa grammatica del resto dell'app.
2. **Card "duplicati rilevati"** non bloccante in cima quando ci sono candidati merge — Cesare-style controller garbato.
3. **Toolbar**: search + chips categoria con counter inline + picker stato/origine + export CSV.
4. **Bulk bar sticky** con tutte le azioni quando ci sono selezioni.
5. **Gruppi per categoria** in card collapsibili: header con dot color, nome italic Fraunces, counter mono, badge "N pending". Ogni gruppo ha la propria mini-table con colonne specifiche per il dominio (Cast → Tier; Props → Descrizione; Locations → Tipo INT/EXT).
6. **Colonne tabella**: `[✓]` · Nome (Fraunces italic + descrizione mono) · Tier/Tipo/Desc · Scene (mono num) · Range (SC.1 → SC.28) · Origine (cesare/regex/manual color-coded) · Stato (pallino + label) · Costo stim (con sotto-info "/ N gg") · `⋯`.

## Dati che servono dal server

Riferimento: `apps/web/app/features/breakdown/server/breakdown.server.ts` → `getProjectBreakdownRows` / `ProjectBreakdownRow`.

Già disponibili: `element`, `totalQuantity`, `scenesPresent[]`, `hasStale`, `hasPending`, `latestSource`, `castTier`.

Da aggiungere:

- `sceneRange: { first: number; last: number }` — derivabile in-server da `scenesPresent`.
- `estimatedCost: { amountCents: number; unit: "day"|"flat"|"item"; quantity: number } | null` — join opzionale con la rate card di progetto (Spec 11c) — null se manca tariffa.
- `duplicateCandidates: Array<{ elementIds: string[]; reason: "case"|"plural"|"levenshtein"; score: number }>` — endpoint dedicato `getBreakdownDuplicateCandidates(projectId, versionId)`, calcolato server-side (case-insensitive, singolare/plurale IT, distanza Levenshtein ≤ 2 sui nomi della stessa categoria).
- `descriptionSnippet: string | null` — già su `breakdownElements.description`, oggi non esposto in `ProjectBreakdownRow`.

## Bulk actions proposte

- **Conferma N** → `bulkSetOccurrenceStatus({ ids, status: "accepted" })` (nuovo).
- **Ricategorizza ▾** → già esiste `bulkUpdateBreakdownElements({ patch: { category } })`.
- **Unifica** → `mergeBreakdownElements({ keepId, mergeIds[] })` (nuovo): sposta tutte le occorrenze su `keepId`, archivia gli altri, mantiene la `description` più lunga.
- **Rinomina…** → modale singolo input, applica patch name a tutti i selezionati (utile dopo merge).
- **Archivia** → già esiste.
- **Esporta CSV** → client-side da `rows` filtrati (no server fn necessaria).

URL state: filtri (`cat`, `status`, `search`, `expanded[]`) tutti in querystring per condivisibilità link.
