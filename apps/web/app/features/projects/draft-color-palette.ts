import type { DraftRevisionColor } from "@oh-writers/domain";

export const DRAFT_COLOR_HEX: Record<DraftRevisionColor, string> = {
  white: "#ffffff",
  blue: "#a8c8ff",
  pink: "#ffc6dd",
  yellow: "#fff3a8",
  green: "#bfe8c0",
  goldenrod: "#dab14a",
  buff: "#f1e0c4",
  salmon: "#f5a89a",
  cherry: "#d04e5a",
  tan: "#c9a37a",
};

export const DRAFT_COLOR_LABEL: Record<DraftRevisionColor, string> = {
  white: "White (1st draft)",
  blue: "Blue",
  pink: "Pink",
  yellow: "Yellow",
  green: "Green",
  goldenrod: "Goldenrod",
  buff: "Buff",
  salmon: "Salmon",
  cherry: "Cherry",
  tan: "Tan",
};
