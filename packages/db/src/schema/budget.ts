import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  unique,
  bigint,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { breakdownElements } from "./breakdown";

export const RATE_UNITS = ["giornata", "posa", "forfait"] as const;
export type RateUnitDb = (typeof RATE_UNITS)[number];

export const FISCAL_REGIMES = ["piva", "privato", "none"] as const;
export type FiscalRegimeDb = (typeof FISCAL_REGIMES)[number];

export const BUDGET_STATUSES = ["draft", "estimated", "locked"] as const;
export type BudgetStatusDb = (typeof BUDGET_STATUSES)[number];

export const TOP_SHEETS = [
  "above_the_line",
  "production",
  "crew",
  "post_production",
  "contingency",
] as const;
export type TopSheetDb = (typeof TOP_SHEETS)[number];

export const COST_TYPES = [
  "daily",
  "flat",
  "weekly",
  "unit",
  "percentage",
] as const;
export type CostTypeDb = (typeof COST_TYPES)[number];

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("EUR"),
  contingencyPercent: numeric("contingency_percent", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("10"),
  shootingDays: integer("shooting_days"),
  status: text("status", { enum: BUDGET_STATUSES }).notNull().default("draft"),
  generatedAt: timestamp("generated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const budgetLines = pgTable("budget_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  topSheet: text("top_sheet", { enum: TOP_SHEETS }).notNull(),
  name: text("name").notNull(),
  costType: text("cost_type", { enum: COST_TYPES }).notNull(),
  quantity: numeric("quantity"),
  rate: numeric("rate"),
  actual: numeric("actual"),
  notes: text("notes"),
  linkedElementId: uuid("linked_element_id").references(
    () => breakdownElements.id,
    { onDelete: "set null" },
  ),
  linkedCategory: text("linked_category"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const budgetRates = pgTable(
  "budget_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    rateKey: text("rate_key").notNull(),
    value: numeric("value").notNull(),
  },
  (t) => [unique("budget_rates_budget_key_uq").on(t.budgetId, t.rateKey)],
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type BudgetLine = typeof budgetLines.$inferSelect;
export type NewBudgetLine = typeof budgetLines.$inferInsert;
export type BudgetRate = typeof budgetRates.$inferSelect;
export type NewBudgetRate = typeof budgetRates.$inferInsert;

export const budgetCast = pgTable("budget_cast", {
  id: uuid("id").defaultRandom().primaryKey(),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  elementId: uuid("element_id").references(() => breakdownElements.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  days: numeric("days").notNull().default("1"),
  dayRate: numeric("day_rate").notNull().default("0"),
  rateUnit: text("rate_unit", { enum: RATE_UNITS })
    .notNull()
    .default("giornata"),
  fiscalRegime: text("fiscal_regime", { enum: FISCAL_REGIMES })
    .notNull()
    .default("piva"),
  mealAllowance: numeric("meal_allowance").notNull().default("0"),
  accommodation: numeric("accommodation").notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const budgetCrew = pgTable("budget_crew", {
  id: uuid("id").defaultRandom().primaryKey(),
  budgetId: uuid("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  roleKey: text("role_key"),
  name: text("name").notNull(),
  department: text("department").notNull(),
  days: numeric("days").notNull().default("1"),
  dayRate: numeric("day_rate").notNull().default("0"),
  rateUnit: text("rate_unit", { enum: RATE_UNITS })
    .notNull()
    .default("giornata"),
  fiscalRegime: text("fiscal_regime", { enum: FISCAL_REGIMES })
    .notNull()
    .default("piva"),
  mealAllowance: numeric("meal_allowance").notNull().default("0"),
  accommodation: numeric("accommodation").notNull().default("0"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectRateCard = pgTable(
  "project_rate_card",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    rateUnit: text("rate_unit", { enum: RATE_UNITS })
      .notNull()
      .default("giornata"),
    rateValue: numeric("rate_value").notNull().default("0"),
    mealAllowance: numeric("meal_allowance").notNull().default("0"),
    accommodation: numeric("accommodation").notNull().default("0"),
    fiscalRegime: text("fiscal_regime", { enum: FISCAL_REGIMES })
      .notNull()
      .default("piva"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("project_rate_card_project_name_uq").on(t.projectId, t.name)],
);

export type BudgetCast = typeof budgetCast.$inferSelect;
export type NewBudgetCast = typeof budgetCast.$inferInsert;
export type BudgetCrew = typeof budgetCrew.$inferSelect;
export type NewBudgetCrew = typeof budgetCrew.$inferInsert;
export type ProjectRateCard = typeof projectRateCard.$inferSelect;
export type NewProjectRateCard = typeof projectRateCard.$inferInsert;

// ─── Budget caps (Wave 3 — Spec 30) ──────────────────────────────────────────
//
// A `topSheet === null` row is the global cap for the project. A row with a
// non-null `topSheet` is the cap for that single top-sheet bucket. The unique
// index in migration 0029 enforces "one global cap + one per top sheet".
export const budgetCaps = pgTable("budget_caps", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  topSheet: text("top_sheet"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BudgetCap = typeof budgetCaps.$inferSelect;
export type NewBudgetCap = typeof budgetCaps.$inferInsert;
