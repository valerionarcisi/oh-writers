import { describe, it, expect } from "vitest";
import {
  mapSuggestionsToElements,
  type CesareSuggestionLite,
} from "./map-suggestions";

describe("mapSuggestionsToElements", () => {
  it("flattens suggestions into ElementForMatch list", () => {
    const suggestions: CesareSuggestionLite[] = [
      { category: "cast", name: "Bob" },
      { category: "props", name: "knife" },
    ];
    const result = mapSuggestionsToElements(suggestions);
    expect(result).toHaveLength(2);
    const first = result[0];
    expect(first).toMatchObject({
      name: "Bob",
      category: "cast",
      isStale: false,
    });
    expect(first?.id).toContain("suggestion:");
  });

  it("returns empty for empty input", () => {
    expect(mapSuggestionsToElements([])).toEqual([]);
  });
});
