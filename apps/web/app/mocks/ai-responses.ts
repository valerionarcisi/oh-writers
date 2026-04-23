import type { CesareSuggestion } from "@oh-writers/domain";

/**
 * Mock fixture for the full-script Sonnet stream (Spec 10g).
 * Returns one breakdown entry per (1-based) scene number we receive.
 * Used in tests and when MOCK_AI=true.
 *
 * Heuristic: every CAPS word becomes a "cast" item with confidence 0.9,
 * up to 3 per scene. If the body mentions "bottle" / "bottiglia" we
 * also add a high-confidence Bottiglia prop. Deterministic by design.
 */
export interface MockSceneBreakdown {
  sceneNumber: number;
  items: {
    name: string;
    category: string;
    quantity: number;
    confidence: number;
  }[];
}

export const mockFullScriptBreakdown = (
  scenes: { sceneNumber: number; heading: string; body: string }[],
): MockSceneBreakdown[] =>
  scenes.map((scene) => {
    const text = `${scene.heading}\n${scene.body}`;
    const caps = [
      ...new Set([...text.matchAll(/\b[A-Z]{3,}\b/g)].map((m) => m[0])),
    ].slice(0, 3);
    const items: MockSceneBreakdown["items"] = caps.map((name) => ({
      name: name.charAt(0) + name.slice(1).toLowerCase(),
      category: "cast",
      quantity: 1,
      confidence: 0.9,
    }));
    if (/bottl|bottigli/i.test(text)) {
      items.push({
        name: "Bottiglia",
        category: "props",
        quantity: 1,
        confidence: 0.85,
      });
    }
    return { sceneNumber: scene.sceneNumber, items };
  });

export const mockCesareBreakdownForScene = (
  sceneText: string,
): CesareSuggestion[] => {
  const text = sceneText.toLowerCase();
  if (text.includes("warehouse") && text.includes("rick")) {
    return [
      {
        category: "cast",
        name: "Rick",
        quantity: 1,
        description: null,
        rationale: "Personaggio con dialogo",
      },
      {
        category: "props",
        name: "Bloody knife",
        quantity: 1,
        description: null,
        rationale: "Oggetto portato",
      },
      {
        category: "vehicles",
        name: "Police car",
        quantity: 3,
        description: null,
        rationale: "Three police cars",
      },
      {
        category: "animals",
        name: "Dog",
        quantity: 1,
        description: null,
        rationale: "A dog barks",
      },
      {
        category: "extras",
        name: "Riot squad",
        quantity: 50,
        description: null,
        rationale: "50 EXTRAS in riot gear",
      },
    ];
  }
  const caps = [
    ...new Set([...sceneText.matchAll(/\b[A-Z]{3,}\b/g)].map((m) => m[0])),
  ];
  return caps.slice(0, 3).map((name) => ({
    category: "cast" as const,
    name: name.charAt(0) + name.slice(1).toLowerCase(),
    quantity: 1,
    description: null,
    rationale: "CAPS heuristic",
  }));
};
