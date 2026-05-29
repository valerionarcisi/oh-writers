# Spec 34 — Cesare Agentic Everywhere

> **Superseded for shell layout by [Spec 44](./44-shell-refactor-notion-style.md).** This spec remains authoritative for agentic tools, RAG context, per-page tool sets, and Step-Block UX; defer to Spec 44 for any AppShell layout, BottomDock, or Cesare drawer/state decision.

## Vision

Un solo Cesare. Una sola chat. Capisce dove sei e cosa stai facendo. Quando puoi agire, agisce — non solo risponde.

Modello: **AI ragiona + tools deterministici**. Cesare spiega, contestualizza, suggerisce. I numeri vengono da funzioni pure / DB / API. Nessun calcolo allucinato.

## Pages

### 1. Documents (soggetto / synopsis / outline / treatment)

**Cesare: Scrittore.** Legge il documento corrente + la sceneggiatura collegata via RAG. Propone riscritture mirate.

**Tools:**

- `apply_text_edit(find, replace)` — sostituzione testuale puntuale nel doc corrente (riusa lo stesso pattern di `handleApplyEdit` dello screenplay)
- `expand_section(heading)` — espande la sezione sotto un heading (es. atto II di un treatment) generando 2-3 paragrafi coerenti col resto
- `compress_section(heading, target_words)` — riassume mantenendo i beat chiave
- `suggest_logline_variants()` — non agentico (read-only), ma esposto come quick prompt

**RAG context:**

- Doc corrente completo (logline / synopsis / outline / treatment)
- Tutti i doc del progetto (perché un treatment riusa la synopsis)
- Headings + prime righe di ogni scena della sceneggiatura

**UX:**

- Chat Cesare aperta in pagina, suggerimenti propongono "Applica" come nello screenplay
- Toast "✦ Cesare ha riscritto: [Atto II]" dopo ogni apply

---

### 2. Breakdown — con stima costo per scena

**Cesare: AD + Line Producer.** Tagga automaticamente elementi nello script, stima costo e difficoltà per scena.

**Nuova feature: stima costo per scena**

Quando l'utente clicca su una scena nello ScriptReader, accanto al pannello categorie compare un nuovo blocco:

```
COSTO STIMATO Sc. 3 INT. CUCINA - NOTTE
€ 4.200 / giorno
─────────────────────────────
Cast (2 attori × 1g)    € 1.600
Crew (8 persone × 1g)   € 1.800
Location (riuso Sc.2)    €     0
Equipment + props        €   600
Catering (10 pasti)      €   200
─────────────────────────────
Difficoltà: bassa ●●○○○
Note: dialogo statico, no SFX, no esterni.
       Girabile in continuità con Sc. 2.

[✦ Chiedi a Cesare] [Aggiungi al budget]
```

I numeri vengono da `estimateSceneCost(scene, breakdown, rates)` — funzione pura in `packages/domain` che usa:

- Conteggi dal breakdown (cast occurrences, location count, props/sfx flags)
- Tabella `production_rates` (DB, modificabile via Settings)
- Heuristics su INT/EXT, day/night, presenza di SFX, ecc.

**Tools agentici:**

- `tag_element(scene_number, category, name, quantity?)` — aggiunge un breakdown element + occurrence
- `accept_ghost(occurrence_id)` — accetta un suggerimento ghost (verde tratteggiato)
- `reject_ghost(occurrence_id)` — rifiuta
- `estimate_scene_cost(scene_number)` — chiama la funzione pura, ritorna breakdown
- `add_to_budget(scene_number)` — converte la stima in righe budget reali

**RAG context:**

- Sceneggiatura completa (RAG window ±2 attorno alla scena attiva)
- Tutti i breakdown elements del progetto raggruppati per categoria
- Rates correnti dalla tabella `production_rates`

---

### 3. Schedule — con difficoltà + meteo

**Cesare: AD scheduler.** Sa muovere scene tra giornate, suggerire raggruppamenti, calcolare difficoltà e probabilità di riuscita anche in base al meteo.

**Nuova feature: difficoltà + probabilità per giornata**

Sopra ogni shooting day, un badge:

