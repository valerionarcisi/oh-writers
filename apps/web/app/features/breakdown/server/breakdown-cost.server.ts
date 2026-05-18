import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  scenes,
  screenplays,
  breakdownElements,
  breakdownOccurrences,
  productionRates,
} from "@oh-writers/db/schema";
import {
  estimateSceneCost,
  DEFAULT_PRODUCTION_RATES,
  type ProductionRates,
  type SceneCostBreakdown,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { withProjectAccess } from "~/server/pipeline";
import type { Db } from "~/server/db";
import {
  BreakdownSceneNotFoundError,
  DbError,
  ForbiddenError,
} from "../breakdown.errors";
import { ProjectNotFoundError } from "~/features/projects";

const PRODUCTION_RATE_KEYS = [
  "castLeadDay",
  "castSupportingDay",
  "crewDopDay",
  "crewBaseDay",
  "catering",
  "locationSetupExt",
  "locationSetupInt",
  "equipmentBaseDay",
  "sfxBaseDay",
  "vfxBasePerShot",
] as const;

type ProductionRateKey = (typeof PRODUCTION_RATE_KEYS)[number];

const loadProductionRates = (
  db: Db,
  projectId: string,
): ResultAsync<ProductionRates, DbError> =>
  ResultAsync.fromPromise(
    db
      .select({ key: productionRates.key, value: productionRates.value })
      .from(productionRates)
      .where(eq(productionRates.projectId, projectId)),
    (e) => new DbError("loadProductionRates", e),
  ).map((rows) => {
    const overrides: Partial<ProductionRates> = {};
    for (const r of rows) {
      const key = r.key as ProductionRateKey;
      if (!PRODUCTION_RATE_KEYS.includes(key)) continue;
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      overrides[key] = v;
    }
    return { ...DEFAULT_PRODUCTION_RATES, ...overrides };
  });

interface SceneRow {
  id: string;
  number: number;
  intExt: "INT" | "EXT" | "INT/EXT";
  timeOfDay: string | null;
  location: string;
  characterNames: string[];
}

const findSceneByNumber = (
  db: Db,
  projectId: string,
  sceneNumber: number,
): ResultAsync<SceneRow, BreakdownSceneNotFoundError | DbError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [screenplay] = await db
        .select({ id: screenplays.id })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);
      if (!screenplay) return null;
      const [scene] = await db
        .select({
          id: scenes.id,
          number: scenes.number,
          intExt: scenes.intExt,
          timeOfDay: scenes.timeOfDay,
          location: scenes.location,
          characterNames: scenes.characterNames,
        })
        .from(scenes)
        .where(
          and(eq(scenes.screenplayId, screenplay.id), eq(scenes.number, sceneNumber)),
        )
        .limit(1);
      return scene ?? null;
    })(),
    (e) => new DbError("findSceneByNumber", e),
  ).andThen((row) =>
    row ? ok(row) : err(new BreakdownSceneNotFoundError(String(sceneNumber))),
  );

interface ElementRow {
  category: string;
  name: string;
}

const loadElementsForScene = (
  db: Db,
  projectId: string,
  sceneId: string,
): ResultAsync<ElementRow[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select({
        category: breakdownElements.category,
        name: breakdownElements.name,
      })
      .from(breakdownElements)
      .innerJoin(
        breakdownOccurrences,
        eq(breakdownOccurrences.elementId, breakdownElements.id),
      )
      .where(
        and(
          eq(breakdownElements.projectId, projectId),
          eq(breakdownOccurrences.sceneId, sceneId),
          isNull(breakdownElements.archivedAt),
        ),
      ),
    (e) => new DbError("loadElementsForScene", e),
  );

const groupByCategory = (
  rows: ReadonlyArray<ElementRow>,
): Record<string, string[]> => {
  const acc: Record<string, string[]> = {};
  for (const row of rows) {
    const list = acc[row.category] ?? [];
    list.push(row.name);
    acc[row.category] = list;
  }
  return acc;
};

const computeEstimate = (
  db: Db,
  projectId: string,
  sceneNumber: number,
): ResultAsync<
  SceneCostBreakdown,
  BreakdownSceneNotFoundError | DbError
> =>
  findSceneByNumber(db, projectId, sceneNumber).andThen((scene) =>
    loadElementsForScene(db, projectId, scene.id).andThen((elements) =>
      loadProductionRates(db, projectId).map((rates) =>
        estimateSceneCost(
          {
            sceneNumber: scene.number,
            intExt: scene.intExt,
            timeOfDay: scene.timeOfDay,
            characters: scene.characterNames,
            elementsByCategory: groupByCategory(elements),
            estimatedShootHours: 8,
          },
          rates,
        ),
      ),
    ),
  );

export const getSceneCostEstimate = createServerFn({ method: "GET" })
  .validator(
    z.object({
      projectId: z.string().uuid(),
      sceneNumber: z.number().int().min(1),
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        SceneCostBreakdown,
        | BreakdownSceneNotFoundError
        | ProjectNotFoundError
        | ForbiddenError
        | DbError
      >
    > =>
      toShape(
        await withProjectAccess(data.projectId, "view", ({ db }) =>
          computeEstimate(db, data.projectId, data.sceneNumber),
        ),
      ),
  );
