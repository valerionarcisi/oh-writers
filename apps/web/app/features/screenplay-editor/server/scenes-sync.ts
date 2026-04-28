/**
 * Fountain → `scenes` rows synchroniser.
 *
 * Called from `saveScreenplay` so that any path that lands fountain text in
 * `screenplays.content` (manual edit, PDF import, paste) ends up materialised
 * in the `scenes` table the breakdown route reads from.
 *
 * Identity model: `(screenplayId, number)` is the stable key. Upserting by
 * number keeps `scenes.id` stable across saves so `breakdown_occurrences.sceneId`
 * foreign keys are not invalidated when the user just tweaks scene text. Scene
 * numbers shifting (insert/delete in the middle of the script) is the inherent
 * risk of position-based identity — addressed only when Spec 10x lands a true
 * scene-stable-id model.
 */

import { sql } from "drizzle-orm";
import { listScenesInFountain } from "@oh-writers/domain";
import { scenes } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const HEADING_PARSE_RE =
  /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?\/EST\.?|EST\.?\/INT\.?|I\/E|INT\.?|EXT\.?|EST\.?)\s+(.*)$/;

interface ParsedHeading {
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
}

const parseHeading = (raw: string): ParsedHeading | null => {
  const m = HEADING_PARSE_RE.exec(raw.trim());
  if (!m) return null;
  const prefix = m[1]!.replace(/\./g, "").toUpperCase();
  const rest = m[2]!.trim();
  const intExt =
    prefix === "INT" ? "INT" : prefix === "EXT" ? "EXT" : "INT/EXT";
  const parts = rest.split(/\s+-\s+/);
  let timeOfDay: string | null = null;
  let location = rest;
  if (parts.length >= 2) {
    timeOfDay = parts[parts.length - 1]!.trim();
    location = parts.slice(0, -1).join(" - ").trim();
  }
  return { intExt, location, timeOfDay };
};

interface SceneRow {
  number: number;
  heading: string;
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
  notes: string | null;
}

/**
 * Pure parse step — no DB. Walks the fountain, pairs each detected heading
 * with the body text up to the next heading, and returns the rows we want
 * the scenes table to mirror. Bodies feed Spec 10e auto-spoglio (RegEx
 * extractors run over `scene.notes`), so dropping them would cripple the
 * breakdown.
 */
export const extractSceneRows = (fountain: string): SceneRow[] => {
  const parsed = listScenesInFountain(fountain);
  if (parsed.length === 0) return [];
  const lines = fountain.split(/\r?\n/);
  const rows: SceneRow[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const cur = parsed[i]!;
    const nextLineIdx = parsed[i + 1]?.lineIndex ?? lines.length;
    const heading = lines[cur.lineIndex]!.trim();
    const headingParts = parseHeading(heading);
    if (!headingParts) continue;
    const body = lines
      .slice(cur.lineIndex + 1, nextLineIdx)
      .join("\n")
      .trim();
    rows.push({
      number: cur.index,
      heading,
      intExt: headingParts.intExt,
      location: headingParts.location,
      timeOfDay: headingParts.timeOfDay,
      notes: body.length > 0 ? body : null,
    });
  }
  return rows;
};

/**
 * Upserts the parsed scene rows and deletes any leftover rows whose number
 * no longer exists in the fountain. Idempotent: a save where nothing
 * structural changed produces a no-op for callers (still N upserts on the
 * wire, but updates whose SET equals current row are cheap).
 *
 * Runs inside the caller's transaction — concurrent saves on the same
 * screenplay rely on row-level locks from the upsert to serialise.
 */
export const syncScenesFromFountain = async (
  tx: DbOrTx,
  screenplayId: string,
  fountain: string,
): Promise<{ upserted: number; deleted: number }> => {
  const rows = extractSceneRows(fountain);
  if (rows.length === 0) {
    const existing = await tx
      .delete(scenes)
      .where(sql`${scenes.screenplayId} = ${screenplayId}`)
      .returning({ id: scenes.id });
    return { upserted: 0, deleted: existing.length };
  }

  for (const r of rows) {
    await tx
      .insert(scenes)
      .values({
        screenplayId,
        number: r.number,
        heading: r.heading,
        intExt: r.intExt,
        location: r.location,
        timeOfDay: r.timeOfDay,
        notes: r.notes,
      })
      .onConflictDoUpdate({
        target: [scenes.screenplayId, scenes.number],
        set: {
          heading: r.heading,
          intExt: r.intExt,
          location: r.location,
          timeOfDay: r.timeOfDay,
          notes: r.notes,
          updatedAt: new Date(),
        },
      });
  }

  const maxNumber = rows[rows.length - 1]!.number;
  const stale = await tx
    .delete(scenes)
    .where(
      sql`${scenes.screenplayId} = ${screenplayId} AND ${scenes.number} > ${maxNumber}`,
    )
    .returning({ id: scenes.id });

  return { upserted: rows.length, deleted: stale.length };
};