```
GIORNATA 3 — 15 lug 2026
Difficoltà: ●●●○○ (3/5)
Riuscita stimata: 72% ☀️ → 48% ⛈️
4 scene · 6h previste · 1 location esterna
```

I numeri vengono da:

- `estimateDayDifficulty(day)` — funzione pura: somma di difficoltà delle scene + fattori (cambi location intra-day, cast distinto, esterni notturni)
- `weatherForecast(location, date)` — chiamata Open-Meteo API (gratis, no key) → restituisce `{ rain_probability, temp_min, temp_max, conditions }`
- `estimateSuccessProbability(day, weather)` — formula: base 95% − difficoltà − weather_penalty (se esterni)

**Tools agentici:**

- `move_scene_to_day(scene_number, target_day)` — sposta una strip
- `merge_days(day_a, day_b)` — accorpa due giornate
- `swap_scenes(scene_a, scene_b)` — scambia
- `lock_day(day)` / `unlock_day(day)`
- `get_weather_forecast(location, date)` — chiama Open-Meteo
- `suggest_reorder()` — Cesare propone una nuova sequenza ottimizzata, l'utente può accettare o rifiutare

**RAG context:**

- Schedule corrente completo (tutte le giornate + strip)
- Sceneggiatura per ogni scena schedulata (heading + cast + INT/EXT + time_of_day)
- Location requirement linkati con coordinate
- Vincoli espliciti (locked days, holiday, ecc.)

---

### 4. Budget

**Cesare: Line Producer.** Aggiusta righe budget, propone redistribuzioni, alza/abbassa importi con motivazione.

**Tools agentici:**

- `update_budget_line(line_id, field, value)` — aggiorna `rate`, `quantity`, `actual`, ecc.
- `add_budget_line(top_sheet, description, rate, quantity)` — nuova riga
- `redistribute_topsheet(from_top_sheet, to_top_sheet, amount)` — sposta budget tra categorie
- `analyze_variance()` — non agentico, restituisce un report

**RAG context:**

- Budget completo (top sheets, lines, residui)
- Schedule (giornate previste → costi crew/cast)
- Breakdown (oggetti scena, location, ecc.)
- Sceneggiatura summary (numero scene, INT/EXT split, ecc.)

---

## Architettura comune

### Refactor: tool router per pagina

Estraggo `runToolLoop` da `cesare-tools.ts` (oggi locations-specific) in un modulo generico parametrizzato:

```typescript
// cesare/tools/index.ts
export interface ToolSet {
  definitions: ToolDefinition[];
  executor: (
    block: ToolUseBlock,
    ctx: ToolContext,
  ) => ResultAsync<ToolResult, CesareError>;
}

export const TOOL_SETS_BY_PAGE: Record<CesarePage, ToolSet> = {
  documents: documentsToolSet,
  breakdown: breakdownToolSet,
  budget: budgetToolSet,
  schedule: scheduleToolSet,
  locations: locationsToolSet, // già esistente
  screenplay: { definitions: [], executor: noopExecutor }, // niente tools per ora
};
```

Il sistema prompt aggiunge automaticamente la lista tools della pagina corrente.

### Toast feedback

Già wired in `AppShell.handleCesareAssistantResponse`. Estendere il pattern: ogni tool, dopo successful execution, ritorna un campo `toast_message` che `CesareSheet` propaga al parent.

### Tabella `production_rates` (nuova migrazione)

```sql
CREATE TABLE production_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL,  -- 'cast_lead' | 'cast_supporting' | 'crew_dop' | ...
  rate numeric NOT NULL,
  unit text NOT NULL,      -- 'day' | 'hour' | 'flat'
  created_at timestamp NOT NULL DEFAULT now()
);
```

Default rates seed per progetto al momento della creazione (italiano, IT market).

---

## Tests

Per ogni pagina:

- Vitest: la funzione pura di stima (es. `estimateSceneCost`, `estimateDayDifficulty`)
- Playwright `[OHW-540..570]`: l'utente chiede a Cesare, Cesare esegue tool, UI si aggiorna, toast appare

---

## Out of scope (per ora)

- Voice input
- Cesare proattivo (push notifications quando trova un problema)
- Multi-progetto context (Cesare confronta col tuo storico)
- Settings UI per `production_rates` (in v1 si modifica via DB / seed)
