/**
 * Auto-spoglio server (Spec 10e / 10i).
 *
 * Deterministic pass: structured regex extractors (cast, location, vehicles,
 * animals, sound, atmosphere, makeup, stunts, extras) + WordNet dictionary
 * pass for physical props (replaces the old noisy regex props extractor).
 * Persists results as `breakdown_elements` + `breakdown_occurrences`.
 * Idempotent: re-running on unchanged text is a cheap no-op (`text_hash`).
 *
 * Confidence-based default `cesareStatus`:
 *   - High-confidence extractors (cast / locations / animals) → `accepted`.
 *   - Lower-confidence (vehicles / sound / atmosphere / makeup / stunts /
 *     extras / WordNet props) → `pending` (ghost tag, user confirms).
 *
 * Never overwrites manually-added or user-accepted occurrences.
 */

import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ResultAsync, ok, err } from "neverthrow";
import {
  breakdownElements,
  breakdownOccurrences,
  breakdownSceneState,
  scenes,
  projects,
} from "@oh-writers/db/schema";
import {
  extractAll,
  titleCase,
  type ExtractedItem,
  type Locale,
} from "@oh-writers/domain";
import { extractElements } from "@oh-writers/domain/breakdown/extract-elements";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb, type Db } from "~/server/db";
import {
  BreakdownSceneNotFoundError,
  DbError,
  ForbiddenError,
} from "../breakdown.errors";
import { canEditBreakdown } from "../lib/permissions";
import { hashText as hashSceneText } from "@oh-writers/utils/hash";
import { resolveBreakdownAccessByScene } from "./breakdown-access";

export interface AutoSpoglioResult {
  /** New breakdown_elements created by this run. */
  added: number;
  /** Occurrences persisted (one per extracted item that wasn't already there). */
  occurrencesAdded: number;
  /** Items skipped because the occurrence already existed (manual / cesare). */
  skipped: number;
  /** True when the run was a no-op because the text hash hadn't changed. */
  noop: boolean;
}

const sceneTextOf = (scene: {
  heading: string;
  notes: string | null;
}): string => scene.heading + "\n" + (scene.notes ?? "");

export const runAutoSpoglioForScene = createServerFn({ method: "POST" })
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
        AutoSpoglioResult,
        BreakdownSceneNotFoundError | ForbiddenError | DbError
      >
    > => {
      const user = await requireUser();
      const db = await getDb();

      const sceneResult = await ResultAsync.fromPromise(
        db.query.scenes
          .findFirst({ where: eq(scenes.id, data.sceneId) })
          .then((r) => r ?? null),
        (e) => new DbError("autoSpoglio/loadScene", e),
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
        return toShape(err(new ForbiddenError("run auto-spoglio")));
      const projectId = accessResult.value.projectId;

      const fullText = sceneTextOf(scene);
      const currentHash = hashSceneText(fullText);

      // Early exit: if we've already auto-spoglio'd this exact text, do nothing.
      const stateResult = await ResultAsync.fromPromise(
        db.query.breakdownSceneState
          .findFirst({
            where: and(
              eq(breakdownSceneState.sceneId, scene.id),
              eq(
                breakdownSceneState.screenplayVersionId,
                data.screenplayVersionId,
              ),
            ),
          })
          .then((r) => r ?? null),
        (e) => new DbError("autoSpoglio/loadState", e),
      );
      if (stateResult.isErr()) return toShape(err(stateResult.error));
      const state = stateResult.value;
      if (
        state &&
        state.lastAutoSpoglioRunAt !== null &&
        state.textHash === currentHash
      ) {
        return toShape(
          ok({ added: 0, occurrencesAdded: 0, skipped: 0, noop: true }),
        );
      }

      const locale = await resolveProjectLocale(db, projectId);

      // Structured regex extractors (cast, location, vehicles, etc.) minus props.
      // Props are now handled by the WordNet dictionary pass below.
      const structuredItems = extractAll({
        heading: scene.heading,
        body: scene.notes ?? "",
      }).filter((i) => i.category !== "props");

      // WordNet dictionary pass — replaces the noisy regex props extractor.
      const elementsResult = await extractElements({
        sceneText: fullText,
        locale,
      });
      const propItems: ExtractedItem[] = elementsResult.isOk()
        ? elementsResult.value.map((el) => ({
            category: "props" as const,
            name: titleCase(el.word),
            quantity: 1,
            defaultStatus: "pending" as const,
            source: "wordnet" as const,
          }))
        : [];

      const persistResult = await persistExtracted(db, {
        projectId,
        screenplayVersionId: data.screenplayVersionId,
        sceneId: scene.id,
        items: [...structuredItems, ...propItems],
        textHash: currentHash,
      });

      return toShape(persistResult);
    },
  );

