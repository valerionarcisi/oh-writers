import { describe, it, expect, vi } from "vitest";
import { okAsync, errAsync } from "neverthrow";
import { buildSkillRegistry } from "./registry";
import { CesareError } from "../cesare.errors";
import type {
  Skill,
  SkillId,
  SkillBuildContext,
  ToolUseBlock,
  ToolResult,
  AnthropicTool,
} from "./types";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";

// [OHW-039b] — SkillRegistry: selectForPage, combinedExecutor dispatch, collision detection

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeCtx = (
  overrides: Partial<SkillBuildContext> = {},
): SkillBuildContext => ({
  bible: null,
  activeSceneId: null,
  activeDayNumber: null,
  requirementId: null,
  ...overrides,
});

const makeBlock = (name: string): ToolUseBlock => ({
  type: "tool_use",
  id: "block-1",
  name,
  input: {},
});

const makeToolResult = (id: string): ToolResult => ({
  type: "tool_result",
  tool_use_id: id,
  content: "ok",
});

const makeTool = (name: string): AnthropicTool => ({
  name,
  description: "test",
  input_schema: { type: "object", properties: {} },
});

const makeSkill = (
  id: SkillId,
  toolNames: string[],
  executorFn?: (block: ToolUseBlock) => ReturnType<Skill["executor"]>,
): Skill => ({
  id,
  tools: toolNames.map(makeTool),
  guidanceBlock: `guidance for ${id}`,
  executor: (block, _db, _projectId, _access) =>
    executorFn ? executorFn(block) : okAsync(makeToolResult(block.id)),
  requiredData: [],
});

const STUB_DB = {} as Db;
const STUB_ACCESS = {} as ProjectAccess;

// ─── selectForPage ────────────────────────────────────────────────────────────

describe("SkillRegistry.selectForPage", () => {
  it("returns the correct skill set for the locations page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("locations", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("locations");
    expect(ids).toContain("read-scene");
    expect(ids).toContain("read-document");
    expect(ids).toHaveLength(3);
  });

  it("returns the correct skill set for the screenplay page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("screenplay", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("screenplay-edit");
    expect(ids).toContain("read-scene");
    expect(ids).toHaveLength(2);
  });

  it("returns the correct skill set for the budget page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("budget", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("budget");
    expect(ids).toContain("read-scene");
    expect(ids).toHaveLength(2);
  });

  it("returns the correct skill set for the schedule page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("schedule", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("schedule");
    expect(ids).toContain("read-scene");
    expect(ids).toHaveLength(2);
  });

  it("returns the correct skill set for the breakdown page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("breakdown", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("breakdown");
    expect(ids).toContain("read-scene");
    expect(ids).toHaveLength(2);
  });

  it("returns the correct skill set for the shooting-plan page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("shooting-plan", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("shooting-plan");
    expect(ids).toContain("read-scene");
    expect(ids).toHaveLength(2);
  });

  it("returns document-edit skill when injected via overrides for soggetto page", () => {
    const docSkill = makeSkill("document-edit", ["apply_text_edit"]);
    const registry = buildSkillRegistry(makeCtx(), {
      "document-edit": docSkill,
    });
    const skills = registry.selectForPage("soggetto", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("document-edit");
    expect(ids).toContain("read-document");
  });

  it("omits document-edit from soggetto page when no override is injected", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("soggetto", null);
    const ids = skills.map((s) => s.id);
    // document-edit is not in base skills — should be absent
    expect(ids).not.toContain("document-edit");
  });

  it("returns document-edit skill for synopsis page when injected", () => {
    const docSkill = makeSkill("document-edit", ["apply_text_edit"]);
    const registry = buildSkillRegistry(makeCtx(), {
      "document-edit": docSkill,
    });
    const skills = registry.selectForPage("synopsis", null);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain("document-edit");
  });

  it("skill order puts primary skill first on the locations page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("locations", null);
    expect(skills[0]?.id).toBe("locations");
  });

  it("skill order puts primary skill first on the screenplay page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("screenplay", null);
    expect(skills[0]?.id).toBe("screenplay-edit");
  });
});

// ─── get ──────────────────────────────────────────────────────────────────────

