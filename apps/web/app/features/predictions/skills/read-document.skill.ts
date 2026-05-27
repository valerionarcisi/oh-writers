import { CESARE_READ_TOOLS, tryExecuteReadTool } from "../cesare-read-tools";
import { okAsync } from "neverthrow";
import { CesareError } from "../cesare.errors";
import type { Skill, SkillBuildContext, ToolResult } from "./types";

// ─── Guidance builder ─────────────────────────────────────────────────────────

const buildReadDocumentGuidance = (): string =>
  `\n\nLETTURA LAZY (read tools — documenti):
Quando ti serve il testo letterale di un documento (soggetto, sinossi, scaletta, trattamento), usa read_document(document_type). Il system prompt contiene solo metadati; il contenuto completo lo recuperi con questo tool.`;

// ─── Document read tools only (subset of CESARE_READ_TOOLS) ──────────────────

const DOCUMENT_READ_TOOLS = CESARE_READ_TOOLS.filter(
  (t) => t.name === "read_document",
) as Skill["tools"];

// ─── Skill factory ────────────────────────────────────────────────────────────
// requiredData: [] — this skill pre-loads nothing; it reads on demand.

export const buildReadDocumentSkill = (_ctx: SkillBuildContext): Skill => ({
  id: "read-document",
  tools: DOCUMENT_READ_TOOLS,
  guidanceBlock: buildReadDocumentGuidance(),
  executor: (block, db, projectId): ReturnType<Skill["executor"]> => {
    const result = tryExecuteReadTool(block, db, projectId);
    if (result) return result;
    const errorResult: ToolResult = {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify({ error: `Unknown document read tool: ${block.name}` }),
    };
    return okAsync(errorResult);
  },
  requiredData: [],
});
