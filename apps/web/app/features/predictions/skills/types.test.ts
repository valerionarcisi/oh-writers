import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  DataRequirement,
  SkillId,
  ToolResult,
  AnthropicTool,
  SkillBuildContext,
} from "./types";
import { CesareError } from "./types";

// [OHW-039c] — skills/types.ts contract tests

const DATA_REQUIREMENTS: DataRequirement[] = [
  "budget",
  "schedule",
  "locations",
  "breakdown",
  "screenplay",
  "documents",
  "shot-plans",
];

const SKILL_IDS: SkillId[] = [
  "locations",
  "breakdown",
  "budget",
  "schedule",
  "shooting-plan",
  "document-edit",
  "screenplay-edit",
  "read-scene",
  "read-document",
];

describe("skills/types", () => {
  it("DataRequirement covers all 7 valid values", () => {
    expect(DATA_REQUIREMENTS).toHaveLength(7);
    for (const req of DATA_REQUIREMENTS) {
      expectTypeOf(req).toEqualTypeOf<DataRequirement>();
    }
  });

  it("SkillId covers all 9 valid values", () => {
    expect(SKILL_IDS).toHaveLength(9);
    for (const id of SKILL_IDS) {
      expectTypeOf(id).toEqualTypeOf<SkillId>();
    }
  });

  it("CesareError has the correct _tag", () => {
    const err = new CesareError("test failure");
    expect(err._tag).toBe("CesareError");
  });

  it("CesareError message includes the operation cause", () => {
    const err = new CesareError("executeTool: unknown tool name");
    expect(err.message).toContain("executeTool: unknown tool name");
  });

  it("ToolResult has a tool_use_id field", () => {
    expectTypeOf<ToolResult>().toHaveProperty("tool_use_id");
    expectTypeOf<ToolResult["tool_use_id"]>().toEqualTypeOf<string>();
  });
});
