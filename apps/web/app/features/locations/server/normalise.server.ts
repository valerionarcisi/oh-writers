/**
 * Requirement normalisation — spec 37, Step 1.
 *
 * Resolves each `location_requirements` row to a canonical `LocationType`:
 *  1. Dictionary free path (`resolveTypeByKeyword`) — instant, zero cost.
 *  2. Haiku batch — every requirement the dictionary missed goes in ONE call,
 *     together with its linked scene headings, so the model can reason about the
 *     whole project (collapsing sibling set names like "Bancone"/"Sala"/"Cucina"
 *     onto one place type).
 *
 * The verdict is persisted on the requirement (`location_type`,
 * `location_type_source`) so it is computed once, not per area selection.
 */

import { ResultAsync, okAsync, errAsync } from "neverthrow";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  locationRequirements,
  locationRequirementScenes,
  scenes,
} from "@oh-writers/db/schema";
import { resolveTypeByKeyword, LOCATION_TYPES } from "@oh-writers/domain";
import { callHaiku, extractToolUse } from "~/features/ai";
import type { Db } from "~/server/db";
import {
  NormalisationOutputSchema,
  type NormalisationVerdict,
} from "../locations.schema";
import { DbError, LocationNormalisationError } from "../locations.errors";
import { findNormalisationFixture } from "../_mocks/normalise.fixtures";

type RequirementRow = typeof locationRequirements.$inferSelect;

const NORMALISE_TOOL_NAME = "normalise_requirements";

const NORMALISE_TOOL = {
  name: NORMALISE_TOOL_NAME,
  description:
    "Map each Italian screenplay location requirement to one canonical place type.",
  input_schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirementId: { type: "string" },
            locationType: { type: "string", enum: LOCATION_TYPES },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["requirementId", "locationType", "confidence"],
        },
      },
    },
    required: ["verdicts"],
  },
} as const;

const NORMALISE_SYSTEM_PROMPT = `You are Cesare, an expert location scout for Italian cinema.
You receive a list of location requirements extracted from a screenplay breakdown.
Each requirement is a SET NAME as the writer wrote it ("Bancone", "Angolo Open Grezzo", "Sala") — not a category.
Map each to exactly ONE canonical place type from the allowed enum.
Reason about the whole project: sibling set names that belong to the same physical place (e.g. the counter, the dining room and the kitchen of a restaurant) should map to the SAME type.
Use the linked scene headings as context. If a requirement is not a physical filming location (a montage, an abstract beat), map it to "altro" with low confidence.`;

/** A requirement reduced to what the Haiku prompt needs. */
interface RequirementContext {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sceneHeadings: readonly string[];
}

const persistVerdict = (
  db: Db,
  requirementId: string,
  locationType: string,
  source: "dictionary" | "haiku",
): ResultAsync<void, DbError> =>
  ResultAsync.fromPromise(
    db
      .update(locationRequirements)
      .set({ locationType, locationTypeSource: source, updatedAt: new Date() })
      .where(eq(locationRequirements.id, requirementId)),
    (e) => new DbError("persistLocationType", e),
  ).map(() => undefined);

/** Load INT/EXT + heading for every scene linked to the given requirements. */
const loadSceneHeadings = (
  db: Db,
  requirementIds: readonly string[],
): ResultAsync<Map<string, string[]>, DbError> => {
  if (requirementIds.length === 0) return okAsync(new Map());
  return ResultAsync.fromPromise(
    db
      .select({
        requirementId: locationRequirementScenes.requirementId,
        heading: scenes.heading,
      })
      .from(locationRequirementScenes)
      .innerJoin(scenes, eq(scenes.id, locationRequirementScenes.sceneId))
      .where(inArray(locationRequirementScenes.requirementId, requirementIds)),
    (e) => new DbError("loadSceneHeadings", e),
  ).map((rows) => {
    const byReq = new Map<string, string[]>();
    for (const row of rows) {
      const list = byReq.get(row.requirementId) ?? [];
      list.push(row.heading);
      byReq.set(row.requirementId, list);
    }
    return byReq;
  });
};

