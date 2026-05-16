import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { ResultAsync } from "neverthrow";
import { queryOptions } from "@tanstack/react-query";
import {
  locations,
  sceneBlockings,
  planSceneCameras,
  scenes,
  breakdownOccurrences,
  breakdownElements,
  shots,
  screenplays,
} from "@oh-writers/db/schema";
import {
  BLOCKING_TEMPLATES,
  type BlockingTemplateKey,
  PrimitivesArraySchema,
  ActorPositionsArraySchema,
  CameraPinSchema,
  buildCesareBlockingPrompt,
  parseCesareBlockingResponse,
  type CesareBlockingInput,
  type ActorPosition,
  type CameraPin,
  type Primitive,
} from "@oh-writers/domain";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import { callHaiku, extractText } from "~/features/ai";
import { ForbiddenError, DbError } from "../shooting-plan.errors";

// ─── View types ────────────────────────────────────────────────────────────────

export interface LocationView {
  id: string;
  name: string;
  templateKey: string;
  widthCm: number;
  heightCm: number;
  gridSize: number;
  primitives: Primitive[];
}

export interface BlockingView {
  sceneBlockingId: string;
  locationId: string;
  location: LocationView;
  actorPositions: ActorPosition[];
  cameraPins: CameraPin[];
  isSuggested: boolean;
  detachedActors: boolean;
  planSceneCamerasId: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const inferTemplateKey = (sceneHeading: string): BlockingTemplateKey => {
  const h = sceneHeading.toLowerCase();
  if (h.includes("pizzeria") || h.includes("ristorante")) return "restaurant";
  if (h.includes("cucina")) return "kitchen";
  if (h.includes("camera") && h.includes("letto")) return "bedroom";
  if (h.includes("ufficio")) return "office";
  if (h.includes("auto") || h.includes("macchina")) return "car_interior";
  if (h.trim().startsWith("ext") || h.includes("strada"))
    return "exterior_street";
  return "living_room";
};

const loadOrCreateLocation = async (
  db: Db,
  projectId: string,
  sceneHeading: string,
): Promise<{
  id: string;
  widthCm: number;
  heightCm: number;
  primitives: Primitive[];
}> => {
  const templateKey = inferTemplateKey(sceneHeading);

  const existing = await db.query.locations.findFirst({
    where: and(
      eq(locations.projectId, projectId),
      eq(locations.templateKey, templateKey),
    ),
  });
  if (existing) {
    return {
      id: existing.id,
      widthCm: existing.widthCm,
      heightCm: existing.heightCm,
      primitives: existing.primitives as unknown as Primitive[],
    };
  }

  const template = BLOCKING_TEMPLATES[templateKey];
  const inserted = await db
    .insert(locations)
    .values({
      projectId,
      name: sceneHeading || template.label,
      templateKey,
      widthCm: template.widthCm,
      heightCm: template.heightCm,
      primitives: template.primitives as unknown as Record<string, unknown>[],
    })
    .returning();
  const row = inserted[0]!;
  return {
    id: row.id,
    widthCm: row.widthCm,
    heightCm: row.heightCm,
    primitives: row.primitives as unknown as Primitive[],
  };
};

const callCesareBlocking = async (
  input: CesareBlockingInput,
): Promise<{ actorPositions: ActorPosition[]; cameraPins: CameraPin[] }> => {
  if (process.env["MOCK_AI"] === "true") {
    return parseCesareBlockingResponse("", input);
  }
  const result = await callHaiku(
    {
      system:
        "You are a professional film assistant director. Respond only with JSON.",
      fewShot: {},
      user: buildCesareBlockingPrompt(input),
      maxTokens: 1024,
    },
    "cesare/blocking",
  );
  if (result.isErr()) return parseCesareBlockingResponse("", input);
  const text = extractText(result.value.content) ?? "";
  return parseCesareBlockingResponse(text, input);
};

// ─── Server functions ──────────────────────────────────────────────────────────

export const getOrCreateBlocking = createServerFn({ method: "POST" })
  .validator(
    z.object({ sceneId: z.string().uuid(), planId: z.string().uuid() }),
  )
  .handler(
    async ({
      data,
    }): Promise<ResultShape<BlockingView, DbError | ForbiddenError>> => {
      await requireUser();
      const db = await getDb();

      const result = await ResultAsync.fromPromise(
        (async () => {
          // scenes → screenplays → projectId (scenes table has no direct projectId column)
          const sceneRow = await db
            .select({
              id: scenes.id,
              heading: scenes.heading,
              notes: scenes.notes,
              projectId: screenplays.projectId,
            })
            .from(scenes)
            .innerJoin(screenplays, eq(scenes.screenplayId, screenplays.id))
            .where(eq(scenes.id, data.sceneId))
            .then((rows) => rows[0]);

          if (!sceneRow) throw new Error(`Scene not found: ${data.sceneId}`);

          const loc = await loadOrCreateLocation(
            db,
            sceneRow.projectId,
            sceneRow.heading ?? "",
          );

          let sceneBlocking = await db.query.sceneBlockings.findFirst({
            where: eq(sceneBlockings.sceneId, data.sceneId),
          });

          let planCameras = await db.query.planSceneCameras.findFirst({
            where: and(
              eq(planSceneCameras.planId, data.planId),
              eq(planSceneCameras.sceneId, data.sceneId),
            ),
          });

          const needsCesare =
            !sceneBlocking ||
            !planCameras ||
            (sceneBlocking.isSuggested && planCameras.isSuggested);

          if (needsCesare) {
            const castRows = await db
              .select({
                id: breakdownElements.id,
                label: breakdownElements.name,
              })
              .from(breakdownOccurrences)
              .innerJoin(
                breakdownElements,
                eq(breakdownOccurrences.elementId, breakdownElements.id),
              )
              .where(
                and(
                  eq(breakdownOccurrences.sceneId, data.sceneId),
                  eq(breakdownElements.category, "cast"),
                ),
              );

            const shotRows = await db.query.shots.findMany({
              where: eq(shots.scenarioId, data.planId),
            });

            const cesareInput: CesareBlockingInput = {
              fountainText: sceneRow.notes ?? sceneRow.heading ?? "",
              sceneHeading: sceneRow.heading ?? "",
              cast: castRows,
              props: [],
              shots: shotRows.map((s, i) => ({
                id: s.id,
                shotSize: s.shotSize,
                cameraMovement: s.cameraMovement,
                cameraLabel: `${String.fromCharCode(65 + i)} · ${s.shotSize}`,
              })),
              locationPrimitives: loc.primitives,
              widthCm: loc.widthCm,
              heightCm: loc.heightCm,
              projectSuggestionHistory: { accepted: [], ignored: [] },
            };

            const cesareOut = await callCesareBlocking(cesareInput);

            if (!sceneBlocking) {
              const inserted = await db
                .insert(sceneBlockings)
                .values({
                  sceneId: data.sceneId,
                  locationId: loc.id,
                  actorPositions: cesareOut.actorPositions as unknown as Record<
                    string,
                    unknown
                  >[],
                  isSuggested: true,
                })
                .returning();
              sceneBlocking = inserted[0]!;
            }

            if (!planCameras) {
              const inserted = await db
                .insert(planSceneCameras)
                .values({
                  planId: data.planId,
                  sceneId: data.sceneId,
                  cameraPins: cesareOut.cameraPins as unknown as Record<
                    string,
                    unknown
                  >[],
                  isSuggested: true,
                })
                .returning();
              planCameras = inserted[0]!;
            }
          }

          const effectiveActors: ActorPosition[] =
            planCameras!.detachedActors && planCameras!.overrideActorPositions
              ? (planCameras!
                  .overrideActorPositions as unknown as ActorPosition[])
              : (sceneBlocking!.actorPositions as unknown as ActorPosition[]);

          const locationRow = await db.query.locations.findFirst({
            where: eq(locations.id, sceneBlocking!.locationId),
          });

          return {
            sceneBlockingId: sceneBlocking!.id,
            locationId: loc.id,
            location: {
              id: locationRow!.id,
              name: locationRow!.name,
              templateKey: locationRow!.templateKey,
              widthCm: locationRow!.widthCm,
              heightCm: locationRow!.heightCm,
              gridSize: locationRow!.gridSize,
              primitives: locationRow!.primitives as unknown as Primitive[],
            },
            actorPositions: effectiveActors,
            cameraPins: planCameras!.cameraPins as unknown as CameraPin[],
            isSuggested: sceneBlocking!.isSuggested && planCameras!.isSuggested,
            detachedActors: planCameras!.detachedActors,
            planSceneCamerasId: planCameras!.id,
          } satisfies BlockingView;
        })(),
        (e) => new DbError("getOrCreateBlocking", e),
      );

      return toShape(result);
    },
  );

export const saveActorPositions = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sceneBlockingId: z.string().uuid(),
      positions: ActorPositionsArraySchema,
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .update(sceneBlockings)
          .set({
            actorPositions: data.positions as unknown as Record<
              string,
              unknown
            >[],
            isSuggested: false,
          })
          .where(eq(sceneBlockings.id, data.sceneBlockingId))
          .then(() => undefined as void),
        (e) => new DbError("saveActorPositions", e),
      );
      return toShape(result);
    },
  );

