/**
 * Repair mojibake + hard-wrapped paragraphs in existing screenplay data.
 *
 * Past Cesare writes (propose_screenplay_revision, rewrite_scene) and
 * earlier dockerized seed runs landed broken UTF-8 (e.g. `Ã¨` instead of
 * `è`) plus hard line breaks mid-paragraph into:
 *   - screenplay_versions.content (Fountain string)
 *   - screenplays.content (legacy live Fountain)
 *   - screenplays.pm_doc (jsonb ProseMirror document — what the editor renders)
 *   - scenes.heading / scenes.location / scenes.notes (text)
 *
 * This script scans every row, applies the appropriate sanitizer, and
 * UPDATE-s only the rows that actually changed. Idempotent: re-running on
 * already-clean data is a no-op.
 *
 * Usage:
 *   pnpm tsx scripts/repair-mojibake-rows.ts            # dry run
 *   pnpm tsx scripts/repair-mojibake-rows.ts --apply    # write changes
 */
import "./_load-env";
import { db } from "@oh-writers/db";
import { screenplays, screenplayVersions, scenes } from "@oh-writers/db/schema";
import { eq } from "drizzle-orm";
import { sanitizeAiText, repairMojibake } from "@oh-writers/utils";

const APPLY = process.argv.includes("--apply");

// Walk a JSON value, applying repairMojibake on every string leaf.
const repairJsonDeep = (value: unknown): unknown => {
  if (typeof value === "string") return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairJsonDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = repairJsonDeep(v);
    }
    return out;
  }
  return value;
};

// ── pm_doc structural cleanup ─────────────────────────────────────────────
// Cesare soft-wraps long action paragraphs at ~55 chars and emits each
// chunk as a separate `\n\n` block, which the Fountain parser turns into N
// distinct `action` nodes. This walker merges consecutive `action` nodes
// inside a scene when the first one does NOT end with strong punctuation,
// matching the same heuristic used by reflowFountainParagraphs.

const STRONG_PUNCT_END = /[.!?…:;»)"”’\]]\s*$/;

const extractActionText = (node: unknown): string | null => {
  if (
    !node ||
    typeof node !== "object" ||
    (node as { type?: unknown }).type !== "action"
  )
    return null;
  const content = (node as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) =>
      c &&
      typeof c === "object" &&
      typeof (c as { text?: unknown }).text === "string"
        ? (c as { text: string }).text
        : "",
    )
    .join("");
};

const buildActionNode = (text: string): Record<string, unknown> => ({
  type: "action",
  content: [{ type: "text", text }],
});

const mergeActionNodesInScene = (sceneContent: unknown[]): unknown[] => {
  const out: unknown[] = [];
  for (const node of sceneContent) {
    const text = extractActionText(node);
    if (text === null) {
      out.push(node);
      continue;
    }
    const prev = out[out.length - 1];
    const prevText = extractActionText(prev);
    if (
      prevText !== null &&
      prevText !== "" &&
      !STRONG_PUNCT_END.test(prevText)
    ) {
      out[out.length - 1] = buildActionNode(
        `${prevText} ${text}`.replace(/\s+/g, " ").trim(),
      );
      continue;
    }
    out.push(node);
  }
  return out;
};

const mergePmDocActions = (pmDoc: unknown): unknown => {
  if (!pmDoc || typeof pmDoc !== "object") return pmDoc;
  const doc = pmDoc as { type?: string; content?: unknown };
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return pmDoc;
  return {
    ...doc,
    content: doc.content.map((scene) => {
      if (
        !scene ||
        typeof scene !== "object" ||
        (scene as { type?: unknown }).type !== "scene"
      )
        return scene;
      const sceneContent = (scene as { content?: unknown }).content;
      if (!Array.isArray(sceneContent)) return scene;
      return {
        ...(scene as Record<string, unknown>),
        content: mergeActionNodesInScene(sceneContent),
      };
    }),
  };
};

