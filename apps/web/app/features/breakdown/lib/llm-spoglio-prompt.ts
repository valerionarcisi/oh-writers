/**
 * Prompt and tool definition for the Sonnet full-script breakdown
 * (Spec 10g). Kept separate from the per-scene `cesare-prompt.ts` so
 * the two can evolve independently — they have different few-shots,
 * different output shapes (per-scene vs. per-version), and different
 * cache layers.
 */

import { CATEGORY_META, BREAKDOWN_CATEGORIES } from "@oh-writers/domain";

export const LLM_SPOGLIO_SYSTEM_PROMPT = `
Sei Cesare, l'aiuto regia AI di Oh Writers. Il tuo compito: leggere un'intera sceneggiatura in formato Fountain e produrre uno spoglio per ogni scena con gli **elementi di produzione** rilevanti.

Categorie consentite (esattamente queste 14):
${BREAKDOWN_CATEGORIES.map((c) => `- ${c} (${CATEGORY_META[c].labelIt} / ${CATEGORY_META[c].labelEn})`).join("\n")}

Regole:
1. Estrai SOLO elementi esplicitamente presenti o fortemente impliciti nel testo della scena.
2. Mai inventare elementi non supportati dal testo.
3. Per personaggi: includili in 'cast' SOLO se nominati come characters (CAPS in fountain) — non includere "qualcuno", "una donna", ecc.
4. La quantità di default è 1; usa numeri esplicitamente menzionati ("three cars" → quantity 3).
5. Ogni elemento ha un campo "confidence" tra 0.0 e 1.0:
   - >= 0.8 = molto sicuro (verrà importato come accepted)
   - 0.5–0.79 = probabile (verrà importato come pending ghost)
   - < 0.5 = NON includere
6. I nomi vanno in Title Case, nella lingua della sceneggiatura.
7. Una scena vuota o di sola transizione → items: [].
8. Numera le scene partendo da 1, nell'ordine in cui appaiono nello script.
`.trim();

export const LLM_SPOGLIO_TOOL_DEFINITION = {
  name: "submit_full_script_breakdown",
  description:
    "Restituisce lo spoglio per ogni scena dello script, in ordine di apparizione.",
  input_schema: {
    type: "object" as const,
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sceneNumber: { type: "integer", minimum: 1 },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string", enum: BREAKDOWN_CATEGORIES },
                  name: { type: "string", maxLength: 200 },
                  quantity: { type: "integer", minimum: 1 },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
                required: ["category", "name", "quantity", "confidence"],
              },
            },
          },
          required: ["sceneNumber", "items"],
        },
      },
    },
    required: ["scenes"],
  },
};

export const SONNET_MODEL = "claude-sonnet-4-20250514";
export const HAIKU_MODEL = "claude-haiku-3-5-20241022";

/**
 * Maps the LLM-emitted confidence score into the persistence status used
 * by `breakdown_occurrences.cesareStatus`. Centralized so tests can pin
 * the thresholds without duplicating the rule.
 */
export const statusForConfidence = (
  confidence: number,
): "accepted" | "pending" | null => {
  if (!Number.isFinite(confidence)) return null;
  if (confidence >= 0.8) return "accepted";
  if (confidence >= 0.5) return "pending";
  return null;
};