export const saveCameraPin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      planSceneCamerasId: z.string().uuid(),
      pin: CameraPinSchema,
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        (async () => {
          const row = await db.query.planSceneCameras.findFirst({
            where: eq(planSceneCameras.id, data.planSceneCamerasId),
          });
          if (!row) throw new Error("planSceneCameras not found");
          const existing = (row.cameraPins as unknown as CameraPin[]).filter(
            (p) => p.shotId !== data.pin.shotId,
          );
          await db
            .update(planSceneCameras)
            .set({
              cameraPins: [...existing, data.pin] as unknown as Record<
                string,
                unknown
              >[],
              isSuggested: false,
            })
            .where(eq(planSceneCameras.id, data.planSceneCamerasId));
        })(),
        (e) => new DbError("saveCameraPin", e),
      );
      return toShape(result);
    },
  );

export const deleteCameraPin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      planSceneCamerasId: z.string().uuid(),
      shotId: z.string().uuid(),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        (async () => {
          const row = await db.query.planSceneCameras.findFirst({
            where: eq(planSceneCameras.id, data.planSceneCamerasId),
          });
          if (!row) throw new Error("planSceneCameras not found");
          const filtered = (row.cameraPins as unknown as CameraPin[]).filter(
            (p) => p.shotId !== data.shotId,
          );
          await db
            .update(planSceneCameras)
            .set({
              cameraPins: filtered as unknown as Record<string, unknown>[],
            })
            .where(eq(planSceneCameras.id, data.planSceneCamerasId));
        })(),
        (e) => new DbError("deleteCameraPin", e),
      );
      return toShape(result);
    },
  );

