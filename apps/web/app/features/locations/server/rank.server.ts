import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, okAsync } from "neverthrow";
import { Effect } from "effect";
import {
  locationRequirements,
  locationRequirementScenes,
  scenes,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { extractToolUse, type CallHaikuParams } from "~/features/ai";
import { AiClient, AiClientLayer, toResultAsync } from "~/server/effect";
import { withProjectAccess } from "~/server/pipeline";
import type { ProjectAccessError } from "~/server/access";
import type { Db } from "~/server/db";
import { DbError, LocationRankError } from "../locations.errors";
import { RankOutputSchema, type RankVerdict } from "../locations.schema";
import { mockRankPlaces, type RankablePlace } from "../_mocks/rank.fixtures";

const RankInputSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  places: z
    .array(
      z.object({
        placeId: z.string(),
        name: z.string(),
        types: z.array(z.string()),
        rating: z.number().nullable(),
        priceLevel: z.string().nullable(),
        editorialSummary: z.string().nullable(),
      }),
    )
    .max(25),
});

type RankError = DbError | ProjectAccessError | LocationRankError;

const SCENE_BODY_LIMIT = 600;
const RANK_TOOL_NAME = "rank_places";

const RANK_TOOL = {
  name: RANK_TOOL_NAME,
  description:
    "Rank candidate filming locations by how well each fits the scene's mood.",
  input_schema: {
    type: "object",
    properties: {
      rankings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            placeId: { type: "string" },
            score: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string", description: "One line, Italian." },
          },
          required: ["placeId", "score", "reason"],
        },
      },
    },
    required: ["rankings"],
  },
} as const;

const RANK_SYSTEM_PROMPT = `Sei Cesare, location scout per il cinema italiano.
Ricevi una scena (intestazione + testo) e una lista di posti reali trovati nell'area.
Ordina i posti per quanto si adattano all'ATMOSFERA della scena: tono, luce, energia,
classe del locale (valutazione, fascia di prezzo, descrizione). Dai a ciascuno un
punteggio 0–1 e una riga di motivo in italiano. Considera che il tipo (ristorante/bar)
è già filtrato: tu giudichi il MOOD, non la categoria.`;

/** Load the scene context (headings + trimmed body) for a requirement. */
const loadSceneContext = (
  db: Db,
  requirementId: string,
): ResultAsync<{ name: string; sceneText: string }, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ name: locationRequirements.name })
      .from(locationRequirements)
      .where(eq(locationRequirements.id, requirementId))
      .limit(1),
    (e) => new DbError("rank/loadRequirement", e),
  ).andThen((reqRows) => {
    const name = reqRows[0]?.name ?? "";
    return ResultAsync.fromPromise(
      db
        .select({ heading: scenes.heading, notes: scenes.notes })
        .from(locationRequirementScenes)
        .innerJoin(scenes, eq(scenes.id, locationRequirementScenes.sceneId))
        .where(eq(locationRequirementScenes.requirementId, requirementId)),
      (e) => new DbError("rank/loadScenes", e),
    ).map((sceneRows) => {
      const sceneText = sceneRows
        .map(
          (s) => `${s.heading}\n${(s.notes ?? "").slice(0, SCENE_BODY_LIMIT)}`,
        )
        .join("\n\n");
      return { name, sceneText: `${name}\n${sceneText}` };
    });
  });

const buildUserMessage = (
  sceneText: string,
  places: RankablePlace[],
): string => {
  const placeLines = places
    .map(
      (p) =>
        `id=${p.placeId} | ${p.name} | tipi: ${p.types.join(",")} | rating: ${p.rating ?? "n/d"} | prezzo: ${p.priceLevel ?? "n/d"} | ${p.editorialSummary ?? ""}`,
    )
    .join("\n");
  return `SCENA:\n${sceneText}\n\nPOSTI:\n${placeLines}`;
};

const buildRankCallParams = (
  sceneText: string,
  places: RankablePlace[],
): CallHaikuParams => ({
  system: RANK_SYSTEM_PROMPT,
  fewShot: {},
  user: buildUserMessage(sceneText, places),
  maxTokens: 1024,
  tools: [RANK_TOOL],
  toolChoice: { type: "tool", name: RANK_TOOL_NAME },
});

// Spec 48 W-E6 — the ranking model call routed through the `AiClient` Layer, so
// it inherits the shared W-E3 retry/timeout policy instead of hitting `callHaiku`
// raw (which had none). The model error is re-tagged into `LocationRankError`,
// keeping the failure channel byte-identical. Same Zod validation, same descending
// sort by score.
export const rankWithAiEffect = (
  requirementId: string,
  sceneText: string,
  places: RankablePlace[],
): Effect.Effect<RankVerdict[], LocationRankError, AiClient> =>
  Effect.gen(function* () {
    const ai = yield* AiClient;
    const result = yield* ai
      .callHaiku(buildRankCallParams(sceneText, places), "rankPlacesForScene")
      .pipe(Effect.mapError((e) => new LocationRankError(requirementId, e)));
    const raw = extractToolUse(result.content, RANK_TOOL_NAME);
    const parsed = RankOutputSchema.safeParse(raw);
    return parsed.success
      ? [...parsed.data.rankings].sort((a, b) => b.score - a.score)
      : yield* Effect.fail(new LocationRankError(requirementId, parsed.error));
  });

const rankWithAI = (
  requirementId: string,
  sceneText: string,
  places: RankablePlace[],
): ResultAsync<RankVerdict[], LocationRankError> =>
  toResultAsync(
    rankWithAiEffect(requirementId, sceneText, places).pipe(
      Effect.provide(AiClientLayer),
    ),
  );

/**
 * Rank discovered places by how well they fit the selected scene's mood
 * (spec 37c). On-demand: the UI calls this when the user presses "Ordina per
 * scena". MOCK_AI uses a deterministic heuristic; otherwise one batch Haiku call.
 */
export const rankPlacesForScene = createServerFn({ method: "POST" })
  .validator(RankInputSchema)
  .handler(
    async ({ data }): Promise<ResultShape<RankVerdict[], RankError>> =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db }) =>
          loadSceneContext(db, data.requirementId).andThen((ctx) => {
            const places: RankablePlace[] = data.places;
            if (places.length === 0) return okAsync<RankVerdict[]>([]);
            if (process.env["MOCK_AI"] === "true") {
              return okAsync(mockRankPlaces(ctx.sceneText, places));
            }
            return rankWithAI(data.requirementId, ctx.sceneText, places);
          }),
        ),
      ),
  );
