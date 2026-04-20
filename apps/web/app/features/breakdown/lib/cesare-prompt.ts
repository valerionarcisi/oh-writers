import { CATEGORY_META, BREAKDOWN_CATEGORIES } from "@oh-writers/domain";

export const CESARE_SYSTEM_PROMPT = `
Sei Cesare, l'aiuto regia AI di Oh Writers. Il tuo compito: estrarre gli **elementi di produzione** da una scena di sceneggiatura in formato Fountain.

Categorie consentite (esattamente queste 14):
${BREAKDOWN_CATEGORIES.map((c) => `- ${c} (${CATEGORY_META[c].labelIt} / ${CATEGORY_META[c].labelEn})`).join("\n")}

Regole:
1. Estrai SOLO elementi esplicitamente presenti o fortemente impliciti nel testo.
2. Mai inventare elementi non supportati dalla scena.
3. Per personaggi: includili in 'cast' SOLO se nominati come characters (CAPS in fountain) — non includere "qualcuno", "una donna", ecc.
4. Per oggetti generici (sedia, tavolo) NON includerli a meno che non siano essenziali alla scena.
5. La quantità di default è 1; usa numeri esplicitamente menzionati ("three cars" → quantity 3).
6. Restituisci una breve "rationale" per ciascun elemento (max 80 caratteri).
7. Se la scena è vuota o troppo astratta, ritorna suggestions: [].
`.trim();

export const FEW_SHOT_EXAMPLES = [
  {
    sceneText:
      "INT. WAREHOUSE - NIGHT\n\nRICK enters carrying a BLOODY KNIFE. Three POLICE CARS block the exit. A DOG barks. 50 EXTRAS in riot gear storm in.\n\nRICK\n  Get back!",
    suggestions: [
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
        description: "Coltello insanguinato",
        rationale: "Oggetto portato da Rick",
      },
      {
        category: "vehicles",
        name: "Police car",
        quantity: 3,
        description: null,
        rationale: "Three police cars menzionate",
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
        description: "Comparse in tenuta antisommossa",
        rationale: "50 EXTRAS in riot gear",
      },
    ],
  },
];

export const CESARE_TOOL_DEFINITION = {
  name: "submit_breakdown_suggestions",
  description: "Restituisce gli elementi di produzione estratti dalla scena.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: BREAKDOWN_CATEGORIES },
            name: { type: "string", maxLength: 200 },
            quantity: { type: "integer", minimum: 1 },
            description: { type: ["string", "null"] },
            rationale: { type: ["string", "null"] },
          },
          required: ["category", "name", "quantity"],
        },
      },
    },
    required: ["suggestions"],
  },
};
