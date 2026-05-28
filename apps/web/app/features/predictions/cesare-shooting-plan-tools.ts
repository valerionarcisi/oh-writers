import { tool } from "ai";
import { z } from "zod";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { and, eq, asc, sql } from "drizzle-orm";
import {
  shotPlans,
  shotPlanScenarios,
  shots,
  scenes,
  screenplays,
  sceneBlockings,
  planSceneCameras,
  locations,
  breakdownElements,
  breakdownOccurrences,
} from "@oh-writers/db/schema";
import {
  buildCesareBlockingPrompt,
  parseCesareBlockingResponse,
  type CesareBlockingInput,
  type ActorPosition,
  type CameraPin,
  type Primitive,
} from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { callHaiku, extractText } from "~/features/ai";
import { CesareError } from "./cesare.errors";

// ─── Shot enum (mirrors the Drizzle schema) ──────────────────────────────────

const SHOT_SIZES = [
  "EWS",
  "WS",
  "MS",
  "MCU",
  "CU",
  "ECU",
  "INSERT",
  "OTS",
  "TWO_SHOT",
  "POV",
] as const;
type ShotSize = (typeof SHOT_SIZES)[number];

const CAMERA_MOVEMENTS = [
  "STATIC",
  "PAN",
  "TILT",
  "DOLLY",
  "HANDHELD",
  "STEADICAM",
  "CRANE",
  "DRONE",
  "ZOOM",
] as const;
type CameraMovement = (typeof CAMERA_MOVEMENTS)[number];

// ─── Tool definitions ────────────────────────────────────────────────────────

export const CESARE_SHOOTING_PLAN_TOOLS = [
  {
    name: "add_parallel_plan",
    description:
      "Crea un nuovo piano inquadrature parallelo per una scena (es. Piano B, Piano C). " +
      "Il primo piano (Piano A) viene creato automaticamente, quindi usa questo tool solo per piani aggiuntivi. " +
      "Non attiva automaticamente il piano: l'utente o set_active_plan decide quale rendere attivo.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_id: {
          type: "string",
          description:
            "UUID della scena a cui collegare il piano. Se omesso, viene usata la scena attiva del contesto.",
        },
        name: {
          type: "string",
          description:
            "Nome del nuovo piano. Tipicamente 'Piano B', 'Piano C', 'Versione classica', 'Versione handheld'.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "add_shot_to_plan",
    description:
      "Aggiunge uno shot alla fine di un piano esistente. La posizione viene calcolata automaticamente. " +
      "Usa questo tool dopo add_parallel_plan per popolare il piano.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_id: {
          type: "string",
          description: "UUID dello shot plan scenario (NON del shot_plan).",
        },
        shot_type: {
          type: "string",
          enum: [...SHOT_SIZES],
          description:
            "Tipo di inquadratura. EWS=campo lunghissimo, WS=campo lungo, MS=mezza figura, MCU=mezzo primo piano, CU=primo piano, ECU=primissimo piano, INSERT=dettaglio, OTS=su le spalle, TWO_SHOT=campo a due, POV=soggettiva.",
        },
        camera_movement: {
          type: "string",
          enum: [...CAMERA_MOVEMENTS],
          description: "Movimento camera. Default STATIC se non specificato.",
        },
        description: {
          type: "string",
          description: "Note descrittive sull'inquadratura.",
        },
        duration_min: {
          type: "number",
          description: "Durata stimata in minuti (setup + take).",
        },
      },
      required: ["plan_id", "shot_type"],
    },
  },
  {
    name: "set_active_plan",
    description:
      "Rende attivo un piano per la sua scena (tutti i piani fratelli vengono disattivati). Operazione atomica.",
    input_schema: {
      type: "object" as const,
      properties: {
        plan_id: {
          type: "string",
          description: "UUID dello shot plan scenario da attivare.",
        },
      },
      required: ["plan_id"],
    },
  },
  {
    name: "update_shot",
    description:
      "Modifica i campi di uno shot esistente. Campi consentiti: shot_type, camera_movement, description, duration_min, position.",
    input_schema: {
      type: "object" as const,
      properties: {
        shot_id: { type: "string", description: "UUID dello shot." },
        patch: {
          type: "object" as const,
          properties: {
            shot_type: { type: "string", enum: [...SHOT_SIZES] },
            camera_movement: { type: "string", enum: [...CAMERA_MOVEMENTS] },
            description: { type: "string" },
            duration_min: { type: "number" },
            position: { type: "number" },
          },
        },
      },
      required: ["shot_id", "patch"],
    },
  },
  {
    name: "remove_shot",
    description:
      "Rimuove uno shot dal piano. La scena/piano deve appartenere al progetto corrente.",
    input_schema: {
      type: "object" as const,
      properties: {
        shot_id: { type: "string", description: "UUID dello shot." },
      },
      required: ["shot_id"],
    },
  },
  {
    name: "generate_plan_from_description",
    description:
      "Crea un nuovo piano e lo popola di shot a partire da una descrizione testuale " +
      "(es. 'classico: WS forno, due CU di Giulio, OTS Tea, insert delle foto'). " +
      "Riconosce le keyword di tipo shot (WS/wide/campo lungo, CU/primo piano, OTS/su le spalle, INSERT/dettaglio, etc).",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_id: {
          type: "string",
          description:
            "UUID della scena. Se omesso, viene usata la scena attiva.",
        },
        plan_name: { type: "string", description: "Nome del nuovo piano." },
        description: {
          type: "string",
          description: "Descrizione testuale del piano con gli shot.",
        },
      },
      required: ["plan_name", "description"],
    },
  },
  {
    name: "propose_blocking_for_scene",
    description:
      "Propone una disposizione completa di blocking (attori + camere) per una scena, mostrata come ghost-pins sull'editor 2D che l'utente può accettare singolarmente o in blocco. Non scrive nulla a DB: restituisce solo il payload della proposta.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_id: {
          type: "string",
          description:
            "UUID della scena per cui proporre il blocking. Se omesso, viene usata la scena attiva del contesto.",
        },
      },
      required: [],
    },
  },
  {
    name: "propose_move_actor_position",
    description:
      "Propone di spostare un attore a una nuova posizione (x, y) nello stage 2D. L'utente vede un'anteprima fantasma e può accettare. Non scrive a DB.",
    input_schema: {
      type: "object" as const,
      properties: {
        actor_position_id: {
          type: "string",
          description: "Identificatore dell'attore (castId).",
        },
        x: { type: "number", description: "Nuova coordinata x in cm." },
        y: { type: "number", description: "Nuova coordinata y in cm." },
        reason: {
          type: "string",
          description: "Motivo dello spostamento (mostrato all'utente).",
        },
      },
      required: ["actor_position_id", "x", "y"],
    },
  },
  {
    name: "propose_move_camera_pin",
    description:
      "Propone di spostare una camera a una nuova posizione (x, y, direction). Anteprima fantasma. Non scrive a DB.",
    input_schema: {
      type: "object" as const,
      properties: {
        camera_pin_id: {
          type: "string",
          description: "Identificatore della camera (shotId).",
        },
        x: { type: "number", description: "Nuova coordinata x in cm." },
        y: { type: "number", description: "Nuova coordinata y in cm." },
        direction_deg: {
          type: "number",
          description:
            "Nuova direzione del cono camera in gradi (0 = nord, in senso orario).",
        },
        reason: {
          type: "string",
          description: "Motivo dello spostamento (mostrato all'utente).",
        },
      },
      required: ["camera_pin_id", "x", "y"],
    },
  },
] as const;