describe("SkillRegistry.get", () => {
  it("returns a skill by id", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("locations");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("locations");
  });

  it("returns undefined for document-edit when not injected", () => {
    const registry = buildSkillRegistry(makeCtx());
    expect(registry.get("document-edit")).toBeUndefined();
  });

  it("returns document-edit when injected via overrides", () => {
    const docSkill = makeSkill("document-edit", ["apply_text_edit"]);
    const registry = buildSkillRegistry(makeCtx(), {
      "document-edit": docSkill,
    });
    expect(registry.get("document-edit")).toBe(docSkill);
  });

  it("returns the injected skill, not the placeholder, after override", () => {
    const customSkill = makeSkill("locations", ["custom_locations_tool"]);
    const registry = buildSkillRegistry(makeCtx(), { locations: customSkill });
    expect(registry.get("locations")).toBe(customSkill);
  });
});

// ─── allTools ────────────────────────────────────────────────────────────────

describe("SkillRegistry.allTools", () => {
  it("returns the flat union of all tools across selected skills", () => {
    const skillA = makeSkill("locations" as SkillId, ["tool_a", "tool_b"]);
    const skillB = makeSkill("read-scene" as SkillId, ["tool_c"]);
    const registry = buildSkillRegistry(makeCtx());
    const tools = registry.allTools([skillA, skillB]);
    expect(tools.map((t) => t.name)).toEqual(["tool_a", "tool_b", "tool_c"]);
  });

  it("returns an empty array for an empty skill list", () => {
    const registry = buildSkillRegistry(makeCtx());
    expect(registry.allTools([])).toHaveLength(0);
  });
});

// ─── combinedExecutor — happy path ───────────────────────────────────────────

describe("SkillRegistry.combinedExecutor — dispatch", () => {
  it("routes a tool call to the skill that owns that tool name", async () => {
    const executorA = vi.fn((block: ToolUseBlock) =>
      okAsync({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: "from-A",
      }),
    );
    const executorB = vi.fn((block: ToolUseBlock) =>
      okAsync({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: "from-B",
      }),
    );

    const skillA = makeSkill(
      "locations" as SkillId,
      ["search_places"],
      executorA,
    );
    const skillB = makeSkill(
      "read-scene" as SkillId,
      ["read_scene"],
      executorB,
    );
    const registry = buildSkillRegistry(makeCtx());
    const executor = registry.combinedExecutor([skillA, skillB]);

    const result = await executor(
      makeBlock("search_places"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.content).toBe("from-A");
    }
    expect(executorA).toHaveBeenCalledOnce();
    expect(executorB).not.toHaveBeenCalled();
  });

  it("routes to the second skill when the tool belongs to it", async () => {
    const executorA = vi.fn(() =>
      okAsync({
        type: "tool_result" as const,
        tool_use_id: "x",
        content: "from-A",
      }),
    );
    const executorB = vi.fn((block: ToolUseBlock) =>
      okAsync({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: "from-B",
      }),
    );

    const skillA = makeSkill(
      "locations" as SkillId,
      ["search_places"],
      executorA,
    );
    const skillB = makeSkill(
      "read-scene" as SkillId,
      ["read_scene"],
      executorB,
    );
    const registry = buildSkillRegistry(makeCtx());
    const executor = registry.combinedExecutor([skillA, skillB]);

    const result = await executor(
      makeBlock("read_scene"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.content).toBe("from-B");
    }
    expect(executorB).toHaveBeenCalledOnce();
    expect(executorA).not.toHaveBeenCalled();
  });

  it("returns CesareError when tool name is not found in any skill", async () => {
    const skillA = makeSkill("locations" as SkillId, ["search_places"]);
    const registry = buildSkillRegistry(makeCtx());
    const executor = registry.combinedExecutor([skillA]);

    const result = await executor(
      makeBlock("nonexistent_tool"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error._tag).toBe("CesareError");
      expect(result.error.message).toContain("nonexistent_tool");
    }
  });

  it("returns CesareError for empty skill list", async () => {
    const registry = buildSkillRegistry(makeCtx());
    const executor = registry.combinedExecutor([]);

    const result = await executor(
      makeBlock("any_tool"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error._tag).toBe("CesareError");
    }
  });

  it("propagates executor errors transparently", async () => {
    const failingExecutor = (_block: ToolUseBlock) =>
      errAsync(new CesareError("executor failed"));
    const skillA = makeSkill(
      "locations" as SkillId,
      ["search_places"],
      failingExecutor,
    );
    const registry = buildSkillRegistry(makeCtx());
    const executor = registry.combinedExecutor([skillA]);

    const result = await executor(
      makeBlock("search_places"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error.cause).toBe("executor failed");
    }
  });
});

