export const CAST_TIERS = [
  "principal",
  "supporting",
  "day_player",
  "featured_extra",
] as const;

export type CastTier = (typeof CAST_TIERS)[number];

export interface CastTierMeta {
  id: CastTier;
  labelIt: string;
  labelEn: string;
}

export const CAST_TIER_META: Record<CastTier, CastTierMeta> = {
  principal: {
    id: "principal",
    labelIt: "Principale",
    labelEn: "Principal",
  },
  supporting: {
    id: "supporting",
    labelIt: "Comprimario",
    labelEn: "Supporting",
  },
  day_player: {
    id: "day_player",
    labelIt: "Giornaliero",
    labelEn: "Day Player",
  },
  featured_extra: {
    id: "featured_extra",
    labelIt: "Comparsa scelta",
    labelEn: "Featured Extra",
  },
};

// Display order: most prominent first; null/undefined goes last in UI.
export const CAST_TIER_ORDER: readonly CastTier[] = [
  "principal",
  "supporting",
  "day_player",
  "featured_extra",
];
