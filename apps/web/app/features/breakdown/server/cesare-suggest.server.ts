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
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  BreakdownRateLimitedError,
  BreakdownSceneNotFoundError,
  DbError,
  ForbiddenError,
} from "../breakdown.errors";
import { canEditBreakdown } from "../lib/permissions";
import { hashSceneText } from "../lib/hash-scene";
import {
  CESARE_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  CESARE_TOOL_DEFINITION,
} from "../lib/cesare-prompt";
import { checkAndStampRateLimit } from "../lib/rate-limit";
import { mockCesareBreakdownForScene } from "~/mocks/ai-responses";
import { resolveBreakdownAccessByScene } from "./breakdown-access";

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
        | BreakdownRateLimitedError
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

const callCesare = async (sceneText: string): Promise<CesareSuggestion[]> => {
  // Fail fast with a readable message when the key is missing — otherwise the
  // SDK throws an opaque "Could not resolve authentication method" deep in the
  // call stack. Set MOCK_AI=true in dev if you don't want to call the API.
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || apiKey.length === 0) {
    throw new Error(
      "ANTHROPIC_API_KEY non configurata. Imposta la chiave in apps/web/.env oppure MOCK_AI=true.",
    );
  }
  // Real Anthropic call. Lazy-imported via string identifier so the SDK stays
  // optional in environments that only run with MOCK_AI=true (CI, local dev
  // without a key).
  const sdkModule = "@anthropic-ai/sdk";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any = await import(/* @vite-ignore */ sdkModule);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Anthropic = (sdk.default ?? sdk) as any;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: CESARE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: JSON.stringify(FEW_SHOT_EXAMPLES),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CESARE_TOOL_DEFINITION],
    tool_choice: { type: "tool", name: "submit_breakdown_suggestions" },
    messages: [{ role: "user", content: sceneText }],
  });
  const toolUse = response.content.find(
    (b: { type: string }) => b.type === "tool_use",
  );
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const parsed = SuggestionListSchema.safeParse(toolUse.input);
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
      const hash = hashSceneText(params.sceneText);
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