// ─── Tool name collision detection ───────────────────────────────────────────
// A registry that loads two skills with identical tool names would silently
// route to the first match — the combinedExecutor picks the first owner.
// These tests verify that: (a) real PAGE_SKILL_MAP pages do NOT have collisions,
// and (b) the dispatch prefers the first skill in the list when names collide.

describe("Tool name collision detection", () => {
  it("locations page: no duplicate tool names across all active skills", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("locations", null);
    const tools = registry.allTools(skills);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("breakdown page: no duplicate tool names across all active skills", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("breakdown", null);
    const tools = registry.allTools(skills);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("budget page: no duplicate tool names across all active skills", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("budget", null);
    const tools = registry.allTools(skills);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("schedule page: no duplicate tool names across all active skills", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("schedule", null);
    const tools = registry.allTools(skills);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("shooting-plan page: no duplicate tool names across all active skills", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("shooting-plan", null);
    const tools = registry.allTools(skills);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("screenplay page: no duplicate tool names across all active skills", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("screenplay", null);
    const tools = registry.allTools(skills);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("when two skills share a tool name, dispatch goes to the first skill in the list", async () => {
    const executor1 = vi.fn((block: ToolUseBlock) =>
      okAsync({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: "first",
      }),
    );
    const executor2 = vi.fn((_block: ToolUseBlock) =>
      okAsync({
        type: "tool_result" as const,
        tool_use_id: "x",
        content: "second",
      }),
    );

    const skill1 = makeSkill(
      "locations" as SkillId,
      ["shared_tool"],
      executor1,
    );
    const skill2 = makeSkill(
      "read-scene" as SkillId,
      ["shared_tool"],
      executor2,
    );

    const registry = buildSkillRegistry(makeCtx());
    const executor = registry.combinedExecutor([skill1, skill2]);
    const result = await executor(
      makeBlock("shared_tool"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.content).toBe("first");
    }
    expect(executor1).toHaveBeenCalledOnce();
    expect(executor2).not.toHaveBeenCalled();
  });
});

// ─── SkillBuildContext flows through skill factories ─────────────────────────

describe("SkillBuildContext threading", () => {
  it("read-scene skill has no requiredData (lazy loader)", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("read-scene");
    expect(skill?.requiredData).toHaveLength(0);
  });

  it("read-document skill has no requiredData (lazy loader)", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("read-document");
    expect(skill?.requiredData).toHaveLength(0);
  });

  it("locations skill declares screenplay and locations as requiredData", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("locations");
    expect(skill?.requiredData).toContain("locations");
    expect(skill?.requiredData).toContain("screenplay");
  });

  it("budget skill declares budget and breakdown as requiredData", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("budget");
    expect(skill?.requiredData).toContain("budget");
    expect(skill?.requiredData).toContain("breakdown");
  });

  it("schedule skill declares schedule and screenplay as requiredData", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("schedule");
    expect(skill?.requiredData).toContain("schedule");
    expect(skill?.requiredData).toContain("screenplay");
  });

  it("shooting-plan skill declares shot-plans and screenplay as requiredData", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skill = registry.get("shooting-plan");
    expect(skill?.requiredData).toContain("shot-plans");
    expect(skill?.requiredData).toContain("screenplay");
  });

  it("all skills have a non-empty guidanceBlock", () => {
    const ctx = makeCtx();
    const registry = buildSkillRegistry(ctx);
    const skillIds: SkillId[] = [
      "locations",
      "breakdown",
      "budget",
      "schedule",
      "shooting-plan",
      "screenplay-edit",
      "read-scene",
      "read-document",
    ];
    for (const id of skillIds) {
      const skill = registry.get(id);
      expect(skill?.guidanceBlock, `guidanceBlock for ${id}`).toBeTruthy();
    }
  });

  it("all skills have at least one tool", () => {
    const ctx = makeCtx();
    const registry = buildSkillRegistry(ctx);
    const skillIds: SkillId[] = [
      "locations",
      "breakdown",
      "budget",
      "schedule",
      "shooting-plan",
      "screenplay-edit",
      "read-scene",
      "read-document",
    ];
    for (const id of skillIds) {
      const skill = registry.get(id);
      expect(skill?.tools.length, `tools.length for ${id}`).toBeGreaterThan(0);
    }
  });
});
