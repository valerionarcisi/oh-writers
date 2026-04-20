export const BREAKDOWN_CATEGORIES = [
  "cast",
  "extras",
  "stunts",
  "props",
  "vehicles",
  "wardrobe",
  "makeup",
  "sfx",
  "vfx",
  "sound",
  "animals",
  "set_dress",
  "equipment",
  "locations",
] as const;

export type BreakdownCategory = (typeof BREAKDOWN_CATEGORIES)[number];

export interface CategoryMeta {
  id: BreakdownCategory;
  labelIt: string;
  labelEn: string;
  colorToken: string;
  icon: string;
}

export const CATEGORY_META: Record<BreakdownCategory, CategoryMeta> = {
  cast: {
    id: "cast",
    labelIt: "Cast",
    labelEn: "Cast",
    colorToken: "--cat-cast",
    icon: "C",
  },
  extras: {
    id: "extras",
    labelIt: "Comparse",
    labelEn: "Extras",
    colorToken: "--cat-extras",
    icon: "E",
  },
  stunts: {
    id: "stunts",
    labelIt: "Stunt",
    labelEn: "Stunts",
    colorToken: "--cat-stunts",
    icon: "ST",
  },
  props: {
    id: "props",
    labelIt: "Oggetti",
    labelEn: "Props",
    colorToken: "--cat-props",
    icon: "P",
  },
  vehicles: {
    id: "vehicles",
    labelIt: "Veicoli",
    labelEn: "Vehicles",
    colorToken: "--cat-vehicles",
    icon: "V",
  },
  wardrobe: {
    id: "wardrobe",
    labelIt: "Costumi",
    labelEn: "Wardrobe",
    colorToken: "--cat-wardrobe",
    icon: "W",
  },
  makeup: {
    id: "makeup",
    labelIt: "Trucco",
    labelEn: "Makeup/Hair",
    colorToken: "--cat-makeup",
    icon: "M",
  },
  sfx: {
    id: "sfx",
    labelIt: "Effetti spec.",
    labelEn: "SFX",
    colorToken: "--cat-sfx",
    icon: "SFX",
  },
  vfx: {
    id: "vfx",
    labelIt: "VFX",
    labelEn: "VFX",
    colorToken: "--cat-vfx",
    icon: "VFX",
  },
  sound: {
    id: "sound",
    labelIt: "Suono",
    labelEn: "Sound FX",
    colorToken: "--cat-sound",
    icon: "SND",
  },
  animals: {
    id: "animals",
    labelIt: "Animali",
    labelEn: "Animals",
    colorToken: "--cat-animals",
    icon: "A",
  },
  set_dress: {
    id: "set_dress",
    labelIt: "Scenografia",
    labelEn: "Set Dressing",
    colorToken: "--cat-set-dress",
    icon: "SD",
  },
  equipment: {
    id: "equipment",
    labelIt: "Attrezzatura",
    labelEn: "Sp. Equip.",
    colorToken: "--cat-equipment",
    icon: "EQ",
  },
  locations: {
    id: "locations",
    labelIt: "Location",
    labelEn: "Locations",
    colorToken: "--cat-locations",
    icon: "L",
  },
};
