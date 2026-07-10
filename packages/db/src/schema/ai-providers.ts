import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// Spec 84 — per-user BYOK provider configuration. One row per user: which
// provider they connected, their API key (encrypted at rest, see
// features/ai-providers/crypto.server.ts), and their chosen model pair.
// `models` is nullable — it stays null until the connect wizard's step 3,
// where the user picks from the LIVE catalogue (Spec 84 §3: no model ID is
// ever hardcoded as a default). The gateway (Spec 83 Wave 2) resolves
// ModelIntent.tier through this row per user.
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["openrouter", "anthropic"] }).notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    keyLast4: text("key_last4").notNull(),
    // { fast: string; quality: string } — tier -> concrete model ID, a user
    // choice snapshot from the live catalogue, never a code constant. Tier
    // keys are ROLES (budget vs quality), not model names.
    models: jsonb("models").$type<{ fast: string; quality: string }>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ai_providers_user_id_key").on(t.userId)],
);

export type AiProviderRow = typeof aiProviders.$inferSelect;
export type NewAiProviderRow = typeof aiProviders.$inferInsert;
