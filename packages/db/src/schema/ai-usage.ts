import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Spec 83 (Wave 1) — the AI cost ledger. Every real (non-mock) model call
// records one row here: what triggered it, which model, and the computed
// cost. This is the "stop the bleed" telemetry the cost diagnosis found
// missing (Langfuse ran a single day; no ledger, no kill switch). The daily
// budget guard (`assertDailyBudget`) sums `cost_usd` over this table.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    operation: text("operation").notNull(),
    model: text("model").notNull(),
    trigger: text("trigger", { enum: ["user", "background"] }).notNull(),
    // BYOK preparation (Spec 84 will wire per-user attribution). Nullable:
    // most Wave 1 call sites do not thread a userId through yet. set null on
    // delete so a deleted user does not take historical cost rows with it.
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Spec 84 (Wave 3) — which account paid: the platform key (onboarding
    // trial) or the user's own BYOK provider. Scopes the trial-quota SUM to
    // platform-funded spend only, so BYOK usage never counts against it.
    source: text("source", { enum: ["platform", "user"] })
      .notNull()
      .default("platform"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull(),
  },
  (t) => [
    index("ai_usage_created_at_idx").on(t.createdAt),
    index("ai_usage_user_id_idx").on(t.userId),
  ],
);

export type AiUsageRow = typeof aiUsage.$inferSelect;
export type NewAiUsageRow = typeof aiUsage.$inferInsert;
