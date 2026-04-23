/**
 * LLM-at-import full breakdown (Spec 10g).
 *
 * `streamFullSpoglio` runs Sonnet over the full screenplay text of a
 * single version, parses the streamed tool_use input scene by scene
 * (see `parse-scene-stream.ts`), and persists each scene's items to
 * `breakdown_elements` + `breakdown_occurrences`. Progress is recorded
 * on `breakdown_version_state` so the client polling endpoint
 * `getSpoglioProgress` can drive the UI banner without a websocket.
 *
 * `MOCK_AI=true` short-circuits the Anthropic call with a deterministic
 * fixture so tests and CI never touch the real API.
 */

import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownVersionState,
  scenes,
  screenplayVersions,
  BREAKDOWN_CATEGORIES,
  type BreakdownCategoryDb,
  type CesareStatusDb,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  BreakdownVersionNotFoundError,
  DbError,
  ForbiddenError,
  LlmSpoglioFailedError,
} from "../breakdown.errors";
import { canEditBreakdown } from "../lib/permissions";
import { resolveBreakdownAccessByScreenplayVersion } from "./breakdown-access";
import {
  extractCompleteScenes,
  type ParsedSceneRaw,
} from "../lib/parse-scene-stream";
import {
  LLM_SPOGLIO_SYSTEM_PROMPT,
  LLM_SPOGLIO_TOOL_DEFINITION,
  SONNET_MODEL,
  statusForConfidence,
} from "../lib/llm-spoglio-prompt";
import { mockFullScriptBreakdown } from "~/mocks/ai-responses";

export interface StreamFullSpoglioResult {
  scenesProcessed: number;
  modelUsed: string;
  cached: boolean;
}

export interface SpoglioProgress {
  scenesDone: number;
  scenesTotal: number | null;
  isComplete: boolean;
  modelUsed: string | null;
}

const sceneTextOf = (scene: {
  heading: string;
  notes: string | null;
}): string => `${scene.heading}\n${scene.notes ?? ""}`;

const isAllowedCategory = (raw: unknown): raw is BreakdownCategoryDb =>
  typeof raw === "string" &&
  (BREAKDOWN_CATEGORIES as readonly string[]).includes(raw);

// ──────────────────────────────────────────────────────────────────────
// streamFullSpoglio
// ──────────────────────────────────────────────────────────────────────

