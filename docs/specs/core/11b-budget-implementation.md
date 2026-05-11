# Spec 11b — Budget implementation (rule-based, no AI)

> **Status:** todo
> **Depends on:** Spec 10f (Breakdown table), Spec 11 (Budget product spec)
> **Date:** 2026-05-11

## Approach

No AI in v1. Budget lines are computed from breakdown quantities × configurable rate tables.
The user sees where every number comes from and can override any rate or total.
AI (Spec 11c, future) enters only as "suggest rates for this genre/format/region".

## Goal

An AD or producer opens the **Budget** tab on a project, sees a complete cost estimate
broken down by top-sheet category, and can inline-edit any rate or actual value.
The grand total updates live. Export to CSV available.

---

## Algorithm

### Shooting days estimate

```ts
const estimateShootingDays = (
  scenes: number,
  format: ProjectFormat,
): number => {
  // industry rule of thumb: 1 scene ≈ 0.8 days for feature/pilot, 0.5 for short
  const ratio = format === "short" ? 0.5 : 0.8;
  return Math.max(1, Math.round(scenes * ratio));
};
```

User can override `shootingDays` on the budget — stored in `budgets.shooting_days`.

### Line total

```ts
const lineTotal = (line: BudgetLine): number => {
  if (line.actual !== null) return line.actual; // user wins
  if (line.costType === "unit") return line.rate * line.quantity;
  if (line.costType === "daily") return line.rate * line.quantity; // quantity = days
  if (line.costType === "weekly") return line.rate * line.quantity;
  if (line.costType === "flat") return line.rate;
  return 0; // "percentage" lines handled separately at summary level
};
```

### Grand total

```ts
const subtotal = lines
  .filter((l) => l.costType !== "percentage")
  .reduce((s, l) => s + lineTotal(l), 0);

const contingency = subtotal * (budget.contingencyPercent / 100);
const grandTotal = subtotal + contingency;
```

---

## Rate table

Stored in `packages/domain/src/budget/default-rates.ts`.
Italian industry defaults (ANICA/CCNL baseline, conservative).
All values in EUR.

```ts
export type RateKey =
  | "cast_principal_day" // per principal per day
  | "cast_supporting_day"
  | "extras_day" // per extra per day
  | "stunts_day"
  | "location_day" // per location per day
  | "vehicle_day"
  | "wardrobe_unit" // per costume piece
  | "makeup_day" // makeup artist day rate
  | "props_unit"
  | "sfx_scene" // SFX per scene with SFX elements
  | "vfx_scene"
  | "sound_day"
  | "animals_day"
  | "equipment_day" // camera+lighting package per day
  | "set_dress_flat"; // set dressing flat per project

export const DEFAULT_RATES: Record<RateKey, number> = {
  cast_principal_day: 800,
  cast_supporting_day: 400,
  extras_day: 120,
  stunts_day: 1200,
  location_day: 600,
  vehicle_day: 350,
  wardrobe_unit: 150,
  makeup_day: 300,
  props_unit: 80,
  sfx_scene: 2000,
  vfx_scene: 3500,
  sound_day: 400,
  animals_day: 800,
  equipment_day: 1800,
  set_dress_flat: 3000,
};
```

### Breakdown category → rate key mapping

```ts
// used by the generator to pick which rate applies
export const CATEGORY_RATE_MAP: Record<BreakdownCategory, RateKey | null> = {
  cast: "cast_principal_day", // qty = n. principals; see cast tier logic below
  extras: "extras_day",
  stunts: "stunts_day",
  props: "props_unit",
  vehicles: "vehicle_day",
  wardrobe: "wardrobe_unit",
  makeup: "makeup_day",
  sfx: "sfx_scene",
  vfx: "vfx_scene",
  sound: "sound_day",
  animals: "animals_day",
  atmosphere: "extras_day",
  set_dress: "set_dress_flat",
  equipment: "equipment_day",
  locations: "location_day",
};
```

### Cast tier rate override

If a cast element has `castTier`:

- `principal` → `cast_principal_day`
- `supporting` → `cast_supporting_day`
- `day_player` → `cast_supporting_day × 0.6`
- `featured_extra` → `extras_day × 1.5`
- null → `cast_principal_day` (conservative default)

### Quantity logic per cost type

