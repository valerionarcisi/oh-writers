import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { scenes } from "./scenes";

export const aiPredictions = pgTable("ai_predictions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sceneId: uuid("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["production_cost", "weather_risk"] }).notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output").notNull(),
  model: text("model").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AiPrediction = typeof aiPredictions.$inferSelect;
export type NewAiPrediction = typeof aiPredictions.$inferInsert;
