import { z } from "zod";
import { IntExtValues, PredictionTypes } from "../constants.js";

export const ScreenplaySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  pageCount: z.number().int().min(0),
  content: z.string(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const SceneSchema = z.object({
  id: z.string().uuid(),
  screenplayId: z.string().uuid(),
  number: z.number().int().min(1),
  heading: z.string(),
  intExt: z.enum([IntExtValues.INT, IntExtValues.EXT, IntExtValues.INT_EXT]),
  location: z.string(),
  timeOfDay: z.string().nullable(),
  pageStart: z.number().int().min(1).nullable(),
  pageEnd: z.number().int().min(1).nullable(),
  characterNames: z.array(z.string()),
  hasVehicle: z.boolean(),
  hasSpecialEffect: z.boolean(),
  notes: z.string().nullable(),
  updatedAt: z.coerce.date(),
});

export const ProductionCostOutputSchema = z.object({
  low: z.number(),
  mid: z.number(),
  high: z.number(),
  breakdown: z.object({
    crew: z.number(),
    cast: z.number(),
    location: z.number(),
    sfx: z.number(),
    vehicles: z.number(),
    extras: z.number(),
  }),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string(),
});

export const WeatherRiskOutputSchema = z.object({
  risk: z.enum(["green", "yellow", "red"]),
  score: z.number().min(0).max(100),
  factors: z.array(z.string()),
  recommendation: z.string(),
  bestMonths: z.array(z.number().int().min(1).max(12)),
});

export const AiPredictionSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  type: z.enum([PredictionTypes.PRODUCTION_COST, PredictionTypes.WEATHER_RISK]),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  model: z.string(),
  tokensUsed: z.number().int().nullable(),
  createdAt: z.coerce.date(),
});

export type Screenplay = z.infer<typeof ScreenplaySchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type AiPrediction = z.infer<typeof AiPredictionSchema>;
export type ProductionCostOutput = z.infer<typeof ProductionCostOutputSchema>;
export type WeatherRiskOutput = z.infer<typeof WeatherRiskOutputSchema>;