export const CESARE_SHOOTING_PLAN_PROPOSE_TOOLS = [
  "propose_blocking_for_scene",
  "propose_move_actor_position",
  "propose_move_camera_pin",
] as const;

// ─── Context ──────────────────────────────────────────────────────────────────

export interface ShootingPlanToolContext {
  readonly projectId: string;
  readonly activeSceneId: string | null;
}

// ─── Shot keyword parser (pure, testable) ────────────────────────────────────

interface ParsedShot {
  readonly shotSize: ShotSize;
  readonly description: string;
}

const SHOT_KEYWORD_PATTERNS: ReadonlyArray<{
  readonly regex: RegExp;
  readonly shotSize: ShotSize;
}> = [
  { regex: /\bews\b|campo\s+lunghissimo|extreme\s+wide/i, shotSize: "EWS" },
  { regex: /\bws\b|wide(?:\s+shot)?|campo\s+lungo|totale/i, shotSize: "WS" },
  {
    regex: /\bots\b|over[- ]?the[- ]?shoulder|su\s+le?\s+spalle/i,
    shotSize: "OTS",
  },
  {
    regex: /\becu\b|extreme\s+close[- ]?up|primissimo\s+piano/i,
    shotSize: "ECU",
  },
  {
    regex: /\bmcu\b|medium\s+close[- ]?up|mezzo\s+primo\s+piano/i,
    shotSize: "MCU",
  },
  { regex: /\bcu\b|close[- ]?up|primo\s+piano/i, shotSize: "CU" },
  { regex: /\binserts?\b|dettagli[oa]?/i, shotSize: "INSERT" },
  { regex: /\btwo[- ]?shot\b|campo\s+a\s+due/i, shotSize: "TWO_SHOT" },
  { regex: /\bpov\b|soggettiva/i, shotSize: "POV" },
  { regex: /\bms\b|medium(?:\s+shot)?|mezza\s+figura/i, shotSize: "MS" },
];