| category   | costType | quantity meaning             |
| ---------- | -------- | ---------------------------- |
| cast       | daily    | shootingDays                 |
| extras     | daily    | totalQuantity × shootingDays |
| stunts     | daily    | shootingDays                 |
| props      | unit     | totalQuantity                |
| vehicles   | daily    | shootingDays                 |
| wardrobe   | unit     | totalQuantity                |
| makeup     | daily    | shootingDays                 |
| sfx / vfx  | unit     | n. scenes with that element  |
| sound      | daily    | shootingDays                 |
| animals    | daily    | shootingDays                 |
| atmosphere | daily    | totalQuantity × shootingDays |
| set_dress  | flat     | 1                            |
| equipment  | daily    | shootingDays                 |
| locations  | daily    | shootingDays                 |

---

## Data model

### DB schema (new tables, migration `0016`)

```sql
-- budgets: one per project (for now — multi-budget later if needed)
CREATE TABLE budgets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  currency            text NOT NULL DEFAULT 'EUR',
  contingency_percent numeric(5,2) NOT NULL DEFAULT 10,
  shooting_days       integer,          -- null = auto from scenes
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','estimated','locked')),
  generated_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)                   -- one budget per project v1
);

-- budget_lines: individual cost lines
CREATE TABLE budget_lines (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id                uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  top_sheet                text NOT NULL
                             CHECK (top_sheet IN
                               ('above_the_line','production','crew',
                                'post_production','contingency')),
  name                     text NOT NULL,
  cost_type                text NOT NULL
                             CHECK (cost_type IN
                               ('daily','flat','weekly','unit','percentage')),
  quantity                 numeric,
  rate                     numeric,
  actual                   numeric,
  notes                    text,
  linked_element_id        uuid REFERENCES breakdown_elements(id)
                             ON DELETE SET NULL,
  linked_category          text,
  sort_order               integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- budget_rates: per-project rate overrides (falls back to DEFAULT_RATES)
CREATE TABLE budget_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  rate_key    text NOT NULL,
  value       numeric NOT NULL,
  UNIQUE (budget_id, rate_key)
);
```

### Domain schemas (`packages/domain/src/budget/schemas.ts`)

```ts
export const BudgetStatusSchema = z.enum(["draft", "estimated", "locked"]);
export const TopSheetSchema = z.enum([
  "above_the_line",
  "production",
  "crew",
  "post_production",
  "contingency",
]);
export const CostTypeSchema = z.enum([
  "daily",
  "flat",
  "weekly",
  "unit",
  "percentage",
]);

export const BudgetLineSchema = z.object({
  id: z.string().uuid(),
  budgetId: z.string().uuid(),
  topSheet: TopSheetSchema,
  name: z.string().min(1).max(200),
  costType: CostTypeSchema,
  quantity: z.number().nullable(),
  rate: z.number().nullable(),
  actual: z.number().nullable(),
  notes: z.string().nullable(),
  linkedElementId: z.string().uuid().nullable(),
  linkedCategory: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  currency: z.string(),
  contingencyPercent: z.number(),
  shootingDays: z.number().int().nullable(),
  status: BudgetStatusSchema,
  generatedAt: z.string().datetime().nullable(),
  lines: z.array(BudgetLineSchema),
});

export const BudgetSummarySchema = z.object({
  aboveTheLine: z.number(),
  production: z.number(),
  crew: z.number(),
  postProduction: z.number(),
  subtotal: z.number(),
  contingency: z.number(),
  grandTotal: z.number(),
});
```

---

## Server functions (`features/budget/server/budget.server.ts`)

```ts
// Generate (or regenerate) budget lines from breakdown
export const generateBudget = createServerFn({ method: "POST" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(...): Promise<ResultShape<Budget, ForbiddenError | DbError>>

// Get budget for project (with lines)
export const getBudget = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(...): Promise<ResultShape<Budget | null, ForbiddenError | DbError>>

// Update a single line (actual value, notes, rate)
export const updateBudgetLine = createServerFn({ method: "POST" })
  .validator(z.object({
    lineId: z.string().uuid(),
    patch: z.object({
      actual:   z.number().nullable().optional(),
      rate:     z.number().nullable().optional(),
      quantity: z.number().nullable().optional(),
      notes:    z.string().nullable().optional(),
    }),
  }))
  .handler(...): Promise<ResultShape<BudgetLine, NotFoundError | ForbiddenError | DbError>>

// Update budget-level settings (shootingDays, contingencyPercent)
export const updateBudgetSettings = createServerFn({ method: "POST" })
  .validator(z.object({
    budgetId:           z.string().uuid(),
    shootingDays:       z.number().int().min(1).nullable().optional(),
    contingencyPercent: z.number().min(0).max(50).optional(),
  }))
  .handler(...): Promise<ResultShape<Budget, NotFoundError | ForbiddenError | DbError>>
```

