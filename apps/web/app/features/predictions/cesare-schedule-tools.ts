import { tool } from "ai";
import { z } from "zod";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { and, eq, asc, isNull } from "drizzle-orm";
import {
  schedules,
  shootingDays,
  strips,
  scenes,
  locationRequirements,
  locationRequirementScenes,
} from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { CesareError } from "./cesare.errors";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const CESARE_SCHEDULE_TOOLS = [
  {
    name: "move_scene_to_day",
    description:
      "Sposta una scena (identificata dal suo numero) su una giornata di ripresa specifica. " +
      "Usa quando l'utente chiede di riorganizzare lo schedule.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "number",
          description: "Numero della scena da spostare",
        },
        target_day_number: {
          type: "number",
          description: "Numero della giornata di destinazione (1-based)",
        },
      },
      required: ["scene_number", "target_day_number"],
    },
  },
  {
    name: "merge_days",
    description:
      "Accorpa tutte le scene di due giornate. Le scene della seconda giornata vengono spostate sulla prima, e la seconda viene rimossa (con renumber automatico).",
    input_schema: {
      type: "object" as const,
      properties: {
        day_a_number: {
          type: "number",
          description: "Numero della giornata che resta",
        },
        day_b_number: {
          type: "number",
          description:
            "Numero della giornata da assorbire (verrà rimossa dopo lo spostamento)",
        },
      },
      required: ["day_a_number", "day_b_number"],
    },
  },
  {
    name: "swap_scenes",
    description:
      "Scambia la posizione di due scene tra le rispettive giornate di ripresa.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_a_number: { type: "number" },
        scene_b_number: { type: "number" },
      },
      required: ["scene_a_number", "scene_b_number"],
    },
  },
  {
    name: "lock_day",
    description:
      "Blocca tutte le strip di una giornata (impedisce ulteriori spostamenti dell'AI o drag-and-drop).",
    input_schema: {
      type: "object" as const,
      properties: {
        day_number: { type: "number" },
      },
      required: ["day_number"],
    },
  },
  {
    name: "unlock_day",
    description: "Sblocca tutte le strip di una giornata.",
    input_schema: {
      type: "object" as const,
      properties: {
        day_number: { type: "number" },
      },
      required: ["day_number"],
    },
  },
  {
    name: "get_weather_forecast",
    description:
      "Recupera le previsioni meteo per una location e una data tramite Open-Meteo. " +
      "Restituisce probabilità pioggia, temperature, vento e condizioni. " +
      "Usa per valutare l'impatto del meteo sulla probabilità di riuscita di una giornata con esterni.",
    input_schema: {
      type: "object" as const,
      properties: {
        lat: { type: "number", description: "Latitudine" },
        lng: { type: "number", description: "Longitudine" },
        date: {
          type: "string",
          description: "Data ISO YYYY-MM-DD (entro 16 giorni dal presente)",
        },
      },
      required: ["lat", "lng", "date"],
    },
  },
  {
    name: "suggest_reorder",
    description:
      "Cesare propone una nuova sequenza ottimizzata dello schedule. Restituisce il piano proposto come testo, senza applicarlo. L'utente decide se accettarlo o meno.",
    input_schema: {
      type: "object" as const,
      properties: {
        strategy: {
          type: "string",
          description:
            "Strategia di ottimizzazione, es. 'minimize_location_changes', 'concentrate_night_exteriors', 'balance_workload'",
        },
        respect_location_confirmed: {
          type: "boolean",
          description:
            "Se true, penalizza il riassegnare scene a giornate la cui location non è ancora confermata (status diverso da 'confirmed'/'locked'). Default false.",
        },
      },
      required: [],
    },
  },
] as const;

// ─── Schedule context for active day fallback ─────────────────────────────────

