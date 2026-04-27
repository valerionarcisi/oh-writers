import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ResultAsync, err } from "neverthrow";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
} from "@oh-writers/db/schema";
import {
  SuggestionListSchema,
  type CesareSuggestion,
} from "@oh-writers/domain";
import { hashText, toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  BreakdownSceneNotFoundError,
  DbError,
  ForbiddenError,
  RateLimitedError,
} from "../breakdown.errors";
import { canEditBreakdown } from "../lib/permissions";
import {
  CESARE_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  CESARE_TOOL_DEFINITION,
} from "../lib/cesare-prompt";
import { checkAndStampRateLimit } from "~/server/rate-limit";
import { mockCesareBreakdownForScene } from "~/mocks/ai-responses";
import { resolveBreakdownAccessByScene } from "./breakdown-access";
import { callHaiku, extractToolUse } from "~/features/ai";

export interface SuggestResult {
  newPending: number;
  totalSuggested: number;
}

const COOLDOWN_MS = 60_000;

const sceneTextOf = (scene: {
  heading: string;
  notes: string | null;
}): string => scene.heading + "\n" + (scene.notes ?? "");

export const suggestBreakdownForScene = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneId: z.string().uuid(),
      screenplayVersionId: z.string().uuid(),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        SuggestResult,
        | BreakdownSceneNotFoundError
        | RateLimitedError
        | ForbiddenError
        | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const sceneResult = await ResultAsync.fromPromise(
        db.query.scenes
          .findFirst({ where: eq(scenes.id, data.sceneId) })
          .then((r) => r ?? null),
        (e) => new DbError("suggest/loadScene", e),
      );
      if (sceneResult.isErr()) return toShape(err(sceneResult.error));
      const scene = sceneResult.value;
      if (!scene)
        return toShape(err(new BreakdownSceneNotFoundError(data.sceneId)));

      const accessResult = await resolveBreakdownAccessByScene(
        db,
        user.id,
        scene.id,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("run cesare")));
      const projectId = accessResult.value.projectId;

      const rateAction = `cesare:scene:${scene.id}`;
      const rateResult = await checkAndStampRateLimit(
        db,
        projectId,
        rateAction,
        COOLDOWN_MS,
      );
      if (rateResult.isErr()) return toShape(err(rateResult.error));

      const sceneText = sceneTextOf(scene);
      const suggestions: CesareSuggestion[] =
        process.env["MOCK_AI"] === "true"
          ? mockCesareBreakdownForScene(sceneText)
          : await callCesare(sceneText);

      const persistResult = await persistSuggestions(db, {
        sceneId: scene.id,
        projectId,
        screenplayVersionId: data.screenplayVersionId,
        suggestions,
        sceneText,
      });
      return toShape(persistResult);
    },
  );

// Real Anthropic call via the shared helper. The helper lazy-imports the
// SDK, so MOCK_AI environments without a key never load it. When MOCK_AI is
// unset and the SDK is missing, the helper's underlying import throws and
// the AnthropicError surfaces here as a thrown error — preserving the prior
// "fail fast on missing setup" contract of this call site.
const TOOL_NAME = "submit_breakdown_suggestions";

const callCesare = async (sceneText: string): Promise<CesareSuggestion[]> => {
  const result = await callHaiku(
    {
      system: CESARE_SYSTEM_PROMPT,
      fewShot: FEW_SHOT_EXAMPLES,
      user: sceneText,
      maxTokens: 1024,
      tools: [CESARE_TOOL_DEFINITION],
      toolChoice: { type: "tool", name: TOOL_NAME },
    },
    "cesare/suggest",
  );
  if (result.isErr()) throw new Error(result.error.message);
  const input = extractToolUse(result.value.content, TOOL_NAME);
  if (input === null) return [];
  const parsed = SuggestionListSchema.safeParse(input);
  return parsed.success ? parsed.data.suggestions : [];
};

const persistSuggestions = (
  db: Db,
  params: {
    sceneId: string;
    projectId: string;
    screenplayVersionId: string;
    suggestions: CesareSuggestion[];
    sceneText: string;
  },
): ResultAsync<SuggestResult, DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      let newPending = 0;
      for (const s of params.suggestions) {
        const [el] = await db
          .insert(breakdownElements)
          .values({
            projectId: params.projectId,
            category: s.category,
            name: s.name,
            description: s.description ?? null,
          })
          .onConflictDoUpdate({
            target: [
              breakdownElements.projectId,
              breakdownElements.category,
              breakdownElements.name,
            ],
            set: { updatedAt: new Date(), archivedAt: null },
          })
          .returning();
        if (!el) continue;
        const existing = await db.query.breakdownOccurrences.findFirst({
          where: and(
            eq(breakdownOccurrences.elementId, el.id),
            eq(
              breakdownOccurrences.screenplayVersionId,
              params.screenplayVersionId,
            ),
            eq(breakdownOccurrences.sceneId, params.sceneId),
          ),
        });
        if (existing) continue;
        await db.insert(breakdownOccurrences).values({
          elementId: el.id,
          screenplayVersionId: params.screenplayVersionId,
          sceneId: params.sceneId,
          quantity: s.quantity,
          cesareStatus: "pending",
        });
        newPending++;
      }
      const hash = hashText(params.sceneText);
      const now = new Date();
      await db
        .insert(breakdownSceneState)
        .values({
          sceneId: params.sceneId,
          screenplayVersionId: params.screenplayVersionId,
          textHash: hash,
          lastCesareRunAt: now,
        })
        .onConflictDoUpdate({
          target: [
            breakdownSceneState.sceneId,
            breakdownSceneState.screenplayVersionId,
          ],
          set: { textHash: hash, lastCesareRunAt: now },
        });
      return { newPending, totalSuggested: params.suggestions.length };
    })(),
    (e) => new DbError("suggest/persist", e),
  );
