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
  cesareSessionId: null,
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

// Universal dispatch (spec 47b): `selectForPage` returns the FULL skill
// superset on every page — the page only orders which guidance leads. These
// tests prove a foreign-domain skill (and therefore its tools) is selectable
// from any page, while the page-primary skill still leads.

const UNIVERSAL_BASE_IDS: SkillId[] = [
  "locations",
  "breakdown",
  "budget",
  "schedule",
  "shooting-plan",
  "screenplay-edit",
  "document-gen",
  "read-scene",
  "read-document",
];

describe("SkillRegistry.selectForPage — universal dispatch", () => {
  it("exposes the full skill superset on the screenplay page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const ids = registry.selectForPage("screenplay", null).map((s) => s.id);
    for (const id of UNIVERSAL_BASE_IDS) expect(ids).toContain(id);
  });

  it("makes a foreign-domain skill selectable from the screenplay page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const ids = registry.selectForPage("screenplay", null).map((s) => s.id);
    // The cross-domain document-write skill must be reachable from the
    // Sceneggiatura page so a request there can write the Soggetto.
    expect(ids).toContain("document-gen");
  });

  it("exposes the full superset on the budget page too", () => {
    const registry = buildSkillRegistry(makeCtx());
    const ids = registry.selectForPage("budget", null).map((s) => s.id);
    for (const id of UNIVERSAL_BASE_IDS) expect(ids).toContain(id);
  });

  it("leads with the page-primary skill on the locations page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("locations", null);
    expect(skills[0]?.id).toBe("locations");
    const ids = skills.map((s) => s.id);
    expect(ids.slice(0, 3)).toEqual([
      "locations",
      "read-scene",
      "read-document",
    ]);
  });

  it("leads with the page-primary skill on the screenplay page", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("screenplay", null);
    expect(skills[0]?.id).toBe("screenplay-edit");
  });

  it("includes document-edit AND drops standalone document-gen when injected on a doc page", () => {
    const docSkill = makeSkill("document-edit", [
      "apply_text_edit",
      // document-edit already bundles the document-gen tools in production
      "propose_soggetto_v2",
    ]);
    const registry = buildSkillRegistry(makeCtx(), {
      "document-edit": docSkill,
    });
    const ids = registry.selectForPage("soggetto", null).map((s) => s.id);
    expect(ids[0]).toBe("document-edit");
    expect(ids).not.toContain("document-gen");
  });

  it("keeps document-gen on a doc page when document-edit is NOT injected", () => {
    const registry = buildSkillRegistry(makeCtx());
    const ids = registry.selectForPage("soggetto", null).map((s) => s.id);
    expect(ids).not.toContain("document-edit");
    // Falls back to the always-available cross-domain document-gen skill.
    expect(ids).toContain("document-gen");
  });
});

// ─── primarySkillsForPage ──────────────────────────────────────────────────────
// The page-primary subset that scopes buildLocalContext data loading. It must
// stay narrow (the page's own skills) even though selectForPage is universal.

describe("SkillRegistry.primarySkillsForPage", () => {
  it("returns only the page-primary skills for locations", () => {
    const registry = buildSkillRegistry(makeCtx());
    const ids = registry.primarySkillsForPage("locations").map((s) => s.id);
    expect(ids).toEqual(["locations", "read-scene", "read-document"]);
  });

  it("returns only the page-primary skills for budget", () => {
    const registry = buildSkillRegistry(makeCtx());
    const ids = registry.primarySkillsForPage("budget").map((s) => s.id);
    expect(ids).toEqual(["budget", "read-scene"]);
  });

  it("stays narrower than the universal selectForPage set", () => {
    const registry = buildSkillRegistry(makeCtx());
    const primary = registry.primarySkillsForPage("screenplay");
    const universal = registry.selectForPage("screenplay", null);
    expect(primary.length).toBeLessThan(universal.length);
  });
});

// ─── Cross-domain dispatch (spec 47b) ──────────────────────────────────────────
// The keystone of the fix: a tool whose domain is NOT the current page must be
// both exposed by selectForPage and routable by combinedExecutor. This proves
// `propose_soggetto_v2` (a Soggetto write) is reachable from the Sceneggiatura
// page through the real registry, end to end at the dispatch layer.

describe("SkillRegistry — cross-domain dispatch from a foreign page", () => {
  const CROSS_DOMAIN_TOOL = "propose_soggetto_v2";

  it("exposes the Soggetto-write tool in the screenplay tool surface", () => {
    const registry = buildSkillRegistry(makeCtx(), {}, "user-1");
    const skills = registry.selectForPage("screenplay", null);
    const toolNames = registry.allTools(skills).map((t) => t.name);
    expect(toolNames).toContain(CROSS_DOMAIN_TOOL);
  });

  it("routes the Soggetto-write tool to an owning skill from the screenplay page", () => {
    const registry = buildSkillRegistry(makeCtx(), {}, "user-1");
    const skills = registry.selectForPage("screenplay", null);
    const owner = skills.find((s) =>
      s.tools.some((t) => t.name === CROSS_DOMAIN_TOOL),
    );
    expect(owner).toBeDefined();
    // The combinedExecutor must resolve the owner without erroring on lookup.
    const executor = registry.combinedExecutor(skills);
    expect(typeof executor).toBe("function");
  });

  it("does NOT route an unknown tool (guard intact)", async () => {
    const registry = buildSkillRegistry(makeCtx(), {}, "user-1");
    const skills = registry.selectForPage("screenplay", null);
    const executor = registry.combinedExecutor(skills);
    const result = await executor(
      makeBlock("tool_that_does_not_exist"),
      STUB_DB,
      "proj-1",
      STUB_ACCESS,
    );
    expect(result.isErr()).toBe(true);
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

  it("dedups tools by name across overlapping skills (first wins)", () => {
    const skillA = makeSkill("locations" as SkillId, ["shared_tool", "a_only"]);
    const skillB = makeSkill("read-scene" as SkillId, [
      "shared_tool",
      "b_only",
    ]);
    const registry = buildSkillRegistry(makeCtx());
    const tools = registry.allTools([skillA, skillB]);
    expect(tools.map((t) => t.name)).toEqual([
      "shared_tool",
      "a_only",
      "b_only",
    ]);
  });

  it("produces no duplicate tool names across the full universal screenplay set", () => {
    const registry = buildSkillRegistry(makeCtx());
    const skills = registry.selectForPage("screenplay", null);
    const names = registry.allTools(skills).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
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
