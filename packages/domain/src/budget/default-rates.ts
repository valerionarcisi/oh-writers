import type { BreakdownCategory } from "../breakdown/categories.js";

export const RATE_KEYS = [
  "cast_principal_day",
  "cast_supporting_day",
  "extras_day",
  "stunts_day",
  "location_day",
  "vehicle_day",
  "wardrobe_unit",
  "makeup_day",
  "props_unit",
  "sfx_scene",
  "vfx_scene",
  "sound_day",
  "animals_day",
  "equipment_day",
  "set_dress_flat",
] as const;

export type RateKey = (typeof RATE_KEYS)[number];

// Italian industry defaults — ANICA/CCNL baseline, conservative. All EUR.
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

export const CATEGORY_RATE_MAP: Record<BreakdownCategory, RateKey | null> = {
  cast: "cast_principal_day",
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
