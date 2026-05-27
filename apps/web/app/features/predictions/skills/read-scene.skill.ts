import { CESARE_READ_TOOLS, tryExecuteReadTool } from "../cesare-read-tools";
import { okAsync } from "neverthrow";
import { CesareError } from "../cesare.errors";
import type { Skill, SkillBuildContext, ToolResult } from "./types";

// ─── Guidance builder ─────────────────────────────────────────────────────────

const buildReadSceneGuidance = (): string =>
  `\n\nLETTURA LAZY (read tools — scene):
Quando ti serve il testo letterale di una scena, usa read_scene(scene_number) o read_scene_range(from, to). Il system prompt contiene solo heading e metadati; il corpo completo lo recuperi con questi tool.`;

// ─── Scene read tools only (subset of CESARE_READ_TOOLS) ─────────────────────
// This skill exposes only the scene-relevant read tools to avoid polluting
// skill sets with document/budget/location tools that aren't needed.

const SCENE_READ_TOOLS = CESARE_READ_TOOLS.filter(
  (t) => t.name === "read_scene" || t.name === "read_scene_range",
) as Skill["tools"];

// ─── Skill factory ────────────────────────────────────────────────────────────
// requiredData: [] — this skill pre-loads nothing; it reads on demand.

export const buildReadSceneSkill = (_ctx: SkillBuildContext): Skill => ({
  id: "read-scene",
  tools: SCENE_READ_TOOLS,
  guidanceBlock: buildReadSceneGuidance(),
  executor: (block, db, projectId): ReturnType<Skill["executor"]> => {
    const result = tryExecuteReadTool(block, db, projectId);
    if (result) return result;
    const errorResult: ToolResult = {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify({ error: `Unknown scene read tool: ${block.name}` }),
    };
    return okAsync(errorResult);
  },
  requiredData: [],
});
