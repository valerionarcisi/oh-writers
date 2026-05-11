import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { breakdownElements } from "./breakdown";

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