export const streamFullSpoglio = createServerFn({ method: "POST" })
  .validator(z.object({ screenplayVersionId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        StreamFullSpoglioResult,
        | BreakdownVersionNotFoundError
        | ForbiddenError
        | LlmSpoglioFailedError
        | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveBreakdownAccessByScreenplayVersion(
        db,
        user.id,
        data.screenplayVersionId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("run llm spoglio")));
      const projectId = accessResult.value.projectId;

      const versionResult = await ResultAsync.fromPromise(
        db.query.screenplayVersions
          .findFirst({
            where: eq(screenplayVersions.id, data.screenplayVersionId),
          })
          .then((r) => r ?? null),
        (e) => new DbError("streamFullSpoglio/loadVersion", e),
      );
      if (versionResult.isErr()) return toShape(err(versionResult.error));
      const version = versionResult.value;
      if (!version)
        return toShape(
          err(new BreakdownVersionNotFoundError(data.screenplayVersionId)),
        );

      const cachedState = await db.query.breakdownVersionState.findFirst({
        where: eq(breakdownVersionState.versionId, data.screenplayVersionId),
      });
      if (cachedState?.lastFullSpoglioRunAt && cachedState.modelUsed) {
        return toShape(
          ok({
            scenesProcessed: cachedState.scenesDone,
            modelUsed: cachedState.modelUsed,
            cached: true,
          }),
        );
      }

      const sceneRowsResult = await ResultAsync.fromPromise(
        db.query.scenes.findMany({
          where: eq(scenes.screenplayId, version.screenplayId),
          orderBy: [asc(scenes.number)],
        }),
        (e) => new DbError("streamFullSpoglio/loadScenes", e),
      );
      if (sceneRowsResult.isErr()) return toShape(err(sceneRowsResult.error));
      const sceneRows = sceneRowsResult.value;
      if (sceneRows.length === 0) {
        return toShape(
          ok({ scenesProcessed: 0, modelUsed: SONNET_MODEL, cached: false }),
        );
      }

      // Map: 1-based scene number → DB scene id. The model emits 1-based
      // sceneNumber; we use this to route persistence back to the right row.
      const sceneIdByNumber = new Map<number, string>();
      sceneRows.forEach((s, i) => sceneIdByNumber.set(i + 1, s.id));

      // Initialize progress row: scenes_total now known, scenes_done = 0.
      const initState = await ResultAsync.fromPromise(
        db
          .insert(breakdownVersionState)
          .values({
            versionId: data.screenplayVersionId,
            scenesTotal: sceneRows.length,
            scenesDone: 0,
            modelUsed: null,
            lastFullSpoglioRunAt: null,
          })
          .onConflictDoUpdate({
            target: [breakdownVersionState.versionId],
            set: {
              scenesTotal: sceneRows.length,
              scenesDone: 0,
              modelUsed: null,
              lastFullSpoglioRunAt: null,
              updatedAt: new Date(),
            },
          }),
        (e) => new DbError("streamFullSpoglio/initState", e),
      );
      if (initState.isErr()) return toShape(err(initState.error));

      const isMock = process.env["MOCK_AI"] === "true";
      const scenesForLlm = sceneRows.map((s, i) => ({
        sceneNumber: i + 1,
        heading: s.heading,
        body: s.notes ?? "",
      }));

      const sink: SceneSink = async (parsed) => {
        const sceneId = sceneIdByNumber.get(parsed.sceneNumber);
        if (!sceneId) return;
        const persistResult = await persistSceneItems(db, {
          projectId,
          screenplayVersionId: data.screenplayVersionId,
          sceneId,
          parsed,
        });
        if (persistResult.isErr()) {
          // Persistence failure on a single scene shouldn't kill the whole
          // stream — log and skip. The polling client will see scenes_done
          // stop advancing if too many fail; we surface the final summary.
          // eslint-disable-next-line no-console
          console.error(
            "[streamFullSpoglio] persist failed for scene",
            parsed.sceneNumber,
            persistResult.error.message,
          );
          return;
        }
        await db
          .update(breakdownVersionState)
          .set({
            scenesDone: parsed.sceneNumber,
            updatedAt: new Date(),
          })
          .where(eq(breakdownVersionState.versionId, data.screenplayVersionId));
      };

      try {
        if (isMock) {
          for (const parsed of mockFullScriptBreakdown(scenesForLlm)) {
            await sink(parsed);
          }
        } else {
          await streamFromAnthropic(scenesForLlm, sink);
        }
      } catch (e) {
        const cause = e instanceof Error ? e.message : String(e);
        return toShape(err(new LlmSpoglioFailedError(cause)));
      }

      const modelUsed = isMock ? "mock" : SONNET_MODEL;
      await db
        .update(breakdownVersionState)
        .set({
          lastFullSpoglioRunAt: new Date(),
          modelUsed,
          updatedAt: new Date(),
        })
        .where(eq(breakdownVersionState.versionId, data.screenplayVersionId));

      return toShape(
        ok({
          scenesProcessed: sceneRows.length,
          modelUsed,
          cached: false,
        }),
      );
    },
  );

// ──────────────────────────────────────────────────────────────────────
// getSpoglioProgress  (polled by client every 1.5s while a run is active)
// ──────────────────────────────────────────────────────────────────────

