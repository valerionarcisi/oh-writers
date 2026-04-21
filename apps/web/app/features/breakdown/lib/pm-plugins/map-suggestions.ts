import type { BreakdownCategory } from "@oh-writers/domain";
import type { ElementForMatch } from "./find-occurrences";

export interface CesareSuggestionLite {
  category: BreakdownCategory;
  name: string;
}

export function mapSuggestionsToElements(
  suggestions: CesareSuggestionLite[],
): ElementForMatch[] {
  return suggestions.map((s, i) => ({
    id: `suggestion:${i}:${s.category}:${s.name}`,
    name: s.name,
    category: s.category,
    isStale: false,
  }));
}