`generateBudget` logic:

1. Load project (format, genre, locale)
2. Load breakdown rows (`getProjectBreakdownRows`)
3. Estimate `shootingDays` if not overridden
4. Load rate overrides from `budget_rates` (fall back to `DEFAULT_RATES`)
5. For each breakdown element → produce one `BudgetLine`
6. Add fixed lines: equipment/day, set_dress flat
7. Upsert `budgets` row, delete+insert `budget_lines`
8. Return full `Budget`

---

## UI

### Route

`/projects/$id/budget` — new route file `_app.projects.$id_.budget.tsx`

### Components

- **`BudgetPage`** (`features/budget/components/BudgetPage.tsx`)
  - Summary bar (sticky top): above-the-line / below-the-line / subtotal / contingency / **grand total**
  - "Genera preventivo" button (calls `generateBudget`) — disabled if no breakdown
  - "Shooting days" editable field
  - Table grouped by `topSheet`

- **`BudgetTable`** (`features/budget/components/BudgetTable.tsx`)
  - Columns: Nome | Q.tà | Tariffa | Stima (computed) | Effettivo | Note
  - `EditableCell` for Tariffa, Q.tà, Effettivo, Note
  - Computed cell "Stima" = `quantity × rate` (read-only, grey)
  - "Effettivo" cell: when set, row turns white; when null, row shows AI/estimated style (blue-tinted)
  - Group header row per `topSheet` with subtotal

- **`BudgetSummaryBar`** — sticky top strip, 5 numbers + grand total in bold

### No new DS atoms needed — reuses `EditableCell`, `Tag`, existing table patterns.

---

## Feature folder structure

```
features/budget/
├── components/
│   ├── BudgetPage.tsx
│   ├── BudgetPage.module.css
│   ├── BudgetTable.tsx
│   ├── BudgetTable.module.css
│   └── BudgetSummaryBar.tsx
├── hooks/
│   └── useBudget.ts
├── server/
│   └── budget.server.ts
├── lib/
│   └── budget-generator.ts    ← pure: breakdown rows → BudgetLine[]
└── index.ts
```

`budget-generator.ts` is a pure function (no DB calls) — easy to unit test.

---

## Tests

### Unit (Vitest)

- `budget-generator.test.ts` — given N breakdown rows + rates → produces correct lines
  - feature with 10 cast, 5 locations, 3 VFX scenes
  - short film (0.5 ratio)
  - cast tier overrides principal → supporting rate
  - zero breakdown → empty lines (not a crash)

### E2E (Playwright) — `tests/budget/budget.spec.ts`

- `[OHW-350]` Apri Budget tab senza breakdown → bottone "Genera" disabilitato
- `[OHW-351]` Con breakdown presente → "Genera" → tabella con linee per ogni categoria presente
- `[OHW-352]` Modifica "Tariffa" su una riga → totale aggiornato live
- `[OHW-353]` Imposta "Effettivo" → riga diventa bianca, grand total aggiornato
- `[OHW-354]` Modifica shooting days → tutte le righe `daily` si ricalcolano

---

## Migration

- `0016_budget.sql` — crea `budgets`, `budget_lines`, `budget_rates`
- Niente schema breaking. Breakdown immutato.
- Rollout: tab Budget appare solo se `features.budget` flag = true in project settings (rimuovere flag dopo `[OHW-350..354]` tutti verdi su CI per 1 settimana).

---

## Out of scope (v1)

- AI rate suggestions (Spec 11c)
- Multi-budget per progetto (versioni del preventivo)
- PDF export del budget
- Import da CSV
- Budget lock / approval workflow
- Post-production lines (deferred)
- Insurance / story rights lines (user fills manually if needed)
