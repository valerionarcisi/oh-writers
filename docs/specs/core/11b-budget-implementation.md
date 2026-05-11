# Spec 11b — Budget implementation (rule-based, no AI)

> **Status:** in progress — DB schema + domain + server functions done; UI pending
> **Depends on:** Spec 10f (Breakdown table), Spec 11 (Budget product spec)
> **Date:** 2026-05-11

## Approach

No AI in v1. Budget is a **per-resource dashboard** with 4 widget cards:
Cast, Troupe, Attrezzatura & Location, Varie.
Each resource has: giorni × tariffa/giorno + regime fiscale + vitto + pernotto = totale.
Scene chip filter reduces each card to what's present in that scene.
Gauge SVG charts (no external charting library) give visual weight at a glance.
AI (Spec 11c, future) enters only as "suggest rates for this genre/format/region".

---

## UI — Dashboard

### Layout

```
┌─ chip scene ──────────────────────────────────────────────────────┐
│ [Tutte] [Sc.1] [Sc.2] [Sc.3] ...                                 │
│          Giorni ripresa: [12]   Contingenza: [10]%                │
└───────────────────────────────────────────────────────────────────┘

┌─ Totale ──────────────┐  ┌─ Cast ─────────────────────────────── │
│      donut chart      │  │  gauge + lista attori                 │
│   Cast 36%            │  │  Filippo  12g  €800  [privato]  €200  │
│   Troupe 45%          │  │  Tea       8g  €400  [p.iva  ]  €100  │
│   Attrez. 12%         │  │  + Vitto/pernotto subtotale           │
│   Varie   7%          │  └───────────────────────────────────────┘
│   €66.660 grand total │
└───────────────────────┘  ┌─ Troupe ───────────────────────────── │
                           │  gauge + lista ruoli                  │
┌─ Attrezzatura & Loc. ─┐  │  DOP      20g  €600  [p.iva]         │
│  gauge + lista        │  │  Fonico   20g  €350  [p.iva]         │
│  Angolo  12g  €600    │  │  1° AD    22g  €450  [privato]       │
│  VFX      3s  €3.500  │  │  + [Aggiungi ruolo]                  │
└───────────────────────┘  └───────────────────────────────────────┘

┌─ Varie ───────────────────────────────────────────────────────────┐
│  Catering €1.200 │ Trasporti €800 │ Assicurazione €500 │ + Aggiungi│
└───────────────────────────────────────────────────────────────────┘
```

### Filtro per scena

Chip cliccabili `[Tutte] [Sc.1] [Sc.2]...` in header.
Selezionando una scena ogni card mostra solo le risorse presenti in quella scena.
Il costo proporzionale è `totale_risorsa × (scene_risorsa_count / scene_totali_risorsa)`.
I gauge e il totale progetto si aggiornano di conseguenza.
Senza schedule (Spec 12) le scene sono il proxy del giorno di ripresa.

### Gauge SVG

Gauge semicircolare inline SVG — zero librerie esterne.
Ogni card ha il suo gauge che riempie in proporzione al totale della card sul grand total.
Il widget "Totale progetto" ha un donut chart con gli archi colorati per categoria.

---

## Regime fiscale

Ogni riga Cast e Troupe ha un campo `fiscalRegime`:

| Valore    | Significato                                   | Effetto sul totale                                                  |
| --------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `piva`    | L'attore/tecnico fattura con P.IVA            | Costo = imponibile (IVA recuperabile, non la mostro)                |
| `privato` | Privato senza P.IVA                           | Costo lordo = imponibile × 1.20 (ritenuta 20% a carico committente) |
| `none`    | Nessuna tassazione (es. volontario, borsista) | Costo = tariffa netta                                               |

Il tooltip sulla cella "Totale" spiega il calcolo. Il grand total usa sempre il costo lordo reale.

---

## Vitto & Pernotto

Per ogni riga Cast e Troupe, due campi editabili: `mealAllowance` e `accommodation` (totali, non per giorno).
Default suggerito: `mealAllowance = giorni × 25`, `accommodation = 0`.
L'utente li sovrascrive liberamente.

---

## Data model

### Tabelle nuove (migration `0017`)