const splitDescriptionIntoClauses = (description: string): string[] => {
  return description
    .split(/[,;\n]|\be\s+|\bpoi\b|\binoltre\b|\binfine\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
};

const matchShotSize = (clause: string): ShotSize | null => {
  for (const pattern of SHOT_KEYWORD_PATTERNS) {
    if (pattern.regex.test(clause)) return pattern.shotSize;
  }
  return null;
};

// Detects a leading repetition count like "due CU", "3 inserts", "tre primi piani".
const ITALIAN_NUMBERS: Record<string, number> = {
  uno: 1,
  un: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
};

const extractRepeatCount = (clause: string): number => {
  const numericMatch = clause.match(/^\s*(\d+)\s+/);
  if (numericMatch && numericMatch[1]) {
    const n = parseInt(numericMatch[1], 10);
    if (Number.isFinite(n) && n > 0 && n <= 10) return n;
  }
  const wordMatch = clause.match(/^\s*([a-zà-ÿ]+)\s+/i);
  if (wordMatch && wordMatch[1]) {
    const n = ITALIAN_NUMBERS[wordMatch[1].toLowerCase()];
    if (n) return n;
  }
  return 1;
};

export const parsePlanDescription = (description: string): ParsedShot[] => {
  const clauses = splitDescriptionIntoClauses(description);
  const shots: ParsedShot[] = [];
  for (const clause of clauses) {
    const size = matchShotSize(clause);
    if (!size) continue;
    const count = extractRepeatCount(clause);
    for (let i = 0; i < count; i++) {
      shots.push({ shotSize: size, description: clause });
    }
  }
  if (shots.length === 0) {
    return [{ shotSize: "WS", description: description.trim() }];
  }
  return shots;
};

// Returns a realistic default duration in minutes for a shot type.
const defaultDurationFor = (size: ShotSize): number => {
  switch (size) {
    case "INSERT":
      return 15;
    case "ECU":
    case "CU":
    case "MCU":
      return 20;
    case "OTS":
    case "TWO_SHOT":
    case "POV":
      return 25;
    case "MS":
      return 25;
    case "WS":
    case "EWS":
      return 45;
    default:
      return 25;
  }
};

// ─── DB helpers ──────────────────────────────────────────────────────────────

const resolveSceneId = (
  ctx: ShootingPlanToolContext,
  sceneIdInput: string | undefined,
): string | null => sceneIdInput || ctx.activeSceneId;

// Confirms the scene belongs to a screenplay of the current project. This is the
// safety gate that prevents Cesare from acting on scenes outside scope.
const ensureSceneInProject = (
  db: Db,
  sceneId: string,
  projectId: string,
): ResultAsync<{ sceneId: string }, CesareError> =>
  ResultAsync.fromPromise(
    db
      .select({ id: scenes.id })
      .from(scenes)
      .innerJoin(screenplays, eq(scenes.screenplayId, screenplays.id))
      .where(and(eq(scenes.id, sceneId), eq(screenplays.projectId, projectId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `ensureSceneInProject failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) =>
    row
      ? okAsync({ sceneId: row.id })
      : errAsync(
          new CesareError(
            `Scena ${sceneId} non appartiene al progetto corrente`,
          ),
        ),
  );

// Loads a scenario along with its parent plan, asserting the scene belongs to
// the current project. Returns the surrounding rows we need for nearly every
// mutation.
const loadScenarioInProject = (
  db: Db,
  scenarioId: string,
  projectId: string,
): ResultAsync<
  { scenarioId: string; shotPlanId: string; sceneId: string },
  CesareError
> =>
  ResultAsync.fromPromise(
    db
      .select({
        scenarioId: shotPlanScenarios.id,
        shotPlanId: shotPlans.id,
        sceneId: shotPlans.sceneId,
        planProjectId: shotPlans.projectId,
      })
      .from(shotPlanScenarios)
      .innerJoin(shotPlans, eq(shotPlanScenarios.shotPlanId, shotPlans.id))
      .where(eq(shotPlanScenarios.id, scenarioId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `loadScenarioInProject failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) => {
    if (!row)
      return errAsync(new CesareError(`Piano ${scenarioId} non trovato`));
    if (row.planProjectId !== projectId)
      return errAsync(
        new CesareError(
          `Piano ${scenarioId} non appartiene al progetto corrente`,
        ),
      );
    return okAsync({
      scenarioId: row.scenarioId,
      shotPlanId: row.shotPlanId,
      sceneId: row.sceneId,
    });
  });

const loadShotInProject = (
  db: Db,
  shotId: string,
  projectId: string,
): ResultAsync<
  { shotId: string; scenarioId: string; position: number },
  CesareError
> =>
  ResultAsync.fromPromise(
    db
      .select({
        shotId: shots.id,
        scenarioId: shots.scenarioId,
        position: shots.position,
        planProjectId: shotPlans.projectId,
      })
      .from(shots)
      .innerJoin(shotPlanScenarios, eq(shots.scenarioId, shotPlanScenarios.id))
      .innerJoin(shotPlans, eq(shotPlanScenarios.shotPlanId, shotPlans.id))
      .where(eq(shots.id, shotId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `loadShotInProject failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) => {
    if (!row) return errAsync(new CesareError(`Shot ${shotId} non trovato`));
    if (row.planProjectId !== projectId)
      return errAsync(
        new CesareError(`Shot ${shotId} non appartiene al progetto corrente`),
      );
    return okAsync({
      shotId: row.shotId,
      scenarioId: row.scenarioId,
      position: row.position,
    });
  });

// ─── Tool executors ───────────────────────────────────────────────────────────

interface AddParallelPlanInput {
  scene_id?: string;
  name: string;
}

const executeAddParallelPlan = (
  input: AddParallelPlanInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<
  { plan_id: string; name: string; toast_message: string },
  CesareError
> => {
  const sceneId = resolveSceneId(ctx, input.scene_id);
  if (!sceneId) {
    return errAsync(
      new CesareError(
        "scene_id mancante e nessuna scena attiva nel contesto — chiedi all'utente quale scena.",
      ),
    );
  }
  const planName = input.name.trim();
  if (!planName) {
    return errAsync(new CesareError("Il nome del piano non può essere vuoto"));
  }

  return ensureSceneInProject(db, sceneId, ctx.projectId).andThen(() =>
    ResultAsync.fromPromise(
      db.transaction(async (tx) => {
        const existingPlan = await tx.query.shotPlans.findFirst({
          where: eq(shotPlans.sceneId, sceneId),
        });

        let planRow = existingPlan ?? null;
        if (!planRow) {
          const rows = await tx
            .insert(shotPlans)
            .values({
              projectId: ctx.projectId,
              sceneId,
              activeScenarioId: null,
            })
            .returning();
          planRow = rows[0] ?? null;
          if (!planRow) throw new Error("Insert shotPlan returned no rows");
        }

        const siblings = await tx
          .select({
            id: shotPlanScenarios.id,
            name: shotPlanScenarios.name,
            position: shotPlanScenarios.position,
          })
          .from(shotPlanScenarios)
          .where(eq(shotPlanScenarios.shotPlanId, planRow.id));

        if (
          siblings.some((s) => s.name.toLowerCase() === planName.toLowerCase())
        ) {
          throw new Error(
            `Esiste già un piano con nome "${planName}" per questa scena`,
          );
        }

        const nextPosition = siblings.reduce(
          (max, s) => Math.max(max, s.position + 1),
          siblings.length,
        );

        const inserted = await tx
          .insert(shotPlanScenarios)
          .values({
            shotPlanId: planRow.id,
            name: planName,
            position: nextPosition,
            isSuggested: false,
          })
          .returning();

        const scenario = inserted[0];
        if (!scenario) throw new Error("Insert scenario returned no rows");
        return { id: scenario.id, name: scenario.name };
      }),
      (e) =>
        new CesareError(
          `addParallelPlan failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ).map((scenario) => ({
      plan_id: scenario.id,
      name: scenario.name,
      toast_message: `${scenario.name} creato`,
    })),
  );
};

interface AddShotToPlanInput {
  plan_id: string;
  shot_type: ShotSize;
  camera_movement?: CameraMovement;
  description?: string;
  duration_min?: number;
}

const executeAddShotToPlan = (
  input: AddShotToPlanInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<
  { shot_id: string; position: number; toast_message: string },
  CesareError
> => {
  if (!SHOT_SIZES.includes(input.shot_type)) {
    return errAsync(
      new CesareError(`shot_type non valido: ${String(input.shot_type)}`),
    );
  }
  const cameraMovement: CameraMovement = input.camera_movement ?? "STATIC";
  if (!CAMERA_MOVEMENTS.includes(cameraMovement)) {
    return errAsync(
      new CesareError(`camera_movement non valido: ${String(cameraMovement)}`),
    );
  }

  return loadScenarioInProject(db, input.plan_id, ctx.projectId).andThen(
    (scenario) =>
      ResultAsync.fromPromise(
        db.transaction(async (tx) => {
          const existing = await tx
            .select({ position: shots.position })
            .from(shots)
            .where(eq(shots.scenarioId, scenario.scenarioId))
            .orderBy(asc(shots.position));

          const nextPosition = existing.reduce(
            (max, s) => Math.max(max, s.position + 1),
            existing.length,
          );

          const inserted = await tx
            .insert(shots)
            .values({
              scenarioId: scenario.scenarioId,
              position: nextPosition,
              shotSize: input.shot_type,
              cameraMovement,
              cameraLabel: "A",
              estimatedMinutes:
                input.duration_min ?? defaultDurationFor(input.shot_type),
              notes: input.description ?? null,
            })
            .returning();
          const row = inserted[0];
          if (!row) throw new Error("Insert shot returned no rows");

          await tx.execute(
            sql`UPDATE shot_plan_scenarios SET is_suggested = false WHERE id = ${scenario.scenarioId}`,
          );

          return { id: row.id, position: nextPosition };
        }),
        (e) =>
          new CesareError(
            `addShotToPlan failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
      ).map((row) => ({
        shot_id: row.id,
        position: row.position,
        toast_message: `Aggiunto shot ${input.shot_type} (#${row.position + 1})`,
      })),
  );
};

interface SetActivePlanInput {
  plan_id: string;
}

const executeSetActivePlan = (
  input: SetActivePlanInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<{ plan_id: string; toast_message: string }, CesareError> =>
  loadScenarioInProject(db, input.plan_id, ctx.projectId).andThen((scenario) =>
    ResultAsync.fromPromise(
      db.transaction(async (tx) => {
        await tx
          .update(shotPlans)
          .set({ activeScenarioId: scenario.scenarioId, updatedAt: new Date() })
          .where(eq(shotPlans.id, scenario.shotPlanId));
      }),
      (e) =>
        new CesareError(
          `setActivePlan failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ).map(() => ({
      plan_id: scenario.scenarioId,
      toast_message: "Piano attivato",
    })),
  );

interface UpdateShotInput {
  shot_id: string;
  patch: {
    shot_type?: ShotSize;
    camera_movement?: CameraMovement;
    description?: string;
    duration_min?: number;
    position?: number;
  };
}

const executeUpdateShot = (
  input: UpdateShotInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<{ shot_id: string; toast_message: string }, CesareError> => {
  if (input.patch.shot_type && !SHOT_SIZES.includes(input.patch.shot_type)) {
    return errAsync(
      new CesareError(`shot_type non valido: ${String(input.patch.shot_type)}`),
    );
  }
  if (
    input.patch.camera_movement &&
    !CAMERA_MOVEMENTS.includes(input.patch.camera_movement)
  ) {
    return errAsync(
      new CesareError(
        `camera_movement non valido: ${String(input.patch.camera_movement)}`,
      ),
    );
  }

  return loadShotInProject(db, input.shot_id, ctx.projectId).andThen((shot) => {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (input.patch.shot_type) update["shotSize"] = input.patch.shot_type;
    if (input.patch.camera_movement)
      update["cameraMovement"] = input.patch.camera_movement;
    if (input.patch.description !== undefined)
      update["notes"] = input.patch.description;
    if (input.patch.duration_min !== undefined)
      update["estimatedMinutes"] = input.patch.duration_min;
    if (input.patch.position !== undefined)
      update["position"] = input.patch.position;

    return ResultAsync.fromPromise(
      (async () => {
        await db.update(shots).set(update).where(eq(shots.id, shot.shotId));
        await db.execute(
          sql`UPDATE shot_plan_scenarios SET is_suggested = false WHERE id = ${shot.scenarioId}`,
        );
      })(),
      (e) =>
        new CesareError(
          `updateShot failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ).map(() => ({
      shot_id: shot.shotId,
      toast_message: "Shot aggiornato",
    }));
  });
};

interface RemoveShotInput {
  shot_id: string;
}

const executeRemoveShot = (
  input: RemoveShotInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<{ shot_id: string; toast_message: string }, CesareError> =>
  loadShotInProject(db, input.shot_id, ctx.projectId).andThen((shot) =>
    ResultAsync.fromPromise(
      (async () => {
        await db.delete(shots).where(eq(shots.id, shot.shotId));
        await db.execute(
          sql`UPDATE shot_plan_scenarios SET is_suggested = false WHERE id = ${shot.scenarioId}`,
        );
      })(),
      (e) =>
        new CesareError(
          `removeShot failed: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ).map(() => ({
      shot_id: shot.shotId,
      toast_message: "Shot rimosso",
    })),
  );

interface GeneratePlanFromDescriptionInput {
  scene_id?: string;
  plan_name: string;
  description: string;
}

const executeGeneratePlanFromDescription = (
  input: GeneratePlanFromDescriptionInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<
  { plan_id: string; shot_count: number; toast_message: string },
  CesareError
> => {
  const parsedShots = parsePlanDescription(input.description);

  return executeAddParallelPlan(
    { scene_id: input.scene_id, name: input.plan_name },
    db,
    ctx,
  ).andThen((plan) => {
    const addOne = (index: number): ResultAsync<void, CesareError> => {
      if (index >= parsedShots.length) return okAsync(undefined);
      const shot = parsedShots[index];
      if (!shot) return okAsync(undefined);
      return executeAddShotToPlan(
        {
          plan_id: plan.plan_id,
          shot_type: shot.shotSize,
          description: shot.description,
          duration_min: defaultDurationFor(shot.shotSize),
        },
        db,
        ctx,
      ).andThen(() => addOne(index + 1));
    };

    return addOne(0).map(() => ({
      plan_id: plan.plan_id,
      shot_count: parsedShots.length,
      toast_message: `${plan.name} creato con ${parsedShots.length} shot`,
    }));
  });
};

// ─── Blocking proposal generator (testable, framework-agnostic) ───────────────
//
// Proposals are NOT persisted to DB: they are returned to the client as a
// payload that the canvas renders as ghost overlays. Acceptance flows back to
// the existing `saveActorPositions` / `saveCameraPin` server functions, which
// already handle the writes.

export interface BlockingProposalActor {
  readonly kind: "actor";
  readonly castId: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface BlockingProposalCamera {
  readonly kind: "camera";
  readonly shotId: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly coneDirection: number;
  readonly coneAngle: number;
}

export type BlockingProposalItem =
  | BlockingProposalActor
  | BlockingProposalCamera;

export interface BlockingProposal {
  readonly proposalId: string;
  readonly sceneId: string;
  readonly suggestions: ReadonlyArray<BlockingProposalItem>;
  readonly reason?: string;
}

// Pure parser: turns a Cesare blocking response (already parsed by the
// shared domain helper) into the wire-friendly proposal payload. Exported for
// Vitest tests.
export const parseBlockingProposal = (
  sceneId: string,
  actorPositions: ReadonlyArray<ActorPosition>,
  cameraPins: ReadonlyArray<CameraPin>,
  proposalId: string,
): BlockingProposal => {
  const actors: BlockingProposalActor[] = actorPositions.map((a) => ({
    kind: "actor" as const,
    castId: a.castId,
    label: a.label,
    x: a.x,
    y: a.y,
  }));
  const cameras: BlockingProposalCamera[] = cameraPins.map((c) => ({
    kind: "camera" as const,
    shotId: c.shotId,
    label: c.label,
    x: c.x,
    y: c.y,
    coneDirection: c.coneDirection,
    coneAngle: c.coneAngle,
  }));
  return {
    proposalId,
    sceneId,
    suggestions: [...actors, ...cameras],
  };
};

// Generates a UUID-like id without pulling in extra deps. Good enough for an
// in-memory proposal handle (the client uses it only to disambiguate).
const newProposalId = (): string =>
  `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const loadSceneForBlockingProposal = (
  db: Db,
  sceneId: string,
  projectId: string,
): ResultAsync<
  { sceneId: string; heading: string; notes: string },
  CesareError
> =>
  ResultAsync.fromPromise(
    db
      .select({
        id: scenes.id,
        heading: scenes.heading,
        notes: scenes.notes,
        projectId: screenplays.projectId,
      })
      .from(scenes)
      .innerJoin(screenplays, eq(scenes.screenplayId, screenplays.id))
      .where(eq(scenes.id, sceneId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `loadSceneForBlockingProposal failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) => {
    if (!row) return errAsync(new CesareError(`Scena ${sceneId} non trovata`));
    if (row.projectId !== projectId)
      return errAsync(
        new CesareError(`Scena ${sceneId} non appartiene al progetto corrente`),
      );
    return okAsync({
      sceneId: row.id,
      heading: row.heading ?? "",
      notes: row.notes ?? "",
    });
  });

interface ProposeBlockingForSceneInput {
  scene_id?: string;
}

const executeProposeBlockingForScene = (
  input: ProposeBlockingForSceneInput,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<BlockingProposal, CesareError> => {
  const sceneId = resolveSceneId(ctx, input.scene_id);
  if (!sceneId) {
    return errAsync(
      new CesareError(
        "scene_id mancante e nessuna scena attiva — chiedi all'utente quale scena.",
      ),
    );
  }
  return loadSceneForBlockingProposal(db, sceneId, ctx.projectId).andThen(
    (scene) =>
      ResultAsync.fromPromise(
        (async (): Promise<BlockingProposal> => {
          // Look up cast occurrences + the existing scene blocking so the
          // proposal can be regenerated when the user is dissatisfied.
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
                eq(breakdownOccurrences.sceneId, scene.sceneId),
                eq(breakdownElements.category, "cast"),
              ),
            );

          const existingBlocking = await db.query.sceneBlockings.findFirst({
            where: eq(sceneBlockings.sceneId, scene.sceneId),
          });

          const locationRow = existingBlocking
            ? await db.query.locations.findFirst({
                where: eq(locations.id, existingBlocking.locationId),
              })
            : null;

          const widthCm = locationRow?.widthCm ?? 600;
          const heightCm = locationRow?.heightCm ?? 400;
          const primitives = (locationRow?.primitives ??
            []) as unknown as Primitive[];

          const existingPlanCameras = existingBlocking
            ? await db.query.planSceneCameras.findFirst({
                where: eq(planSceneCameras.sceneId, scene.sceneId),
              })
            : null;

          const cesareInput: CesareBlockingInput = {
            fountainText: scene.notes,
            sceneHeading: scene.heading,
            cast: castRows,
            props: [],
            shots: (existingPlanCameras?.cameraPins as unknown as
              | CameraPin[]
              | undefined)
              ? (existingPlanCameras!.cameraPins as unknown as CameraPin[]).map(
                  (p, i) => ({
                    id: p.shotId,
                    shotSize: "WS",
                    cameraMovement: "STATIC",
                    cameraLabel: `${String.fromCharCode(65 + i)} · ${p.label}`,
                  }),
                )
              : [],
            locationPrimitives: primitives,
            widthCm,
            heightCm,
            projectSuggestionHistory: { accepted: [], ignored: [] },
          };

          if (process.env["MOCK_AI"] === "true") {
            const parsed = parseCesareBlockingResponse("", cesareInput);
            // When the seed lacks breakdownOccurrences/cast, the safe defaults
            // are empty. Emit a small demonstration proposal so the ghost UI
            // still shows up in mock E2E.
            const demoActors =
              parsed.actorPositions.length > 0
                ? parsed.actorPositions
                : [
                    {
                      castId: `demo-actor-${scene.sceneId}`,
                      label: "Personaggio A",
                      x: Math.round(widthCm * 0.4),
                      y: Math.round(heightCm * 0.5),
                      arrow: null,
                    },
                  ];
            const demoCameras =
              parsed.cameraPins.length > 0
                ? parsed.cameraPins
                : [
                    {
                      shotId: `demo-cam-${scene.sceneId}`,
                      label: "A · WS",
                      x: Math.round(widthCm * 0.7),
                      y: Math.round(heightCm * 0.3),
                      coneAngle: 60,
                      coneDirection: 225,
                      movement: null,
                    },
                  ];
            return parseBlockingProposal(
              scene.sceneId,
              demoActors,
              demoCameras,
              newProposalId(),
            );
          }

          const result = await callHaiku(
            {
              system:
                "You are a professional film assistant director. Respond only with JSON.",
              fewShot: {},
              user: buildCesareBlockingPrompt(cesareInput),
              maxTokens: 1024,
            },
            "cesare/blocking-propose",
          );
          if (result.isErr()) {
            const fallback = parseCesareBlockingResponse("", cesareInput);
            return parseBlockingProposal(
              scene.sceneId,
              fallback.actorPositions,
              fallback.cameraPins,
              newProposalId(),
            );
          }
          const text = extractText(result.value.content) ?? "";
          const parsed = parseCesareBlockingResponse(text, cesareInput);
          return parseBlockingProposal(
            scene.sceneId,
            parsed.actorPositions,
            parsed.cameraPins,
            newProposalId(),
          );
        })(),
        (e) =>
          new CesareError(
            `proposeBlockingForScene failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
      ),
  );
};

interface ProposeMoveActorInput {
  actor_position_id: string;
  x: number;
  y: number;
  reason?: string;
}

const executeProposeMoveActor = (
  input: ProposeMoveActorInput,
  _db: Db,
  _ctx: ShootingPlanToolContext,
): ResultAsync<
  {
    proposed_id: string;
    kind: "actor";
    castId: string;
    x: number;
    y: number;
    reason: string | null;
  },
  CesareError
> => {
  if (!input.actor_position_id) {
    return errAsync(new CesareError("actor_position_id mancante"));
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return errAsync(new CesareError("x/y devono essere numeri finiti"));
  }
  return okAsync({
    proposed_id: newProposalId(),
    kind: "actor" as const,
    castId: input.actor_position_id,
    x: input.x,
    y: input.y,
    reason: input.reason ?? null,
  });
};

interface ProposeMoveCameraInput {
  camera_pin_id: string;
  x: number;
  y: number;
  direction_deg?: number;
  reason?: string;
}

const executeProposeMoveCamera = (
  input: ProposeMoveCameraInput,
  _db: Db,
  _ctx: ShootingPlanToolContext,
): ResultAsync<
  {
    proposed_id: string;
    kind: "camera";
    shotId: string;
    x: number;
    y: number;
    direction_deg: number | null;
    reason: string | null;
  },
  CesareError
> => {
  if (!input.camera_pin_id) {
    return errAsync(new CesareError("camera_pin_id mancante"));
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return errAsync(new CesareError("x/y devono essere numeri finiti"));
  }
  return okAsync({
    proposed_id: newProposalId(),
    kind: "camera" as const,
    shotId: input.camera_pin_id,
    x: input.x,
    y: input.y,
    direction_deg:
      input.direction_deg !== undefined && Number.isFinite(input.direction_deg)
        ? input.direction_deg
        : null,
    reason: input.reason ?? null,
  });
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

export const executeShootingPlanTool = (
  block: ToolUseBlock,
  db: Db,
  ctx: ShootingPlanToolContext,
): ResultAsync<ToolResult, CesareError> => {
  const ok = (id: string, payload: unknown): ToolResult => ({
    type: "tool_result",
    tool_use_id: id,
    content: JSON.stringify(payload),
  });

  if (block.name === "add_parallel_plan") {
    return executeAddParallelPlan(
      block.input as AddParallelPlanInput,
      db,
      ctx,
    ).map((r) => ok(block.id, r));
  }
  if (block.name === "add_shot_to_plan") {
    return executeAddShotToPlan(block.input as AddShotToPlanInput, db, ctx).map(
      (r) => ok(block.id, r),
    );
  }
  if (block.name === "set_active_plan") {
    return executeSetActivePlan(block.input as SetActivePlanInput, db, ctx).map(
      (r) => ok(block.id, r),
    );
  }
  if (block.name === "update_shot") {
    return executeUpdateShot(block.input as UpdateShotInput, db, ctx).map((r) =>
      ok(block.id, r),
    );
  }
  if (block.name === "remove_shot") {
    return executeRemoveShot(block.input as RemoveShotInput, db, ctx).map((r) =>
      ok(block.id, r),
    );
  }
  if (block.name === "generate_plan_from_description") {
    return executeGeneratePlanFromDescription(
      block.input as GeneratePlanFromDescriptionInput,
      db,
      ctx,
    ).map((r) => ok(block.id, r));
  }
  if (block.name === "propose_blocking_for_scene") {
    return executeProposeBlockingForScene(
      block.input as ProposeBlockingForSceneInput,
      db,
      ctx,
    ).map((r) => ok(block.id, r));
  }
  if (block.name === "propose_move_actor_position") {
    return executeProposeMoveActor(
      block.input as ProposeMoveActorInput,
      db,
      ctx,
    ).map((r) => ok(block.id, r));
  }
  if (block.name === "propose_move_camera_pin") {
    return executeProposeMoveCamera(
      block.input as ProposeMoveCameraInput,
      db,
      ctx,
    ).map((r) => ok(block.id, r));
  }

  return okAsync(
    ok(block.id, { error: `Unknown shooting-plan tool: ${block.name}` }),
  );
};

// ─── Shooting plan tools factory (AI SDK v5 format) ──────────────────────────

const SHOT_SIZE_ENUM = SHOT_SIZES as unknown as [
  string,
  ...string[],
] as readonly [ShotSize, ...ShotSize[]];
const CAMERA_MOVEMENT_ENUM = CAMERA_MOVEMENTS as unknown as [
  string,
  ...string[],
] as readonly [CameraMovement, ...CameraMovement[]];

export const createShootingPlanTools = (
  db: Db,
  ctx: ShootingPlanToolContext,
) => ({
  add_parallel_plan: tool({
    description:
      "Crea un nuovo piano inquadrature parallelo per una scena (es. Piano B, Piano C). " +
      "Il primo piano (Piano A) viene creato automaticamente, quindi usa questo tool solo per piani aggiuntivi. " +
      "Non attiva automaticamente il piano: l'utente o set_active_plan decide quale rendere attivo.",
    inputSchema: z.object({
      scene_id: z
        .string()
        .optional()
        .describe(
          "UUID della scena a cui collegare il piano. Se omesso, viene usata la scena attiva del contesto.",
        ),
      name: z
        .string()
        .describe(
          "Nome del nuovo piano. Tipicamente 'Piano B', 'Piano C', 'Versione classica', 'Versione handheld'.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeAddParallelPlan(
        input as AddParallelPlanInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  add_shot_to_plan: tool({
    description:
      "Aggiunge uno shot alla fine di un piano esistente. La posizione viene calcolata automaticamente. " +
      "Usa questo tool dopo add_parallel_plan per popolare il piano.",
    inputSchema: z.object({
      plan_id: z
        .string()
        .describe("UUID dello shot plan scenario (NON del shot_plan)."),
      shot_type: z
        .enum(SHOT_SIZE_ENUM)
        .describe(
          "Tipo di inquadratura. EWS=campo lunghissimo, WS=campo lungo, MS=mezza figura, MCU=mezzo primo piano, CU=primo piano, ECU=primissimo piano, INSERT=dettaglio, OTS=su le spalle, TWO_SHOT=campo a due, POV=soggettiva.",
        ),
      camera_movement: z
        .enum(CAMERA_MOVEMENT_ENUM)
        .optional()
        .describe("Movimento camera. Default STATIC se non specificato."),
      description: z
        .string()
        .optional()
        .describe("Note descrittive sull'inquadratura."),
      duration_min: z
        .number()
        .optional()
        .describe("Durata stimata in minuti (setup + take)."),
    }),
    execute: async (input, _opts) => {
      const result = await executeAddShotToPlan(
        input as AddShotToPlanInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  set_active_plan: tool({
    description:
      "Rende attivo un piano per la sua scena (tutti i piani fratelli vengono disattivati). Operazione atomica.",
    inputSchema: z.object({
      plan_id: z
        .string()
        .describe("UUID dello shot plan scenario da attivare."),
    }),
    execute: async (input, _opts) => {
      const result = await executeSetActivePlan(
        input as SetActivePlanInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  update_shot: tool({
    description:
      "Modifica i campi di uno shot esistente. Campi consentiti: shot_type, camera_movement, description, duration_min, position.",
    inputSchema: z.object({
      shot_id: z.string().describe("UUID dello shot."),
      patch: z.object({
        shot_type: z.enum(SHOT_SIZE_ENUM).optional(),
        camera_movement: z.enum(CAMERA_MOVEMENT_ENUM).optional(),
        description: z.string().optional(),
        duration_min: z.number().optional(),
        position: z.number().optional(),
      }),
    }),
    execute: async (input, _opts) => {
      const result = await executeUpdateShot(input as UpdateShotInput, db, ctx);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  remove_shot: tool({
    description:
      "Rimuove uno shot dal piano. La scena/piano deve appartenere al progetto corrente.",
    inputSchema: z.object({
      shot_id: z.string().describe("UUID dello shot."),
    }),
    execute: async (input, _opts) => {
      const result = await executeRemoveShot(input as RemoveShotInput, db, ctx);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  generate_plan_from_description: tool({
    description:
      "Crea un nuovo piano e lo popola di shot a partire da una descrizione testuale " +
      "(es. 'classico: WS forno, due CU di Giulio, OTS Tea, insert delle foto'). " +
      "Riconosce le keyword di tipo shot (WS/wide/campo lungo, CU/primo piano, OTS/su le spalle, INSERT/dettaglio, etc).",
    inputSchema: z.object({
      scene_id: z
        .string()
        .optional()
        .describe("UUID della scena. Se omesso, viene usata la scena attiva."),
      plan_name: z.string().describe("Nome del nuovo piano."),
      description: z
        .string()
        .describe("Descrizione testuale del piano con gli shot."),
    }),
    execute: async (input, _opts) => {
      const result = await executeGeneratePlanFromDescription(
        input as GeneratePlanFromDescriptionInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  propose_blocking_for_scene: tool({
    description:
      "Propone una disposizione completa di blocking (attori + camere) per una scena, mostrata come ghost-pins sull'editor 2D che l'utente può accettare singolarmente o in blocco. Non scrive nulla a DB: restituisce solo il payload della proposta.",
    inputSchema: z.object({
      scene_id: z
        .string()
        .optional()
        .describe(
          "UUID della scena per cui proporre il blocking. Se omesso, viene usata la scena attiva del contesto.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeProposeBlockingForScene(
        input as ProposeBlockingForSceneInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  propose_move_actor_position: tool({
    description:
      "Propone di spostare un attore a una nuova posizione (x, y) nello stage 2D. L'utente vede un'anteprima fantasma e può accettare. Non scrive a DB.",
    inputSchema: z.object({
      actor_position_id: z
        .string()
        .describe("Identificatore dell'attore (castId)."),
      x: z.number().describe("Nuova coordinata x in cm."),
      y: z.number().describe("Nuova coordinata y in cm."),
      reason: z
        .string()
        .optional()
        .describe("Motivo dello spostamento (mostrato all'utente)."),
    }),
    execute: async (input, _opts) => {
      const result = await executeProposeMoveActor(
        input as ProposeMoveActorInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  propose_move_camera_pin: tool({
    description:
      "Propone di spostare una camera a una nuova posizione (x, y, direction). Anteprima fantasma. Non scrive a DB.",
    inputSchema: z.object({
      camera_pin_id: z
        .string()
        .describe("Identificatore della camera (shotId)."),
      x: z.number().describe("Nuova coordinata x in cm."),
      y: z.number().describe("Nuova coordinata y in cm."),
      direction_deg: z
        .number()
        .optional()
        .describe(
          "Nuova direzione del cono camera in gradi (0 = nord, in senso orario).",
        ),
      reason: z
        .string()
        .optional()
        .describe("Motivo dello spostamento (mostrato all'utente)."),
    }),
    execute: async (input, _opts) => {
      const result = await executeProposeMoveCamera(
        input as ProposeMoveCameraInput,
        db,
        ctx,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type ShootingPlanTools = ReturnType<typeof createShootingPlanTools>;