export interface ScheduleToolContext {
  readonly projectId: string;
  readonly activeDayNumber: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findScheduleForProject = (
  db: Db,
  projectId: string,
): ResultAsync<{ id: string; status: "draft" | "locked" }, CesareError> =>
  ResultAsync.fromPromise(
    db.query.schedules
      .findFirst({ where: eq(schedules.projectId, projectId) })
      .then((r) => r ?? null),
    (e) =>
      new CesareError(
        `findScheduleForProject failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) => {
    if (!row)
      return errAsync(new CesareError("Schedule non trovato per il progetto"));
    if (row.status === "locked")
      return errAsync(
        new CesareError("Schedule bloccato — sbloccarlo prima di modificarlo"),
      );
    return okAsync({ id: row.id, status: row.status as "draft" | "locked" });
  });

const findDayByNumber = (
  db: Db,
  scheduleId: string,
  dayNumber: number,
): ResultAsync<{ id: string; dayNumber: number }, CesareError> =>
  ResultAsync.fromPromise(
    db.query.shootingDays
      .findFirst({
        where: and(
          eq(shootingDays.scheduleId, scheduleId),
          eq(shootingDays.dayNumber, dayNumber),
        ),
      })
      .then((r) => r ?? null),
    (e) =>
      new CesareError(
        `findDayByNumber failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) =>
    row
      ? okAsync({ id: row.id, dayNumber: row.dayNumber })
      : errAsync(new CesareError(`Giornata numero ${dayNumber} non trovata`)),
  );

const findStripBySceneNumber = (
  db: Db,
  scheduleId: string,
  sceneNumber: number,
): ResultAsync<
  {
    stripId: string;
    sceneId: string;
    shootingDayId: string | null;
    position: number;
    isLocked: boolean;
  },
  CesareError
> =>
  ResultAsync.fromPromise(
    db
      .select({
        stripId: strips.id,
        sceneId: scenes.id,
        shootingDayId: strips.shootingDayId,
        position: strips.position,
        isLocked: strips.isLocked,
      })
      .from(strips)
      .innerJoin(scenes, eq(strips.sceneId, scenes.id))
      .where(
        and(eq(strips.scheduleId, scheduleId), eq(scenes.number, sceneNumber)),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `findStripBySceneNumber failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) =>
    row
      ? okAsync(row)
      : errAsync(
          new CesareError(`Scena ${sceneNumber} non trovata nello schedule`),
        ),
  );

// ─── Tool executors ───────────────────────────────────────────────────────────

interface MoveSceneToDayInput {
  scene_number: number;
  target_day_number: number;
}

const executeMoveSceneToDay = (
  input: MoveSceneToDayInput,
  db: Db,
  ctx: ScheduleToolContext,
): ResultAsync<
  { moved: true; sceneNumber: number; dayNumber: number; toastMessage: string },
  CesareError
> =>
  findScheduleForProject(db, ctx.projectId).andThen((schedule) =>
    findStripBySceneNumber(db, schedule.id, input.scene_number).andThen(
      (strip) => {
        if (strip.isLocked) {
          return errAsync(
            new CesareError(
              `Scena ${input.scene_number} è bloccata — sbloccala prima di spostarla`,
            ),
          );
        }
        return findDayByNumber(
          db,
          schedule.id,
          input.target_day_number,
        ).andThen((day) =>
          ResultAsync.fromPromise(
            db.transaction(async (tx) => {
              const dayStrips = await tx
                .select()
                .from(strips)
                .where(
                  and(
                    eq(strips.scheduleId, schedule.id),
                    eq(strips.shootingDayId, day.id),
                  ),
                )
                .orderBy(asc(strips.position));

              const targetPosition = dayStrips.length;

              if (strip.shootingDayId && strip.shootingDayId !== day.id) {
                const sourceStrips = await tx
                  .select()
                  .from(strips)
                  .where(
                    and(
                      eq(strips.scheduleId, schedule.id),
                      eq(strips.shootingDayId, strip.shootingDayId),
                    ),
                  )
                  .orderBy(asc(strips.position));
                const without = sourceStrips.filter(
                  (s) => s.id !== strip.stripId,
                );
                for (let i = 0; i < without.length; i++) {
                  await tx
                    .update(strips)
                    .set({ position: i, updatedAt: new Date() })
                    .where(eq(strips.id, without[i]!.id));
                }
              }

              await tx
                .update(strips)
                .set({
                  shootingDayId: day.id,
                  position: targetPosition,
                  updatedAt: new Date(),
                })
                .where(eq(strips.id, strip.stripId));
            }),
            (e) =>
              new CesareError(
                `moveSceneToDay/transaction failed: ${e instanceof Error ? e.message : String(e)}`,
              ),
          ).map(() => ({
            moved: true as const,
            sceneNumber: input.scene_number,
            dayNumber: day.dayNumber,
            toastMessage: `Scena ${input.scene_number} spostata in Giornata ${day.dayNumber}`,
          })),
        );
      },
    ),
  );

interface MergeDaysInput {
  day_a_number: number;
  day_b_number: number;
}

const executeMergeDays = (
  input: MergeDaysInput,
  db: Db,
  ctx: ScheduleToolContext,
): ResultAsync<
  { merged: true; intoDay: number; absorbedDay: number; toastMessage: string },
  CesareError
> => {
  if (input.day_a_number === input.day_b_number) {
    return errAsync(
      new CesareError("day_a_number e day_b_number devono essere diversi"),
    );
  }
  return findScheduleForProject(db, ctx.projectId).andThen((schedule) =>
    findDayByNumber(db, schedule.id, input.day_a_number).andThen((dayA) =>
      findDayByNumber(db, schedule.id, input.day_b_number).andThen((dayB) =>
        ResultAsync.fromPromise(
          db.transaction(async (tx) => {
            const aStrips = await tx
              .select()
              .from(strips)
              .where(
                and(
                  eq(strips.scheduleId, schedule.id),
                  eq(strips.shootingDayId, dayA.id),
                ),
              )
              .orderBy(asc(strips.position));
            const bStrips = await tx
              .select()
              .from(strips)
              .where(
                and(
                  eq(strips.scheduleId, schedule.id),
                  eq(strips.shootingDayId, dayB.id),
                ),
              )
              .orderBy(asc(strips.position));

            let position = aStrips.length;
            for (const s of bStrips) {
              await tx
                .update(strips)
                .set({
                  shootingDayId: dayA.id,
                  position,
                  updatedAt: new Date(),
                })
                .where(eq(strips.id, s.id));
              position += 1;
            }

            await tx.delete(shootingDays).where(eq(shootingDays.id, dayB.id));

            const remaining = await tx
              .select()
              .from(shootingDays)
              .where(eq(shootingDays.scheduleId, schedule.id))
              .orderBy(asc(shootingDays.dayNumber));
            for (let i = 0; i < remaining.length; i++) {
              const d = remaining[i]!;
              if (d.dayNumber !== i + 1) {
                await tx
                  .update(shootingDays)
                  .set({ dayNumber: i + 1, updatedAt: new Date() })
                  .where(eq(shootingDays.id, d.id));
              }
            }
          }),
          (e) =>
            new CesareError(
              `mergeDays/transaction failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
        ).map(() => ({
          merged: true as const,
          intoDay: dayA.dayNumber,
          absorbedDay: dayB.dayNumber,
          toastMessage: `Giornata ${dayB.dayNumber} accorpata in Giornata ${dayA.dayNumber}`,
        })),
      ),
    ),
  );
};