```sql
-- Cast: una riga per attore (collegato a breakdown_elements)
CREATE TABLE budget_cast (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id         uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  element_id        uuid REFERENCES breakdown_elements(id) ON DELETE SET NULL,
  name              text NOT NULL,          -- copiato da element.name al momento della gen.
  days              numeric NOT NULL DEFAULT 1,
  day_rate          numeric NOT NULL DEFAULT 0,
  fiscal_regime     text NOT NULL DEFAULT 'piva'
                      CHECK (fiscal_regime IN ('piva','privato','none')),
  meal_allowance    numeric NOT NULL DEFAULT 0,
  accommodation     numeric NOT NULL DEFAULT 0,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Troupe: ruoli fissi + custom
CREATE TABLE budget_crew (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id         uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  role_key          text,                   -- null = ruolo custom
  name              text NOT NULL,          -- label italiana del ruolo
  department        text NOT NULL,          -- regia, fotografia, suono, arte, costumi, trucco, produzione
  days              numeric NOT NULL DEFAULT 1,
  day_rate          numeric NOT NULL DEFAULT 0,
  fiscal_regime     text NOT NULL DEFAULT 'piva'
                      CHECK (fiscal_regime IN ('piva','privato','none')),
  meal_allowance    numeric NOT NULL DEFAULT 0,
  accommodation     numeric NOT NULL DEFAULT 0,
  enabled           boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
```

Le tabelle `budget_lines` e `budget_rates` esistenti coprono Attrezzatura & Location e Varie.
`budget_lines.top_sheet` diventa il discriminante: `production` = Attrezzatura, `contingency` = Varie.

### Drizzle schema

`packages/db/src/schema/budget.ts` — aggiunte `budgetCast` e `budgetCrew`.

---

## Ruoli troupe predefiniti (`packages/domain/src/budget/crew-roles.ts`)

```ts
export const CREW_DEPARTMENTS = [
  "regia",
  "fotografia",
  "suono",
  "arte",
  "costumi",
  "trucco",
  "produzione",
] as const;

export const CREW_ROLES = [
  // regia
  {
    key: "first_ad",
    labelIt: "1° Assistente Regia",
    department: "regia",
    defaultDayRate: 450,
  },
  {
    key: "second_ad",
    labelIt: "2° Assistente Regia",
    department: "regia",
    defaultDayRate: 300,
  },
  // fotografia
  {
    key: "dop",
    labelIt: "Direttore della Fotografia",
    department: "fotografia",
    defaultDayRate: 800,
  },
  {
    key: "camera_operator",
    labelIt: "Operatore",
    department: "fotografia",
    defaultDayRate: 450,
  },
  {
    key: "focus_puller",
    labelIt: "1° Assistente Operatore",
    department: "fotografia",
    defaultDayRate: 300,
  },
  {
    key: "gaffer",
    labelIt: "Capo Elettricista",
    department: "fotografia",
    defaultDayRate: 400,
  },
  {
    key: "best_boy",
    labelIt: "Elettricista",
    department: "fotografia",
    defaultDayRate: 250,
  },
  // suono
  {
    key: "sound_mixer",
    labelIt: "Fonico di Presa Diretta",
    department: "suono",
    defaultDayRate: 400,
  },
  {
    key: "boom_operator",
    labelIt: "Microfonista",
    department: "suono",
    defaultDayRate: 250,
  },
  // arte
  {
    key: "production_designer",
    labelIt: "Scenografo",
    department: "arte",
    defaultDayRate: 600,
  },
  {
    key: "art_director",
    labelIt: "Arredatore",
    department: "arte",
    defaultDayRate: 400,
  },
  {
    key: "prop_master",
    labelIt: "Capo Attrezzista",
    department: "arte",
    defaultDayRate: 350,
  },
  // costumi
  {
    key: "costume_designer",
    labelIt: "Costumista",
    department: "costumi",
    defaultDayRate: 450,
  },
  {
    key: "wardrobe_assistant",
    labelIt: "Assistente Costumi",
    department: "costumi",
    defaultDayRate: 250,
  },
  // trucco
  {
    key: "makeup_artist",
    labelIt: "Truccatore/Truccatrice",
    department: "trucco",
    defaultDayRate: 350,
  },
  {
    key: "hair_stylist",
    labelIt: "Parrucchiere/Parrucchiera",
    department: "trucco",
    defaultDayRate: 300,
  },
  // produzione
  {
    key: "production_manager",
    labelIt: "Direttore di Produzione",
    department: "produzione",
    defaultDayRate: 600,
  },
  {
    key: "production_coordinator",
    labelIt: "Segretario/a di Produzione",
    department: "produzione",
    defaultDayRate: 300,
  },
  {
    key: "runner",
    labelIt: "Runner",
    department: "produzione",
    defaultDayRate: 150,
  },
] as const;

export type CrewRoleKey = (typeof CREW_ROLES)[number]["key"];
```

