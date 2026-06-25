// Universal Cesare tool factory.
//
// Spec 43 — Cesare is a layer above the SaaS that can see and modify
// everything if it wants. The active page is just where the user is, not a
// gate on what Cesare is allowed to do.
//
// This factory composes every per-domain factory into a single object so
// the agentic loop always sees the full toolset, regardless of the page
// the user is currently on. Page context still flows through the system
// prompt to shape phrasing and default arguments — but never to filter
// the tool surface.

import type { Db } from "~/server/db";
import { createReadTools } from "./cesare-read-tools";
import {
  createLocationTools,
  createDocumentTools,
  createBreakdownTools,
  createBudgetTools,
  type DocumentContext,
} from "./cesare-tools";
import { createScreenplayTools } from "./cesare-screenplay-tools";
import { createDocumentGenTools } from "./cesare-document-tools";
import {
  createScheduleTools,
  type ScheduleToolContext,
} from "./cesare-schedule-tools";
import {
  createShootingPlanTools,
  type ShootingPlanToolContext,
} from "./cesare-shooting-plan-tools";

export interface UniversalToolContext {
  readonly projectId: string;
  /** Pre-loaded active document (logline/synopsis/outline/treatment) for the
   *  current page. When null, document edit tools degrade to errors that tell
   *  Cesare "open a document first" instead of failing silently. */
  readonly documentContext: DocumentContext | null;
  /** Active scene id (from the editor cursor / page param). Used by
   *  shooting-plan tools when no scene_number was supplied. */
  readonly activeSceneId: string | null;
  /** Active shooting day number (1-based). Used by schedule tools when no
   *  day_number was supplied. */
  readonly activeDayNumber: number | null;
  /** Fallback user id passed to document-generation tools so AI drafts get
   *  attributed even when there's no session user (rare). */
  readonly userIdFallback: string | null;
  /** The Cesare session this turn belongs to (Spec 76 / BUG-N66). Threaded to
   *  the document-gen tools so a session's small edits OVERWRITE one working
   *  version instead of minting a row per turn. Null ⇒ legacy mint-per-turn. */
  readonly sessionId: string | null;
  /** The user's last message this turn (Spec 76). Lets the surgical edit tools
   *  (apply_text_edit / expand / compress) honour an explicit "nuova versione"
   *  request even though their tool input is a scripted find/replace, not the
   *  user's words. Null ⇒ no explicit intent. */
  readonly userInstruction: string | null;
}

// A null DocumentContext means document-edit tools won't have a target.
// We still register them so Cesare can hint at them, but each execute
// short-circuits to a friendly error.
const NULL_DOCUMENT_CONTEXT: DocumentContext = {
  documentId: "",
  documentType: "logline",
  content: "",
};

export const createUniversalCesareTools = (
  db: Db,
  ctx: UniversalToolContext,
) => {
  const scheduleCtx: ScheduleToolContext = {
    projectId: ctx.projectId,
    activeDayNumber: ctx.activeDayNumber,
  };
  const shootingPlanCtx: ShootingPlanToolContext = {
    projectId: ctx.projectId,
    activeSceneId: ctx.activeSceneId,
  };
  const docCtx = ctx.documentContext ?? NULL_DOCUMENT_CONTEXT;

  return {
    // Read tools (cross-feature, zero side effect)
    ...createReadTools(db, ctx.projectId),

    // Location tools (search_places, add_candidate,
    // list_location_requirements, create_location_requirement,
    // find_or_create_requirement_for_scene)
    ...createLocationTools(db, ctx.projectId),

    // Screenplay write tools (propose_screenplay_edit, rewrite_scene,
    // merge_scenes, delete_scene, propose_screenplay_revision,
    // propose_rename_entity)
    ...createScreenplayTools(db, ctx.projectId),

    // Document text edits on the active document (apply_text_edit, …)
    ...createDocumentTools(
      db,
      docCtx,
      ctx.userIdFallback,
      ctx.sessionId,
      ctx.userInstruction,
    ),

    // Document generation (logline/synopsis/scaletta/treatment proposers).
    // Spec 78 §A5 — thread the user's turn message so the large-edit confirm-card
    // choice is honoured turn-wide (no ask-loop when a second tool runs).
    ...createDocumentGenTools(
      db,
      ctx.projectId,
      ctx.userIdFallback,
      ctx.sessionId,
      ctx.userInstruction,
    ),

    // Breakdown tools (add_element, link_element_to_scene, …)
    ...createBreakdownTools(db, ctx.projectId),

    // Budget tools (add_line, update_line, propose_cap, …)
    ...createBudgetTools(db, ctx.projectId),

    // Schedule tools (move_scene_to_day, lock_day, …)
    ...createScheduleTools(db, scheduleCtx),

    // Shooting-plan tools (add_parallel_plan, propose_blocking_for_scene, …)
    ...createShootingPlanTools(db, shootingPlanCtx),
  };
};

export type UniversalCesareTools = ReturnType<
  typeof createUniversalCesareTools
>;
