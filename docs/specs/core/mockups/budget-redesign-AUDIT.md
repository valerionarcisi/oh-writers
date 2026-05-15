# Budget Redesign — Audit & Overview/Drill-down Proposal

_Audit date: 2026-05-15 · Scope: `apps/web/app/features/budget/components/BudgetPage.tsx` + widgets + `budget.server.ts`_

## 1. Findings — what's broken on the current overview

**Hero & KPI**
- `HeroKPI` shows only `grandTotal`. No breakdown vs predicted, no contingency line, no per-phase split (pre/prod/post), no per-scene mean.
- `deltaPercent` is hardcoded `null` (TODO line 269). The "vs preventivo" pill never appears.
- No status indicator (draft / estimated / locked).
- No alert when categories are missing rates (cast/crew totals can silently be 0).

**Category list (view=category)**
- Categories shown as flat buttons with amount + share + fake delta (`mockCategoryDelta`, line 911 — hardcoded).
- No visual weight comparison: a 3 % category looks identical to a 40 % category. Missing a bar/donut.
- Buttons are not actionable (no `onClick` → drill-down).
- Cast/Crew are merged in the same list as production categories but their data model is completely different (resource rows vs aggregated lines).

**Drill-down (view=cast / view=all)**
- "Cast" and "Tutti i reparti" reuse the same `CastWidget` — no per-category drill-down. There is no view for Locations, Fotografia, Scenografia, Veicoli, VFX, etc.
- Drilling into a category currently requires scrolling the global "Voci" table and visually filtering by department badge.

**Voci table**
- Top-12 truncation in `view=category` (line 280) hides data without telling the user.
- No grouping, no totals row, no filter, no search.

**Viewbar**
- 4 segments mixed: vista (`category`/`day`/`all`) + entity drill-down (`cast`). Inconsistent grouping.
- "Per scena" disabled (TODO line 291). "Tariffe" toggle disabled (TODO line 303).

**Mock data leaks**
- `mockCategoryDelta` hardcodes deltas → must die before launch.

## 2. Proposed information architecture

```
Budget
├─ Overview                  ← landing, exec view (Hero + KPI strip + Donut + Cat list)
├─ Cast (drill-down)
├─ Troupe (drill-down per dipartimento)
├─ Production
│   ├─ Locations
│   ├─ Fotografia (equipment)
│   ├─ Suono
│   ├─ Scenografia
│   ├─ Costumi & Trucco
│   ├─ Veicoli
│   ├─ Comparse
│   └─ VFX / SFX
├─ Post-production (placeholder)
└─ Per giornata (day-by-day)
```

Viewbar diventa **2 livelli**: vista (`Panoramica · Per categoria · Per giornata`) + filtro reparto.

## 3. Charts proposed + data already available

| Chart | Where | Server data used |
|---|---|---|
| Donut categorie (% share) | Overview | `totalsByCategory` (già calcolato) |
| KPI strip: Totale · Cast · Crew · Production · Contingency · Δ vs predicted | Overview | `budget.lines` + `castTotal` + `crewTotal` + `contingencyPercent` |
| Bar chart Top-5 reparti per spesa | Overview | `totalsByCategory` ordered |
| Sparkline budget vs giornate | Overview | `getDayCosts` → `DayCost[]` (già disponibile) |
| Heatmap costo per giornata × reparto | Drill-down day | `dayCosts.breakdown` |
| Stacked bar costo per ruolo (Cast) | Drill-down Cast | `castCrew.cast` con `resourceTotal()` |
| Treemap reparti Crew (regia/fotografia/suono/arte/costumi/trucco/produzione) | Drill-down Crew | `castCrew.crew` raggruppato per `department` |
| Donut Location: shooting day per location | Drill-down Production·Locations | `budgetLines.linkedCategory='locations'` + scene→location mapping |

**Server gaps** da colmare (riferimento `budget.server.ts`):
- `getPreviousBudgetSnapshot()` per delta reale (richiesto da `deltaPercent` line 269).
- `getCostByPhase(projectId)` per split pre/prod/post (oggi solo `topSheet` flag su `budgetLines`).
- `getCategoryStatus(projectId, category)` → `{ hasRates: boolean, missingFields: string[] }` per alert overview.
- `getSceneCosts(projectId)` per riattivare "Per scena" (TODO line 291).

## 4. Cosa rimuovere

- `mockCategoryDelta()` (line 911-925) — sostituire con delta reale o nascondere finché lo snapshot non esiste.
- Truncation `slice(0, 12)` su `linesForView` (line 280) — sostituire con virtualizzazione o paginazione esplicita.
- Vista `cast` come segmento separato del viewbar — diventa drill-down "Cast" raggiunto da overview o da breadcrumb.
- Vista `all` ("Tutti i reparti") — superflua una volta che esiste una vera Overview.

## 5. File mockup prodotti

1. `budget-redesign-overview-a.html` — executive view: hero KPI grande, donut prominente, 6 KPI cards, top-5 bar chart, lista categorie cliccabile con sparkline.
2. `budget-redesign-overview-b.html` — dashboard editoriale: tabella categorie con sparkline e progress-bar inline, meno grafica grossa, più densità.
3. `budget-redesign-category-a-cast.html` — drill-down Cast: tabella ruoli con day-rate × giornate, stacked bar per regime fiscale, alert su attori senza rate.
4. `budget-redesign-category-b-crew.html` — drill-down Troupe: 7 reparti come accordion gerarchico, donut reparti, dettaglio ruolo.
5. `budget-redesign-category-c-production.html` — drill-down Production · Locations: tabella per location con scene affiliate, costo/giornata, mappa-substitute, alert missing rate.

## 6. Continuità stilistica

Tutti i mockup ereditano da `budget-redesign-f-ambient.html`:
- palette warm paper (`--paper-1: #f5f3ee`, ink scale, clay+leaf accenti)
- Fraunces display, Inter UI, IBM Plex Mono per numeri/tabline
- `border-inline-start: 3px` color-coded per identificare categoria (cast = `--c-cast` viola, crew = `--c-crew` leaf, locations = `--c-locations` clay, etc.)
- numeri sempre `tabular-nums`, tabline mono per metadati
- nessuna libreria: donut via `conic-gradient`, bar via flexbox.
