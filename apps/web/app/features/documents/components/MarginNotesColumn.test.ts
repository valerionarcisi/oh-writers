// apps/web/app/features/documents/components/MarginNotesColumn.test.ts
//
// Spec 64 — the prompt that seeds a Cesare session from a margin suggestion.
// Pins the contract the floating chat receives: "category: message" so Cesare
// starts working on exactly that point.
import { describe, it, expect } from "vitest";
import { suggestionPrompt } from "./MarginNotesColumn";
import type { NarrativePolishSuggestion } from "../server/narrative-polish.server";

const memo = (
  over: Partial<NarrativePolishSuggestion> = {},
): NarrativePolishSuggestion => ({
  id: "s1",
  group: "Struttura",
  category: "Arco narrativo",
  message: "Il climax arriva troppo presto.",
  ...over,
});

describe("suggestionPrompt", () => {
  it("joins category and message so Cesare gets the full point", () => {
    expect(suggestionPrompt(memo())).toBe(
      "Arco narrativo: Il climax arriva troppo presto.",
    );
  });

  it("reflects the specific suggestion's text", () => {
    expect(
      suggestionPrompt(memo({ category: "Tono", message: "Troppo lirico." })),
    ).toBe("Tono: Troppo lirico.");
  });
});