export const detachBlocking = createServerFn({ method: "POST" })
  .validator(
    z.object({
      planSceneCamerasId: z.string().uuid(),
      sceneBlockingId: z.string().uuid(),
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        (async () => {
          const sceneRow = await db.query.sceneBlockings.findFirst({
            where: eq(sceneBlockings.id, data.sceneBlockingId),
          });
          if (!sceneRow) throw new Error("sceneBlocking not found");
          await db
            .update(planSceneCameras)
            .set({
              detachedActors: true,
              overrideActorPositions: sceneRow.actorPositions,
            })
            .where(eq(planSceneCameras.id, data.planSceneCamerasId));
        })(),
        (e) => new DbError("detachBlocking", e),
      );
      return toShape(result);
    },
  );

export const saveLocationPrimitives = createServerFn({ method: "POST" })
  .validator(
    z.object({
      locationId: z.string().uuid(),
      primitives: PrimitivesArraySchema,
    }),
  )
  .handler(
    async ({ data }): Promise<ResultShape<void, DbError | ForbiddenError>> => {
      await requireUser();
      const db = await getDb();
      const result = await ResultAsync.fromPromise(
        db
          .update(locations)
          .set({
            primitives: data.primitives as unknown as Record<string, unknown>[],
          })
          .where(eq(locations.id, data.locationId))
          .then(() => undefined as void),
        (e) => new DbError("saveLocationPrimitives", e),
      );
      return toShape(result);
    },
  );

export const blockingQueryOptions = (sceneId: string, planId: string) =>
  queryOptions({
    queryKey: ["blocking", sceneId, planId] as const,
    queryFn: () => getOrCreateBlocking({ data: { sceneId, planId } }),
  });
