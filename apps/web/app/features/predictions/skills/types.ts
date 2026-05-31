import type { ResultAsync } from "neverthrow";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import type { FilmBible } from "@oh-writers/domain";
import type { IntentResult } from "../cesare-intent-classifier";
import { CesareError } from "../cesare.errors";

export { CesareError };

// ─── Tool wire shapes ─────────────────────────────────────────────────────────
// Mirror the Anthropic SDK shapes without importing the SDK.
// These are the exact structures the tool loop passes and receives.

export interface ToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface ToolResult {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content: string;
}

export interface AnthropicTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

// ─── DataRequirement ──────────────────────────────────────────────────────────
// Binary declaration of what DB data a skill needs. buildLocalContext loads
// only the loaders for the union of requiredData across active skills.

export type DataRequirement =
  | "budget"
  | "schedule"
  | "locations"
  | "breakdown"
  | "screenplay"
  | "scene-summaries"
  | "documents"
  | "shot-plans";

// ─── SkillId ──────────────────────────────────────────────────────────────────

export type SkillId =
  | "locations"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "document-edit"
  | "document-gen"
  | "screenplay-edit"
  | "read-scene"
  | "read-document";

// ─── SkillExecutor ────────────────────────────────────────────────────────────
// Receives the full ToolUseBlock (not toolName + input separately) so that
// each executor can construct ToolResult with the correct tool_use_id
// required by the Anthropic API to close the tool loop.

export type SkillExecutor = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
  access: ProjectAccess,
) => ResultAsync<ToolResult, CesareError>;

// ─── SkillBuildContext ────────────────────────────────────────────────────────
// Arguments passed to skill factory functions so they can materialise
// guidanceBlock as a static, deterministic string (stable for Anthropic cache).

export interface SkillBuildContext {
  readonly bible: FilmBible | null;
  readonly activeSceneId: string | null;
  readonly activeDayNumber: number | null;
  readonly requirementId: string | null;
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export interface Skill {
  readonly id: SkillId;
  readonly tools: readonly AnthropicTool[];
  readonly guidanceBlock: string;
  readonly executor: SkillExecutor;
  readonly requiredData: readonly DataRequirement[];
}

// ─── PageType ─────────────────────────────────────────────────────────────────

export type PageType =
  | "soggetto"
  | "synopsis"
  | "outline"
  | "treatment"
  | "screenplay"
  | "breakdown"
  | "budget"
  | "schedule"
  | "shooting-plan"
  | "locations";

// ─── SkillRegistry ────────────────────────────────────────────────────────────

export interface SkillRegistry {
  get(id: SkillId): Skill | undefined;
  /** Universal dispatch (spec 47b): returns the FULL skill superset with the
   *  page-primary skills leading. The page is context, not a gate. */
  selectForPage(page: PageType, intent: IntentResult | null): Skill[];
  /** The page-primary skills only — used to scope `buildLocalContext` data
   *  loading so DB round-trips stay proportional to the page, not the whole
   *  universal toolset. */
  primarySkillsForPage(page: PageType): Skill[];
  allTools(skills: readonly Skill[]): readonly AnthropicTool[];
  combinedExecutor(skills: readonly Skill[]): SkillExecutor;
}