interface SwapScenesInput {
  scene_a_number: number;
  scene_b_number: number;
}

const executeSwapScenes = (
  input: SwapScenesInput,
  db: Db,
  ctx: ScheduleToolContext,
): ResultAsync<
  { swapped: true; sceneA: number; sceneB: number; toastMessage: string },
  CesareError
> => {
  if (input.scene_a_number === input.scene_b_number) {
    return errAsync(
      new CesareError("scene_a_number e scene_b_number devono essere diversi"),
    );
  }
  return findScheduleForProject(db, ctx.projectId).andThen((schedule) =>
    findStripBySceneNumber(db, schedule.id, input.scene_a_number).andThen((a) =>
      findStripBySceneNumber(db, schedule.id, input.scene_b_number).andThen(
        (b) => {
          if (a.isLocked || b.isLocked) {
            return errAsync(
              new CesareError(
                "Almeno una delle due scene è bloccata — sbloccala prima di scambiare",
              ),
            );
          }
          return ResultAsync.fromPromise(
            db.transaction(async (tx) => {
              await tx
                .update(strips)
                .set({
                  shootingDayId: b.shootingDayId,
                  position: b.position,
                  updatedAt: new Date(),
                })
                .where(eq(strips.id, a.stripId));
              await tx
                .update(strips)
                .set({
                  shootingDayId: a.shootingDayId,
                  position: a.position,
                  updatedAt: new Date(),
                })
                .where(eq(strips.id, b.stripId));
            }),
            (e) =>
              new CesareError(
                `swapScenes/transaction failed: ${e instanceof Error ? e.message : String(e)}`,
              ),
          ).map(() => ({
            swapped: true as const,
            sceneA: input.scene_a_number,
            sceneB: input.scene_b_number,
            toastMessage: `Scena ${input.scene_a_number} scambiata con Scena ${input.scene_b_number}`,
          }));
        },
      ),
    ),
  );
};

