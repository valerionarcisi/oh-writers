import type { Primitive } from "./blocking.types";

export const BLOCKING_TEMPLATE_KEYS = [
  "empty",
  "living_room",
  "restaurant",
  "kitchen",
  "office",
  "bedroom",
  "exterior_street",
  "car_interior",
] as const;
export type BlockingTemplateKey = (typeof BLOCKING_TEMPLATE_KEYS)[number];

export interface BlockingTemplate {
  templateKey: BlockingTemplateKey;
  label: string;
  widthCm: number;
  heightCm: number;
  primitives: Primitive[];
}

const walls = (w: number, h: number): Primitive[] => [
  { type: "wall", x: 0, y: 0, w, h: 50 },
  { type: "wall", x: 0, y: h - 50, w, h: 50 },
  { type: "wall", x: 0, y: 0, w: 50, h },
  { type: "wall", x: w - 50, y: 0, w: 50, h },
];

export const BLOCKING_TEMPLATES: Record<BlockingTemplateKey, BlockingTemplate> = {
  empty: { templateKey: "empty", label: "Vuota", widthCm: 1000, heightCm: 800, primitives: [] },

  living_room: {
    templateKey: "living_room",
    label: "Sala",
    widthCm: 1200,
    heightCm: 900,
    primitives: [
      ...walls(1200, 900),
      { type: "furniture", x: 400, y: 300, w: 250, h: 150, label: "Tavolo", propRef: null },
      { type: "opening", x: 550, y: 0, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 100, y: 0, w: 150, h: 50, kind: "window" },
    ],
  },

  restaurant: {
    templateKey: "restaurant",
    label: "Pizzeria / Ristorante",
    widthCm: 1400,
    heightCm: 1000,
    primitives: [
      ...walls(1400, 1000),
      { type: "furniture", x: 150, y: 180, w: 180, h: 120, label: "Tavolo 1", propRef: null },
      { type: "furniture", x: 450, y: 180, w: 180, h: 120, label: "Tavolo princ.", propRef: null },
      { type: "furniture", x: 750, y: 180, w: 180, h: 120, label: "Tavolo 3", propRef: null },
      { type: "furniture", x: 150, y: 450, w: 180, h: 120, label: "Tavolo 4", propRef: null },
      { type: "furniture", x: 750, y: 450, w: 180, h: 120, label: "Tavolo 5", propRef: null },
      { type: "furniture", x: 80, y: 730, w: 600, h: 80, label: "Banco", propRef: null },
      { type: "opening", x: 1200, y: 950, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 50, y: 80, w: 150, h: 50, kind: "window" },
    ],
  },

  kitchen: {
    templateKey: "kitchen",
    label: "Cucina",
    widthCm: 1000,
    heightCm: 700,
    primitives: [
      ...walls(1000, 700),
      { type: "furniture", x: 50, y: 50, w: 600, h: 100, label: "Piano cucina", propRef: null },
      { type: "furniture", x: 280, y: 260, w: 200, h: 150, label: "Isola", propRef: null },
      { type: "opening", x: 430, y: 650, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 600, y: 0, w: 200, h: 50, kind: "window" },
    ],
  },

  office: {
    templateKey: "office",
    label: "Ufficio",
    widthCm: 1000,
    heightCm: 800,
    primitives: [
      ...walls(1000, 800),
      { type: "furniture", x: 180, y: 150, w: 200, h: 120, label: "Scrivania 1", propRef: null },
      { type: "furniture", x: 520, y: 150, w: 200, h: 120, label: "Scrivania 2", propRef: null },
      { type: "furniture", x: 740, y: 500, w: 150, h: 100, label: "Armadio", propRef: null },
      { type: "opening", x: 400, y: 750, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 50, y: 150, w: 200, h: 50, kind: "window" },
    ],
  },

  bedroom: {
    templateKey: "bedroom",
    label: "Camera da letto",
    widthCm: 900,
    heightCm: 700,
    primitives: [
      ...walls(900, 700),
      { type: "furniture", x: 130, y: 150, w: 350, h: 250, label: "Letto", propRef: null },
      { type: "furniture", x: 580, y: 150, w: 150, h: 100, label: "Armadio", propRef: null },
      { type: "opening", x: 360, y: 650, w: 100, h: 50, kind: "door" },
      { type: "opening", x: 620, y: 0, w: 150, h: 50, kind: "window" },
    ],
  },

  exterior_street: {
    templateKey: "exterior_street",
    label: "Esterno — Strada",
    widthCm: 1600,
    heightCm: 600,
    primitives: [
      { type: "wall", x: 0, y: 0, w: 1600, h: 50 },
      { type: "wall", x: 0, y: 550, w: 1600, h: 50 },
      { type: "furniture", x: 180, y: 70, w: 70, h: 70, label: "Palo", propRef: null },
      { type: "furniture", x: 880, y: 70, w: 70, h: 70, label: "Palo", propRef: null },
    ],
  },

  car_interior: {
    templateKey: "car_interior",
    label: "Interno auto",
    widthCm: 500,
    heightCm: 400,
    primitives: [
      ...walls(500, 400),
      { type: "furniture", x: 75, y: 75, w: 150, h: 130, label: "Guidatore", propRef: null },
      { type: "furniture", x: 275, y: 75, w: 150, h: 130, label: "Passeggero", propRef: null },
      { type: "opening", x: 50, y: 175, w: 50, h: 60, kind: "window" },
      { type: "opening", x: 400, y: 175, w: 50, h: 60, kind: "window" },
    ],
  },
};
