// apps/web/app/features/documents/components/MarginNotesColumn.test.ts
//
// Spec 64 — the prompt that seeds a Cesare session from a margin suggestion.
// Pins the contract the floating chat receives: "title: body" so Cesare
// starts working on exactly that point.
import { describe, it, expect } from "vitest";
import { suggestionPrompt } from "./MarginNotesColumn";
import type { NarrativePolishSuggestion } from "../server/narrative-polish.server";

const memo = (
  over: Partial<NarrativePolishSuggestion> = {},
): NarrativePolishSuggestion => ({
  id: "s1",
  area: "structure",
  title: "Arco narrativo",
  body: "Il climax arriva troppo presto.",
  type: "risk",
  severity: "medium",
  ...over,
});

describe("suggestionPrompt", () => {
  it("joins title and body so Cesare gets the full point", () => {
    expect(suggestionPrompt(memo())).toBe(
      "Arco narrativo: Il climax arriva troppo presto.",
    );
  });

  it("reflects the specific suggestion's text", () => {
    expect(
      suggestionPrompt(memo({ title: "Tono", body: "Troppo lirico." })),
    ).toBe("Tono: Troppo lirico.");
  });
});
