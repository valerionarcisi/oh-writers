import { describe, it, expect } from "vitest";
import { ResultAsync } from "neverthrow";
import { assembleSystemPromptV2 } from "./assemble-system-prompt";
import type { GlobalContext, LocalContext } from "@oh-writers/domain";
import type { Skill } from "../skills/types";

// Cesare cache fix — regression guard for the mega-block layout. Before this
// fix, assembleSystemPromptV2 put cache_control on ROLE_TEXT, the global
// context, AND every individual skill block — ~10-12 breakpoints against
// Anthropic's 4-breakpoint-per-request cap, so most of them were silently
// dropped and never cached. This test locks the collapsed layout in place:
// exactly ONE cache_control breakpoint for the whole static prefix.

const globalCtx = (): GlobalContext => ({
  projectTitle: "Film Test",
  genre: "thriller",
  format: "feature",
  bible: null,
});

const localCtx = (): LocalContext => ({
  projectTitle: "Film Test",
  scenes: [],
  currentScene: null,
  sceneWindow: [],
  sceneSummaries: [],
  characters: [],
  activeDocument: null,
  currentRequirement: null,
  activeShootingDay: null,
});

const makeSkill = (id: string, guidanceBlock: string): Skill => ({
  id: id as Skill["id"],
  tools: [],
  guidanceBlock,
  // Never invoked in these tests — only the guidanceBlock/id matter here.
  executor: () =>
    ResultAsync.fromSafePromise(
      Promise.resolve({
        type: "tool_result" as const,
        tool_use_id: "test",
        content: "ok",
      }),
    ),
  requiredData: [],
});

describe("assembleSystemPromptV2 — cache block layout", () => {
  it("emits exactly one cache_control breakpoint across the whole prompt", () => {
    const skills = [
      makeSkill("schedule", "Schedule guidance text"),
      makeSkill("shooting-plan", "Shooting-plan guidance text"),
      makeSkill("budget", "Budget guidance text"),
    ];
    const blocks = assembleSystemPromptV2(globalCtx(), skills, localCtx());
    const cachedBlocks = blocks.filter((b) => b.cache_control !== undefined);
    expect(cachedBlocks).toHaveLength(1);
  });

  it("merges ROLE_TEXT, global context, and every skill's guidanceBlock into that one cached block", () => {
    const skills = [
      makeSkill("schedule", "SCHEDULE_MARKER_TEXT"),
      makeSkill("shooting-plan", "SHOOTING_PLAN_MARKER_TEXT"),
    ];
    const blocks = assembleSystemPromptV2(globalCtx(), skills, localCtx());
    const megaBlock = blocks.find((b) => b.cache_control !== undefined);
    expect(megaBlock).toBeDefined();
    expect(megaBlock!.text).toContain("Sei Cesare");
    expect(megaBlock!.text).toContain("Film Test");
    expect(megaBlock!.text).toContain("SCHEDULE_MARKER_TEXT");
    expect(megaBlock!.text).toContain("SHOOTING_PLAN_MARKER_TEXT");
  });

  it("keeps formatLocalContext's output uncached (no cache_control)", () => {
    const ctx: LocalContext = {
      ...localCtx(),
      scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
    };
    const blocks = assembleSystemPromptV2(globalCtx(), [], ctx);
    const localBlock = blocks.find((b) => b.text.includes("CONTESTO LOCALE"));
    expect(localBlock).toBeDefined();
    expect(localBlock!.cache_control).toBeUndefined();
  });

  it("keeps historyContext uncached and appended last when present", () => {
    const blocks = assembleSystemPromptV2(
      globalCtx(),
      [],
      localCtx(),
      "HISTORY_MARKER_TEXT",
    );
    const historyBlock = blocks.find((b) =>
      b.text.includes("HISTORY_MARKER_TEXT"),
    );
    expect(historyBlock).toBeDefined();
    expect(historyBlock!.cache_control).toBeUndefined();
    expect(blocks.at(-1)).toBe(historyBlock);
  });

  it("omits historyContext entirely when null (default)", () => {
    const blocks = assembleSystemPromptV2(globalCtx(), [], localCtx());
    expect(blocks.some((b) => b.text.includes("HISTORY_MARKER_TEXT"))).toBe(
      false,
    );
  });

  it("produces a byte-identical mega-block across two calls with the same inputs", () => {
    const skills = [makeSkill("budget", "Budget guidance text")];
    const a = assembleSystemPromptV2(globalCtx(), skills, localCtx());
    const b = assembleSystemPromptV2(globalCtx(), skills, localCtx());
    const megaA = a.find((x) => x.cache_control !== undefined)!;
    const megaB = b.find((x) => x.cache_control !== undefined)!;
    expect(megaA.text).toBe(megaB.text);
  });
});