const main = async () => {
  console.log(APPLY ? "MODE: apply" : "MODE: dry-run (use --apply to write)");

  // ── screenplay_versions.content ────────────────────────────────────────────
  const versions = await db
    .select({
      id: screenplayVersions.id,
      label: screenplayVersions.label,
      content: screenplayVersions.content,
    })
    .from(screenplayVersions);

  let versionsChanged = 0;
  let versionsClean = 0;
  for (const v of versions) {
    const fixed = sanitizeAiText(v.content);
    if (fixed === v.content) {
      versionsClean += 1;
      continue;
    }
    versionsChanged += 1;
    console.log(
      `  version ${v.id} (${v.label ?? "—"}): ${fixed.length - v.content.length} chars`,
    );
    if (APPLY) {
      await db
        .update(screenplayVersions)
        .set({ content: fixed })
        .where(eq(screenplayVersions.id, v.id));
    }
  }
  console.log(
    `screenplay_versions.content: ${versionsChanged} changed, ${versionsClean} already clean`,
  );

  // ── screenplays.content (legacy live Fountain) ─────────────────────────────
  // ── screenplays.pm_doc (jsonb ProseMirror — what the editor renders!) ──────
  const sps = await db
    .select({
      id: screenplays.id,
      content: screenplays.content,
      pmDoc: screenplays.pmDoc,
    })
    .from(screenplays);

  let screenplaysContentChanged = 0;
  let screenplaysContentClean = 0;
  let pmDocChanged = 0;
  let pmDocClean = 0;
  for (const sp of sps) {
    const fixedContent = sanitizeAiText(sp.content);
    if (fixedContent !== sp.content) {
      screenplaysContentChanged += 1;
      console.log(
        `  screenplay ${sp.id}.content: ${fixedContent.length - sp.content.length} chars`,
      );
      if (APPLY) {
        await db
          .update(screenplays)
          .set({ content: fixedContent })
          .where(eq(screenplays.id, sp.id));
      }
    } else {
      screenplaysContentClean += 1;
    }

    if (sp.pmDoc !== null && sp.pmDoc !== undefined) {
      const repaired = repairJsonDeep(sp.pmDoc);
      const fixedPm = mergePmDocActions(repaired);
      const before = JSON.stringify(sp.pmDoc);
      const after = JSON.stringify(fixedPm);
      if (before !== after) {
        pmDocChanged += 1;
        console.log(
          `  screenplay ${sp.id}.pm_doc: ${after.length - before.length} chars`,
        );
        if (APPLY) {
          await db
            .update(screenplays)
            .set({ pmDoc: fixedPm as typeof sp.pmDoc })
            .where(eq(screenplays.id, sp.id));
        }
      } else {
        pmDocClean += 1;
      }
    } else {
      pmDocClean += 1;
    }
  }
  console.log(
    `screenplays.content: ${screenplaysContentChanged} changed, ${screenplaysContentClean} already clean`,
  );
  console.log(
    `screenplays.pm_doc:  ${pmDocChanged} changed, ${pmDocClean} already clean`,
  );

  // ── scenes (heading + location + notes) ────────────────────────────────────
  const sceneRows = await db
    .select({
      id: scenes.id,
      heading: scenes.heading,
      location: scenes.location,
      notes: scenes.notes,
    })
    .from(scenes);

  let sceneFieldsChanged = 0;
  let scenesClean = 0;
  for (const s of sceneRows) {
    const fixedHeading = repairMojibake(s.heading);
    const fixedLocation = repairMojibake(s.location);
    const fixedNotes = s.notes === null ? null : sanitizeAiText(s.notes);
    const changed =
      fixedHeading !== s.heading ||
      fixedLocation !== s.location ||
      fixedNotes !== s.notes;
    if (!changed) {
      scenesClean += 1;
      continue;
    }
    sceneFieldsChanged += 1;
    if (APPLY) {
      await db
        .update(scenes)
        .set({
          heading: fixedHeading,
          location: fixedLocation,
          notes: fixedNotes,
        })
        .where(eq(scenes.id, s.id));
    }
  }
  console.log(
    `scenes (heading/location/notes): ${sceneFieldsChanged} changed, ${scenesClean} already clean`,
  );

  console.log(
    APPLY
      ? "✓ Repair applied. Re-run without --apply to confirm idempotency."
      : "✓ Dry run complete. Re-run with --apply to write the changes.",
  );
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
