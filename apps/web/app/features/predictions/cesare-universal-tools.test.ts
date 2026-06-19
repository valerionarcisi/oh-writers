/**
 * Spec 43 regression guard.
 *
 * The universal Cesare tool factory must include EVERY previously
 * page-bound tool. If someone adds a new tool to a per-domain factory but
 * forgets to register it in the universal factory, this test fails fast.
 *
 * We don't need a real database to assert this — we only count tool keys.
 */
import { describe, it, expect, vi } from "vitest";
import { createUniversalCesareTools } from "./cesare-universal-tools";
import { CESARE_LOCATION_TOOLS } from "./cesare-tools";
import { CESARE_SCREENPLAY_TOOLS } from "./cesare-screenplay-tools";
import { CESARE_DOCUMENT_TOOLS } from "./cesare-tools";
import { CESARE_DOCUMENT_GEN_TOOLS } from "./cesare-document-tools";
import { CESARE_BREAKDOWN_TOOLS } from "./cesare-tools";
import { CESARE_BUDGET_TOOLS } from "./cesare-tools";
import { CESARE_SCHEDULE_TOOLS } from "./cesare-schedule-tools";
import { CESARE_SHOOTING_PLAN_TOOLS } from "./cesare-shooting-plan-tools";
import { CESARE_READ_TOOLS } from "./cesare-read-tools";

// Minimal stub DB — we never invoke the tools, just enumerate them.
const stubDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {},
} as unknown as Parameters<typeof createUniversalCesareTools>[0];

const PROJECT_ID = "00000000-0000-4000-a000-000000000001";

describe("createUniversalCesareTools", () => {
  const tools = createUniversalCesareTools(stubDb, {
    projectId: PROJECT_ID,
    documentContext: null,
    activeSceneId: null,
    activeDayNumber: null,
    userIdFallback: null,
    sessionId: null,
    userInstruction: null,
  });
  const toolNames = new Set(Object.keys(tools));

  it("includes every location tool", () => {
    for (const t of CESARE_LOCATION_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every screenplay tool", () => {
    for (const t of CESARE_SCREENPLAY_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every document edit tool", () => {
    for (const t of CESARE_DOCUMENT_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every document-generation tool", () => {
    for (const t of CESARE_DOCUMENT_GEN_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every breakdown tool", () => {
    for (const t of CESARE_BREAKDOWN_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every budget tool", () => {
    for (const t of CESARE_BUDGET_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every schedule tool", () => {
    for (const t of CESARE_SCHEDULE_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every shooting-plan tool", () => {
    for (const t of CESARE_SHOOTING_PLAN_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes every read tool", () => {
    for (const t of CESARE_READ_TOOLS) {
      expect(toolNames).toContain(t.name);
    }
  });

  it("includes the three new location-requirement tools", () => {
    expect(toolNames).toContain("list_location_requirements");
    expect(toolNames).toContain("create_location_requirement");
    expect(toolNames).toContain("find_or_create_requirement_for_scene");
  });

  it("has no duplicate keys (last-write-wins would silently drop a tool)", () => {
    const allKeys: string[] = [
      ...CESARE_LOCATION_TOOLS.map((t) => t.name),
      ...CESARE_SCREENPLAY_TOOLS.map((t) => t.name),
      ...CESARE_DOCUMENT_TOOLS.map((t) => t.name),
      ...CESARE_DOCUMENT_GEN_TOOLS.map((t) => t.name),
      ...CESARE_BREAKDOWN_TOOLS.map((t) => t.name),
      ...CESARE_BUDGET_TOOLS.map((t) => t.name),
      ...CESARE_SCHEDULE_TOOLS.map((t) => t.name),
      ...CESARE_SHOOTING_PLAN_TOOLS.map((t) => t.name),
      ...CESARE_READ_TOOLS.map((t) => t.name),
    ];
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const k of allKeys) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes).toEqual([]);
  });
});
