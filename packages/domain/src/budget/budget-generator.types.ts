import type { TopSheet, CostType } from "./schemas.js";

export interface BreakdownRowInput {
  element: {
    id: string;
    name: string;
    category: string;
    castTier: string | null;
  };
  totalQuantity: number;
  scenesPresent: { sceneId: string }[];
}

export interface ProjectBreakdownInput {
  rows: BreakdownRowInput[];
  shootingDays: number;
}

export interface GeneratedLine {
  topSheet: TopSheet;
  name: string;
  costType: CostType;
  quantity: number;
  rate: number;
  actual: null;
  notes: null;
  linkedElementId: string;
  linkedCategory: string;
  sortOrder: number;
}