interface LockUnlockDayInput {
  day_number: number;
}

const setLockForDay = (
  input: LockUnlockDayInput,
  db: Db,
  ctx: ScheduleToolContext,
  locked: boolean,
): ResultAsync<
  { dayNumber: number; locked: boolean; toastMessage: string },
  CesareError
> =>
  findScheduleForProject(db, ctx.projectId).andThen((schedule) =>
    findDayByNumber(db, schedule.id, input.day_number).andThen((day) =>
      ResultAsync.fromPromise(
        db
          .update(strips)
          .set({ isLocked: locked, updatedAt: new Date() })
          .where(
            and(
              eq(strips.scheduleId, schedule.id),
              eq(strips.shootingDayId, day.id),
            ),
          ),
        (e) =>
          new CesareError(
            `setLockForDay failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
      ).map(() => ({
        dayNumber: day.dayNumber,
        locked,
        toastMessage: locked
          ? `Giornata ${day.dayNumber} bloccata`
          : `Giornata ${day.dayNumber} sbloccata`,
      })),
    ),
  );

interface WeatherInput {
  lat: number;
  lng: number;
  date: string;
}

interface OpenMeteoResponse {
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    weathercode?: number[];
    windspeed_10m_max?: number[];
    time?: string[];
  };
}

const conditionFromCode = (code: number): string => {
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "cloudy";
  if (code >= 45 && code <= 48) return "cloudy";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "unknown";
};

const executeGetWeatherForecast = (
  input: WeatherInput,
): ResultAsync<
  {
    rainProbability: number;
    windKmh: number;
    tempMin: number;
    tempMax: number;
    conditions: string;
  },
  CesareError
> =>
  ResultAsync.fromPromise(
    (async () => {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${input.lat}&longitude=${input.lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max` +
        `&timezone=Europe%2FRome` +
        `&start_date=${input.date}&end_date=${input.date}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      }
      const json = (await response.json()) as OpenMeteoResponse;
      const daily = json.daily;
      if (!daily || !daily.time || daily.time.length === 0) {
        throw new Error("missing daily data");
      }
      const code = daily.weathercode?.[0] ?? 0;
      return {
        rainProbability: daily.precipitation_probability_max?.[0] ?? 0,
        windKmh: daily.windspeed_10m_max?.[0] ?? 0,
        tempMin: daily.temperature_2m_min?.[0] ?? 0,
        tempMax: daily.temperature_2m_max?.[0] ?? 0,
        conditions: conditionFromCode(code),
      };
    })(),
    (e) =>
      new CesareError(
        `getWeatherForecast failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface SuggestReorderInput {
  strategy?: string;
  respect_location_confirmed?: boolean;
}

const executeSuggestReorder = (
  input: SuggestReorderInput,
  db: Db,
  ctx: ScheduleToolContext,
): ResultAsync<
  {
    suggestion: ReadonlyArray<{ dayNumber: number; sceneNumbers: number[] }>;
    rationale: string;
    locationWarnings: ReadonlyArray<{
      dayNumber: number;
      sceneNumber: number;
      requirementName: string;
      status: string;
    }>;
  },
  CesareError
> =>
  findScheduleForProject(db, ctx.projectId).andThen((schedule) =>
    ResultAsync.fromPromise(
      (async () => {
        const days = await db
          .select()
          .from(shootingDays)
          .where(eq(shootingDays.scheduleId, schedule.id))
          .orderBy(asc(shootingDays.dayNumber));
        const stripRows = await db
          .select({
            stripId: strips.id,
            shootingDayId: strips.shootingDayId,
            position: strips.position,
            sceneId: scenes.id,
            sceneNumber: scenes.number,
            location: scenes.location,
            intExt: scenes.intExt,
            timeOfDay: scenes.timeOfDay,
          })
          .from(strips)
          .innerJoin(scenes, eq(strips.sceneId, scenes.id))
          .where(eq(strips.scheduleId, schedule.id))
          .orderBy(asc(strips.position));

        // Resolve location requirement status per scene so we can bias the
        // suggestion away from days with unconfirmed locations.
        const respectLocations = input.respect_location_confirmed === true;
        const sceneIds = stripRows.map((s) => s.sceneId);
        const locStatusByScene = new Map<
          string,
          {
            requirementName: string;
            status: string;
          }
        >();
        const dayHasUnconfirmedSet = new Set<string>();

        if (sceneIds.length > 0) {
          const reqRows = await db
            .select({
              sceneId: locationRequirementScenes.sceneId,
              requirementName: locationRequirements.name,
              status: locationRequirements.status,
            })
            .from(locationRequirementScenes)
            .innerJoin(
              locationRequirements,
              eq(
                locationRequirements.id,
                locationRequirementScenes.requirementId,
              ),
            );
          for (const r of reqRows) {
            if (!sceneIds.includes(r.sceneId)) continue;
            // Keep the worst (least-confirmed) status per scene.
            const prev = locStatusByScene.get(r.sceneId);
            if (!prev || rankLocStatus(r.status) < rankLocStatus(prev.status)) {
              locStatusByScene.set(r.sceneId, {
                requirementName: r.requirementName,
                status: r.status,
              });
            }
          }
          for (const s of stripRows) {
            const loc = locStatusByScene.get(s.sceneId);
            if (loc && loc.status !== "confirmed" && loc.status !== "locked") {
              if (s.shootingDayId) dayHasUnconfirmedSet.add(s.shootingDayId);
            }
          }
        }

        const stripsByDay = new Map<string, typeof stripRows>();
        for (const s of stripRows) {
          if (!s.shootingDayId) continue;
          const arr = stripsByDay.get(s.shootingDayId) ?? [];
          arr.push(s);
          stripsByDay.set(s.shootingDayId, arr);
        }

        const strategy = input.strategy ?? "minimize_location_changes";
        const suggestion = days.map((day) => {
          let dayStrips = stripsByDay.get(day.id) ?? [];
          // When respect_location_confirmed is on, keep scenes whose location
          // is unconfirmed at the END of the day so the AD can absorb the risk
          // last (cheaper to bump a later strip than a first-take).
          if (respectLocations) {
            dayStrips = [...dayStrips].sort((a, b) => {
              const aPending = isUnconfirmed(locStatusByScene.get(a.sceneId));
              const bPending = isUnconfirmed(locStatusByScene.get(b.sceneId));
              if (aPending === bPending) return 0;
              return aPending ? 1 : -1;
            });
          }
          // Sort scenes by location to minimize swaps when strategy says so.
          const sorted =
            strategy === "minimize_location_changes"
              ? [...dayStrips].sort((a, b) =>
                  (a.location ?? "").localeCompare(b.location ?? ""),
                )
              : dayStrips;
          return {
            dayNumber: day.dayNumber,
            sceneNumbers: sorted.map((s) => s.sceneNumber),
          };
        });

        const locationWarnings: Array<{
          dayNumber: number;
          sceneNumber: number;
          requirementName: string;
          status: string;
        }> = [];
        for (const day of days) {
          const dayStrips = stripsByDay.get(day.id) ?? [];
          for (const s of dayStrips) {
            const loc = locStatusByScene.get(s.sceneId);
            if (loc && loc.status !== "confirmed" && loc.status !== "locked") {
              locationWarnings.push({
                dayNumber: day.dayNumber,
                sceneNumber: s.sceneNumber,
                requirementName: loc.requirementName,
                status: loc.status,
              });
            }
          }
        }

        const baseRationale =
          strategy === "minimize_location_changes"
            ? "Ho raggruppato le scene per location all'interno di ciascuna giornata. Conferma per applicare la sequenza con move_scene_to_day."
            : "Suggerimento generato. Conferma per applicare uno spostamento alla volta.";
        const warnSuffix =
          respectLocations && locationWarnings.length > 0
            ? ` Attenzione: ${locationWarnings.length} scena/e hanno location non ancora confermata — le ho posticipate dentro la giornata.`
            : "";
        const rationale = baseRationale + warnSuffix;

        return { suggestion, rationale, locationWarnings };
      })(),
      (e) =>
        new CesareError(
          `suggestReorder failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ),
  );

const rankLocStatus = (status: string): number => {
  if (status === "locked") return 3;
  if (status === "confirmed") return 2;
  if (status === "scouting") return 1;
  return 0;
};

const isUnconfirmed = (loc: { status: string } | undefined): boolean => {
  if (!loc) return false;
  return loc.status !== "confirmed" && loc.status !== "locked";
};

// ─── Tool block & router ──────────────────────────────────────────────────────

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export const executeScheduleTool = (
  block: ToolUseBlock,
  db: Db,
  ctx: ScheduleToolContext,
): ResultAsync<ToolResult, CesareError> => {
  const okResult = (id: string, payload: unknown): ToolResult => ({
    type: "tool_result",
    tool_use_id: id,
    content: JSON.stringify(payload),
  });

  if (block.name === "move_scene_to_day") {
    return executeMoveSceneToDay(
      block.input as MoveSceneToDayInput,
      db,
      ctx,
    ).map((r) => okResult(block.id, r));
  }
  if (block.name === "merge_days") {
    return executeMergeDays(block.input as MergeDaysInput, db, ctx).map((r) =>
      okResult(block.id, r),
    );
  }
  if (block.name === "swap_scenes") {
    return executeSwapScenes(block.input as SwapScenesInput, db, ctx).map((r) =>
      okResult(block.id, r),
    );
  }
  if (block.name === "lock_day") {
    return setLockForDay(block.input as LockUnlockDayInput, db, ctx, true).map(
      (r) => okResult(block.id, r),
    );
  }
  if (block.name === "unlock_day") {
    return setLockForDay(block.input as LockUnlockDayInput, db, ctx, false).map(
      (r) => okResult(block.id, r),
    );
  }
  if (block.name === "get_weather_forecast") {
    return executeGetWeatherForecast(block.input as WeatherInput).map((r) =>
      okResult(block.id, r),
    );
  }
  if (block.name === "suggest_reorder") {
    return executeSuggestReorder(
      block.input as SuggestReorderInput,
      db,
      ctx,
    ).map((r) => okResult(block.id, r));
  }

  return okAsync(
    okResult(block.id, {
      error: `Unknown schedule tool: ${block.name}`,
    }),
  );
};

// ─── Schedule tools factory (AI SDK v5 format) ───────────────────────────────

export const createScheduleTools = (db: Db, ctx: ScheduleToolContext) => ({
  move_scene_to_day: tool({
    description:
      "Sposta una scena (identificata dal suo numero) su una giornata di ripresa specifica. " +
      "Usa quando l'utente chiede di riorganizzare lo schedule.",
    inputSchema: z.object({
      scene_number: z.number().describe("Numero della scena da spostare"),
      target_day_number: z
        .number()
        .describe("Numero della giornata di destinazione (1-based)"),
    }),
    execute: async (input, _opts) => {
      const result = await executeMoveSceneToDay(
        input as MoveSceneToDayInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  merge_days: tool({
    description:
      "Accorpa tutte le scene di due giornate. Le scene della seconda giornata vengono spostate sulla prima, e la seconda viene rimossa (con renumber automatico).",
    inputSchema: z.object({
      day_a_number: z.number().describe("Numero della giornata che resta"),
      day_b_number: z
        .number()
        .describe(
          "Numero della giornata da assorbire (verrà rimossa dopo lo spostamento)",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeMergeDays(input as MergeDaysInput, db, ctx);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  swap_scenes: tool({
    description:
      "Scambia la posizione di due scene tra le rispettive giornate di ripresa.",
    inputSchema: z.object({
      scene_a_number: z.number(),
      scene_b_number: z.number(),
    }),
    execute: async (input, _opts) => {
      const result = await executeSwapScenes(input as SwapScenesInput, db, ctx);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  lock_day: tool({
    description:
      "Blocca tutte le strip di una giornata (impedisce ulteriori spostamenti dell'AI o drag-and-drop).",
    inputSchema: z.object({
      day_number: z.number(),
    }),
    execute: async (input, _opts) => {
      const result = await setLockForDay(
        input as LockUnlockDayInput,
        db,
        ctx,
        true,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  unlock_day: tool({
    description: "Sblocca tutte le strip di una giornata.",
    inputSchema: z.object({
      day_number: z.number(),
    }),
    execute: async (input, _opts) => {
      const result = await setLockForDay(
        input as LockUnlockDayInput,
        db,
        ctx,
        false,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  get_weather_forecast: tool({
    description:
      "Recupera le previsioni meteo per una location e una data tramite Open-Meteo. " +
      "Restituisce probabilità pioggia, temperature, vento e condizioni. " +
      "Usa per valutare l'impatto del meteo sulla probabilità di riuscita di una giornata con esterni.",
    inputSchema: z.object({
      lat: z.number().describe("Latitudine"),
      lng: z.number().describe("Longitudine"),
      date: z
        .string()
        .describe("Data ISO YYYY-MM-DD (entro 16 giorni dal presente)"),
    }),
    execute: async (input, _opts) => {
      const result = await executeGetWeatherForecast(input as WeatherInput);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  suggest_reorder: tool({
    description:
      "Cesare propone una nuova sequenza ottimizzata dello schedule. Restituisce il piano proposto come testo, senza applicarlo. L'utente decide se accettarlo o meno.",
    inputSchema: z.object({
      strategy: z
        .string()
        .optional()
        .describe(
          "Strategia di ottimizzazione, es. 'minimize_location_changes', 'concentrate_night_exteriors', 'balance_workload'",
        ),
      respect_location_confirmed: z
        .boolean()
        .optional()
        .describe(
          "Se true, penalizza il riassegnare scene a giornate la cui location non è ancora confermata (status diverso da 'confirmed'/'locked'). Default false.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeSuggestReorder(
        input as SuggestReorderInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type ScheduleTools = ReturnType<typeof createScheduleTools>;

// Silence unused imports kept for symmetry with sibling tool modules
void isNull;