export const getSpoglioProgress = createServerFn({ method: "GET" })
  .validator(z.object({ screenplayVersionId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<ResultShape<SpoglioProgress, ForbiddenError | DbError>> => {
      const user = await requireUser();
      const db = await getDb();

      const accessResult = await resolveBreakdownAccessByScreenplayVersion(
        db,
        user.id,
        data.screenplayVersionId,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));

      const stateResult = await ResultAsync.fromPromise(
        db.query.breakdownVersionState
          .findFirst({
            where: eq(
              breakdownVersionState.versionId,
              data.screenplayVersionId,
            ),
          })
          .then((r) => r ?? null),
        (e) => new DbError("getSpoglioProgress/loadState", e),
      );
      if (stateResult.isErr()) return toShape(err(stateResult.error));
      const state = stateResult.value;

      if (!state) {
        return toShape(
          ok({
            scenesDone: 0,
            scenesTotal: null,
            isComplete: false,
            modelUsed: null,
          }),
        );
      }

      return toShape(
        ok({
          scenesDone: state.scenesDone,
          scenesTotal: state.scenesTotal,
          isComplete: state.lastFullSpoglioRunAt !== null,
          modelUsed: state.modelUsed,
        }),
      );
    },
  );

// ──────────────────────────────────────────────────────────────────────
// internals
// ──────────────────────────────────────────────────────────────────────

type SceneSink = (parsed: ParsedSceneRaw) => Promise<void>;

interface PersistInput {
  projectId: string;
  screenplayVersionId: string;
  sceneId: string;
  parsed: ParsedSceneRaw;
}

const persistSceneItems = (
  db: Db,
  input: PersistInput,
): ResultAsync<{ persisted: number }, DbError> =>
  ResultAsync.fromPromise(
    db.transaction(async (tx) => {
      let persisted = 0;
      const now = new Date();
      for (const raw of input.parsed.items) {
        const name = typeof raw.name === "string" ? raw.name.trim() : "";
        const quantity =
          typeof raw.quantity === "number" && raw.quantity >= 1
            ? Math.floor(raw.quantity)
            : 1;
        const confidence =
          typeof raw.confidence === "number" ? raw.confidence : 0;
        if (name.length === 0) continue;
        if (!isAllowedCategory(raw.category)) continue;

        const status: CesareStatusDb | null = statusForConfidence(confidence);
        if (status === null) continue;

        const [el] = await tx
          .insert(breakdownElements)
          .values({
            projectId: input.projectId,
            category: raw.category,
            name,
          })
          .onConflictDoUpdate({
            target: [
              breakdownElements.projectId,
              breakdownElements.category,
              breakdownElements.name,
            ],
            set: { updatedAt: now },
          })
          .returning();
        if (!el) continue;
        if (el.archivedAt !== null) continue;

        const inserted = await tx
          .insert(breakdownOccurrences)
          .values({
            elementId: el.id,
            screenplayVersionId: input.screenplayVersionId,
            sceneId: input.sceneId,
            quantity,
            cesareStatus: status,
          })
          .onConflictDoNothing({
            target: [
              breakdownOccurrences.elementId,
              breakdownOccurrences.screenplayVersionId,
              breakdownOccurrences.sceneId,
            ],
          })
          .returning();
        if (inserted.length > 0) persisted += 1;
      }
      return { persisted };
    }),
    (e) => new DbError("streamFullSpoglio/persistScene", e),
  );

const streamFromAnthropic = async (
  scenesForLlm: { sceneNumber: number; heading: string; body: string }[],
  sink: SceneSink,
): Promise<void> => {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || apiKey.length === 0) {
    throw new Error(
      "ANTHROPIC_API_KEY non configurata. Imposta la chiave in apps/web/.env oppure MOCK_AI=true.",
    );
  }
  // Lazy-import the SDK so the dependency stays optional in MOCK_AI envs.
  const sdkModule = "@anthropic-ai/sdk";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk: any = await import(/* @vite-ignore */ sdkModule);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Anthropic = (sdk.default ?? sdk) as any;
  const client = new Anthropic({ apiKey });

  const userPrompt = scenesForLlm
    .map((s) =>
      `--- SCENE ${s.sceneNumber} ---\n${s.heading}\n${s.body}`.trim(),
    )
    .join("\n\n");

  const stream = client.messages.stream({
    model: SONNET_MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: LLM_SPOGLIO_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [LLM_SPOGLIO_TOOL_DEFINITION],
    tool_choice: { type: "tool", name: "submit_full_script_breakdown" },
    messages: [{ role: "user", content: userPrompt }],
  });

  let buffer = "";
  let cursor = 0;
  const seen = new Set<number>();

  // The SDK's MessageStream emits typed events. We listen for partial
  // input_json deltas on the tool_use block.
  stream.on(
    "inputJson",
    (delta: { partial_json?: string; partialJson?: string } | string) => {
      const chunk =
        typeof delta === "string"
          ? delta
          : (delta.partial_json ?? delta.partialJson ?? "");
      if (chunk.length === 0) return;
      buffer += chunk;
      const { scenes: ready, nextCursor } = extractCompleteScenes(
        buffer,
        cursor,
      );
      cursor = nextCursor;
      for (const parsed of ready) {
        if (seen.has(parsed.sceneNumber)) continue;
        seen.add(parsed.sceneNumber);
        // Persistence is async; we don't await in the listener (the SDK
        // doesn't await listeners) but we capture the promise so a
        // background error surfaces in the next tick.
        sink(parsed).catch((e: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[streamFullSpoglio] sink error", e);
        });
      }
    },
  );

  await stream.finalMessage();
  // Final drain: in case the last chunk completed a scene exactly at the
  // end of the buffer, run extract once more.
  const final = extractCompleteScenes(buffer, cursor);
  for (const parsed of final.scenes) {
    if (seen.has(parsed.sceneNumber)) continue;
    seen.add(parsed.sceneNumber);
    await sink(parsed);
  }
};
