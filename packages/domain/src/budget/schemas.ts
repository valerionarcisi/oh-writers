import { z } from "zod";

export const BudgetStatusSchema = z.enum(["draft", "estimated", "locked"]);
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const TopSheetSchema = z.enum([
  "above_the_line",
  "production",
  "crew",
  "post_production",
  "contingency",
]);
export type TopSheet = z.infer<typeof TopSheetSchema>;

export const CostTypeSchema = z.enum([
  "daily",
  "flat",
  "weekly",
  "unit",
  "percentage",
]);
export type CostType = z.infer<typeof CostTypeSchema>;

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
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

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
export type Budget = z.infer<typeof BudgetSchema>;

export const BudgetSummarySchema = z.object({
  aboveTheLine: z.number(),
  production: z.number(),
  crew: z.number(),
  postProduction: z.number(),
  subtotal: z.number(),
  contingency: z.number(),
  grandTotal: z.number(),
});
export type BudgetSummary = z.infer<typeof BudgetSummarySchema>;