interface PersistInput {
  projectId: string;
  screenplayVersionId: string;
  sceneId: string;
  items: readonly ExtractedItem[];
  textHash: string;
}

/**
 * Per-scene write barrier. Wrapped in a single DB transaction so a partial
 * failure (e.g. the `breakdownSceneState` stamp fails after some occurrences
 * are inserted) rolls back atomically — otherwise the next mount would
 * short-circuit on the stamp and the user would be stuck with a half-finished
 * spoglio that can never re-run.
 */
const persistExtracted = (
  db: Db,
  input: PersistInput,
): ResultAsync<AutoSpoglioResult, DbError> =>
  ResultAsync.fromPromise(
    db.transaction(async (tx) => {
      let added = 0;
      let occurrencesAdded = 0;
      let skipped = 0;
      const now = new Date();

      for (const item of input.items) {
        // Upsert the element (project-scoped by category+name). We DO NOT
        // unset `archivedAt`: a user who archived an element wants it gone,
        // and a fresh auto-spoglio run must not silently resurrect it.
        const [el] = await tx
          .insert(breakdownElements)
          .values({
            projectId: input.projectId,
            category: item.category,
            name: item.name,
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
        // Skip occurrence creation for archived elements — user intent wins.
        if (el.archivedAt !== null) continue;

        // Track if the element row was actually new vs. updated. Drizzle
        // doesn't expose the affected-vs-inserted distinction directly; we
        // approximate by checking createdAt vs the request timestamp.
        if (
          Math.abs(el.createdAt.getTime() - now.getTime()) <
          ELEMENT_NEW_WINDOW_MS
        ) {
          added++;
        }

        // Skip if an occurrence already exists for (element, version, scene).
        // We never override user/Cesare decisions.
        const existing = await tx.query.breakdownOccurrences.findFirst({
          where: and(
            eq(breakdownOccurrences.elementId, el.id),
            eq(
              breakdownOccurrences.screenplayVersionId,
              input.screenplayVersionId,
            ),
            eq(breakdownOccurrences.sceneId, input.sceneId),
          ),
        });
        if (existing) {
          skipped++;
          continue;
        }

        await tx.insert(breakdownOccurrences).values({
          elementId: el.id,
          screenplayVersionId: input.screenplayVersionId,
          sceneId: input.sceneId,
          quantity: item.quantity,
          cesareStatus: item.defaultStatus,
        });
        occurrencesAdded++;
      }

      // Stamp the scene state so the next call short-circuits. Inside the
      // same transaction so a roll-back unstamps it too.
      await tx
        .insert(breakdownSceneState)
        .values({
          sceneId: input.sceneId,
          screenplayVersionId: input.screenplayVersionId,
          textHash: input.textHash,
          lastAutoSpoglioRunAt: now,
        })
        .onConflictDoUpdate({
          target: [
            breakdownSceneState.sceneId,
            breakdownSceneState.screenplayVersionId,
          ],
          set: { textHash: input.textHash, lastAutoSpoglioRunAt: now },
        });

      return { added, occurrencesAdded, skipped, noop: false };
    }),
    (e) => new DbError("autoSpoglio/persist", e),
  );

/**
 * Window used to approximate "element row was just inserted" vs. updated.
 * Drizzle's onConflictDoUpdate doesn't surface that distinction directly,
 * so we compare `createdAt` to the request timestamp.
 */
const ELEMENT_NEW_WINDOW_MS = 5_000;

// Falls back to "it" when the project row is missing (should not happen).
const resolveProjectLocale = async (
  db: Db,
  projectId: string,
): Promise<Locale> => {
  const project = await db.query.projects
    .findFirst({ where: eq(projects.id, projectId) })
    .catch(() => null);
  return (project?.locale ?? "it") as Locale;
};

// ─── Fan-out: run auto-spoglio for an entire screenplay version ──────────────

export interface AutoSpoglioVersionResult {
  scenesProcessed: number;
  totalElementsAdded: number;
  totalOccurrencesAdded: number;
}

/**
 * Server function called once on `BreakdownPage` mount. Iterates every scene
 * of the version and runs the auto-spoglio for each, in series (the per-scene
 * function is fast — no AI — so the wall-clock is dominated by DB round-trips
 * which we want to keep predictable rather than parallel).
 */
export const runAutoSpoglioForVersion = createServerFn({ method: "POST" })
  .validator(z.object({ screenplayVersionId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<AutoSpoglioVersionResult, ForbiddenError | DbError>
    > => {
      const user = await requireUser();
      const db = await getDb();

      const versionResult = await ResultAsync.fromPromise(
        db.query.screenplayVersions
          .findFirst({
            where: (v, { eq: e }) => e(v.id, data.screenplayVersionId),
          })
          .then((r) => r ?? null),
        (e) => new DbError("autoSpoglioVersion/loadVersion", e),
      );
      if (versionResult.isErr()) return toShape(err(versionResult.error));
      const version = versionResult.value;
      if (!version)
        return toShape(
          err(
            new DbError(
              "autoSpoglioVersion/loadVersion",
              `version not found: ${data.screenplayVersionId}`,
            ),
          ),
        );

      const sceneRowsResult = await ResultAsync.fromPromise(
        db.query.scenes.findMany({
          where: (sc, { eq: e }) => e(sc.screenplayId, version.screenplayId),
          orderBy: (sc, { asc }) => [asc(sc.number)],
        }),
        (e) => new DbError("autoSpoglioVersion/loadScenes", e),
      );
      if (sceneRowsResult.isErr()) return toShape(err(sceneRowsResult.error));
      const sceneRows = sceneRowsResult.value;
      if (sceneRows.length === 0)
        return toShape(
          ok({
            scenesProcessed: 0,
            totalElementsAdded: 0,
            totalOccurrencesAdded: 0,
          }),
        );

      const accessResult = await resolveBreakdownAccessByScene(
        db,
        user.id,
        sceneRows[0]!.id,
      );
      if (accessResult.isErr()) return toShape(err(accessResult.error));
      if (!canEditBreakdown(accessResult.value))
        return toShape(err(new ForbiddenError("run auto-spoglio")));
      const projectId = accessResult.value.projectId;
      const locale = await resolveProjectLocale(db, projectId);

      let totalElementsAdded = 0;
      let totalOccurrencesAdded = 0;

      for (const scene of sceneRows) {
        const fullText = sceneTextOf(scene);
        const currentHash = hashSceneText(fullText);

        const state = await db.query.breakdownSceneState.findFirst({
          where: and(
            eq(breakdownSceneState.sceneId, scene.id),
            eq(
              breakdownSceneState.screenplayVersionId,
              data.screenplayVersionId,
            ),
          ),
        });
        if (
          state &&
          state.lastAutoSpoglioRunAt !== null &&
          state.textHash === currentHash
        ) {
          continue;
        }

        const structuredItems = extractAll({
          heading: scene.heading,
          body: scene.notes ?? "",
        }).filter((i) => i.category !== "props");

        const elementsResult = await extractElements({
          sceneText: fullText,
          locale,
        });
        const propItems: ExtractedItem[] = elementsResult.isOk()
          ? elementsResult.value.map((el) => ({
              category: "props" as const,
              name: titleCase(el.word),
              quantity: 1,
              defaultStatus: "pending" as const,
              source: "wordnet" as const,
            }))
          : [];

        const persisted = await persistExtracted(db, {
          projectId,
          screenplayVersionId: data.screenplayVersionId,
          sceneId: scene.id,
          items: [...structuredItems, ...propItems],
          textHash: currentHash,
        });
        if (persisted.isErr()) return toShape(err(persisted.error));
        totalElementsAdded += persisted.value.added;
        totalOccurrencesAdded += persisted.value.occurrencesAdded;
      }

      return toShape(
        ok({
          scenesProcessed: sceneRows.length,
          totalElementsAdded,
          totalOccurrencesAdded,
        }),
      );
    },
  );
