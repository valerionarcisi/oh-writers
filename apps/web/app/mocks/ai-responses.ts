import type { CesareSuggestion } from "@oh-writers/domain";

/**
 * Mock fixture for the full-script Sonnet stream (Spec 10g).
 * Returns one breakdown entry per (1-based) scene number we receive.
 * Used in tests and when MOCK_AI=true.
 *
 * Heuristic: CAPS words in the **body only** become "cast" items with
 * confidence 0.9, up to 3 per scene. The scene heading is intentionally
 * excluded — otherwise slugline tokens like INT/EXT/NOTTE/GIORNO and the
 * location name would all become fake cast members, which is exactly what
 * real Sonnet would never do. A short stoplist also catches Fountain
 * slugline tokens that leak into the body (e.g. "INT/EXT" continuations)
 * and common IT/EN time-of-day markers shouted in action lines.
 *
 * If the body mentions "bottle" / "bottiglia" we also add a high-confidence
 * Bottiglia prop. Deterministic by design.
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

const CAST_STOPWORDS = new Set<string>([
  "INT",
  "EXT",
  "EST",
  "INT/EXT",
  "I/E",
  "DAY",
  "NIGHT",
  "MORNING",
  "EVENING",
  "GIORNO",
  "NOTTE",
  "MATTINA",
  "SERA",
  "POMERIGGIO",
  "ALBA",
  "TRAMONTO",
]);

export const mockFullScriptBreakdown = (
  scenes: { sceneNumber: number; heading: string; body: string }[],
): MockSceneBreakdown[] =>
  scenes.map((scene) => {
    const caps = [
      ...new Set(
        [...scene.body.matchAll(/\b[A-Z]{3,}\b/g)]
          .map((m) => m[0])
          .filter((token) => !CAST_STOPWORDS.has(token)),
      ),
    ].slice(0, 3);
    const items: MockSceneBreakdown["items"] = caps.map((name) => ({
      name: name.charAt(0) + name.slice(1).toLowerCase(),
      category: "cast",
      quantity: 1,
      confidence: 0.9,
    }));
    if (/bottl|bottigli/i.test(scene.body)) {
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