Il regista non è in lista — ha compenso troppo variabile e spesso è il committente stesso.

---

## Calcolo totale per riga

```ts
const fiscalMultiplier = (regime: FiscalRegime): number => {
  if (regime === "privato") return 1.2; // ritenuta 20% a carico committente
  return 1.0; // piva: IVA recuperabile, none: netto
};

const resourceTotal = (r: {
  days: number;
  dayRate: number;
  fiscalRegime: FiscalRegime;
  mealAllowance: number;
  accommodation: number;
}): number =>
  r.days * r.dayRate * fiscalMultiplier(r.fiscalRegime) +
  r.mealAllowance +
  r.accommodation;
```

---

## Server functions nuove / aggiornate

```ts
// Genera cast da breakdown + crew predefinita
generateBudget(projectId)   // già esistente, esteso per popolare budget_cast e budget_crew

// Cast
updateBudgetCastRow({ rowId, patch })   // days, dayRate, fiscalRegime, mealAllowance, accommodation

// Crew
updateBudgetCrewRow({ rowId, patch })   // stessi campi + enabled
addBudgetCrewRow({ budgetId, name, department, ... })  // ruolo custom
removeBudgetCrewRow({ rowId })

// Settings già esistente
updateBudgetSettings({ budgetId, shootingDays, contingencyPercent })
```

---

## Componenti UI (`features/budget/components/`)

```
BudgetPage.tsx              ← layout, chip scene, parametri globali
BudgetPage.module.css
widgets/
  TotalWidget.tsx           ← donut chart SVG + grand total
  CastWidget.tsx            ← gauge + tabella cast
  CrewWidget.tsx            ← gauge + tabella troupe, toggle ruoli fissi
  EquipmentWidget.tsx       ← gauge + tabella attrezzatura/location
  MiscWidget.tsx            ← chip flat + aggiungi voce
  BudgetGauge.tsx           ← gauge SVG riusabile (semicerchio)
  BudgetDonut.tsx           ← donut SVG per widget totale
BudgetResourceRow.tsx       ← riga riusabile cast/crew (EditableCell)
BudgetResourceRow.module.css
```

### BudgetGauge props

```ts
interface BudgetGaugeProps {
  value: number; // valore corrente
  max: number; // grand total del progetto
  color: string; // CSS custom property, es. var(--color-cast)
  label: string; // etichetta sotto il gauge
}
```

SVG inline, `stroke-dashoffset` animato via CSS transition. Nessuna dipendenza esterna.

---

## Tests

### Unit (Vitest)

- `resource-total.test.ts` — fiscalMultiplier, resourceTotal con tutti e tre i regimi
- `crew-roles.test.ts` — tutti i ruoli hanno labelIt, department, defaultDayRate > 0

### E2E (Playwright) — `tests/budget/budget.spec.ts`

- `[OHW-350]` Senza breakdown → "Genera" disabilitato
- `[OHW-351]` Con breakdown → genera → Cast e Troupe popolati
- `[OHW-352]` Modifica €/giorno attore → totale Cast aggiornato live
- `[OHW-353]` Cambia regime "privato" → totale riga ×1.20
- `[OHW-354]` Modifica shooting days → tutte le righe daily ricalcolate
- `[OHW-355]` Seleziona Sc.3 → Cast mostra solo attori presenti in Sc.3
- `[OHW-356]` Aggiungi ruolo custom troupe → appare in widget Troupe

---

## Migration plan

| #   | Cosa                                      | Migration |
| --- | ----------------------------------------- | --------- |
| ✅  | `budgets`, `budget_lines`, `budget_rates` | 0016      |
| ⬜  | `budget_cast`, `budget_crew`              | 0017      |

---

## Out of scope (v1)

- AI rate suggestions (Spec 11c)
- Budget lock / approval workflow
- Export PDF del budget
- Post-produzione (montaggio, color, mix)
- Multi-budget per progetto
- Import da CSV
- Integrazione con shooting schedule (Spec 12) — la usiamo quando esiste