const buildUserMessage = (contexts: readonly RequirementContext[]): string =>
  contexts
    .map((c) => {
      const headings =
        c.sceneHeadings.length > 0
          ? c.sceneHeadings.slice(0, 6).join(" | ")
          : "(no linked scenes)";
      const desc = c.description ? ` — ${c.description}` : "";
      return `id=${c.id}\nname: ${c.name}${desc}\nscenes: ${headings}`;
    })
    .join("\n\n");

const normaliseWithMock = (
  _projectId: string,
  contexts: readonly RequirementContext[],
): ResultAsync<NormalisationVerdict[], LocationNormalisationError> =>
  okAsync(
    contexts.map((c) => {
      const fixture = findNormalisationFixture(c.name);
      return {
        requirementId: c.id,
        locationType: fixture.locationType,
        confidence: fixture.confidence,
      };
    }),
  );

const normaliseWithAI = (
  projectId: string,
  contexts: readonly RequirementContext[],
): ResultAsync<NormalisationVerdict[], LocationNormalisationError> =>
  callHaiku(
    {
      system: NORMALISE_SYSTEM_PROMPT,
      fewShot: {},
      user: buildUserMessage(contexts),
      maxTokens: 1024,
      tools: [NORMALISE_TOOL],
      toolChoice: { type: "tool", name: NORMALISE_TOOL_NAME },
    },
    "normaliseLocationRequirements",
  )
    .mapErr((e) => new LocationNormalisationError(projectId, e))
    .andThen((result) => {
      const raw = extractToolUse(result.content, NORMALISE_TOOL_NAME);
      const parsed = NormalisationOutputSchema.safeParse(raw);
      return parsed.success
        ? okAsync(parsed.data.verdicts)
        : errAsync(new LocationNormalisationError(projectId, parsed.error));
    });

/**
 * Normalise every not-yet-resolved requirement of a project. Returns the count
 * of requirements that received a type (dictionary + Haiku combined).
 */
export const normaliseRequirements = (
  db: Db,
  projectId: string,
): ResultAsync<number, DbError | LocationNormalisationError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(locationRequirements)
      .where(
        and(
          eq(locationRequirements.projectId, projectId),
          isNull(locationRequirements.locationType),
        ),
      ),
    (e) => new DbError("loadUnnormalisedRequirements", e),
  ).andThen((rows: RequirementRow[]) => {
    if (rows.length === 0) return okAsync(0);

    // Step 1a — dictionary free path.
    const dictionaryHits: Array<{ id: string; type: string }> = [];
    const needsAI: RequirementRow[] = [];
    for (const row of rows) {
      const type = resolveTypeByKeyword(row.name);
      if (type) dictionaryHits.push({ id: row.id, type });
      else needsAI.push(row);
    }

    const persistDictionary = ResultAsync.combine(
      dictionaryHits.map((hit) =>
        persistVerdict(db, hit.id, hit.type, "dictionary"),
      ),
    );

    // Step 1b — Haiku batch for the remainder.
    return persistDictionary.andThen(() => {
      if (needsAI.length === 0) return okAsync(dictionaryHits.length);

      const normalise =
        process.env["MOCK_AI"] === "true" ? normaliseWithMock : normaliseWithAI;

      return loadSceneHeadings(
        db,
        needsAI.map((r) => r.id),
      ).andThen((headingsByReq) => {
        const contexts: RequirementContext[] = needsAI.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          sceneHeadings: headingsByReq.get(r.id) ?? [],
        }));

        return normalise(projectId, contexts).andThen((verdicts) => {
          const byId = new Map(verdicts.map((v) => [v.requirementId, v]));
          const persists = needsAI
            .map((r) => byId.get(r.id))
            .filter((v): v is NormalisationVerdict => v !== undefined)
            .map((v) =>
              persistVerdict(db, v.requirementId, v.locationType, "haiku"),
            );
          return ResultAsync.combine(persists).map(
            (done) => dictionaryHits.length + done.length,
          );
        });
      });
    });
  });
