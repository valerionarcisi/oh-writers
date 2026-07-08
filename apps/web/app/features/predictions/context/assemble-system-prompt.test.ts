import { describe, it, expect } from "vitest";
import { ResultAsync } from "neverthrow";
import { assembleSystemPromptV2 } from "./assemble-system-prompt";
import type { GlobalContext, LocalContext } from "@oh-writers/domain";
import type { Skill } from "../skills/types";

// Cesare cache fix — regression guard for the block layout. The original fix
// collapsed the static prefix (ROLE_TEXT + global context + every skill block)
// from ~10-12 breakpoints down to ONE, so they actually cache under Anthropic's
// 4-breakpoint-per-request cap. BUG-101 then added cache_control to the local
// and history blocks too: the tool loop makes up to 5 model round-trips per turn
// and re-sends those blocks every step, so caching them turns 4 full re-bills
// into 4 cache reads within a turn. Final layout: MEGA_STATIC + local (+ history
// when present) each carry exactly one breakpoint — 3 total (2 without history),
// plus the tool-array breakpoint = at most 4, exactly at the cap.

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
  it("collapses the whole static prefix into ONE cached mega-block", () => {
    // The static prefix (ROLE_TEXT + global + every skill) must stay a single
    // breakpoint — never fan back out to one-per-skill. With no history block,
    // that's the mega-block plus the local block = 2 cached blocks total.
    const skills = [
      makeSkill("schedule", "Schedule guidance text"),
      makeSkill("shooting-plan", "Shooting-plan guidance text"),
      makeSkill("budget", "Budget guidance text"),
    ];
    const blocks = assembleSystemPromptV2(globalCtx(), skills, localCtx());
    const cachedBlocks = blocks.filter((b) => b.cache_control !== undefined);
    // mega-static + local, no history → 2 breakpoints (under the 4 cap).
    expect(cachedBlocks).toHaveLength(2);
    // Exactly one of them is the collapsed static prefix.
    const staticPrefix = cachedBlocks.filter((b) =>
      b.text.includes("Sei Cesare"),
    );
    expect(staticPrefix).toHaveLength(1);
  });

  it("stays within Anthropic's 4-breakpoint cap even with history present", () => {
    const skills = [makeSkill("schedule", "Schedule guidance text")];
    const blocks = assembleSystemPromptV2(
      globalCtx(),
      skills,
      localCtx(),
      "HISTORY_MARKER_TEXT",
    );
    const cachedBlocks = blocks.filter((b) => b.cache_control !== undefined);
    // mega-static + local + history = 3; plus the tool-array breakpoint set
    // elsewhere = 4, exactly at the cap.
    expect(cachedBlocks).toHaveLength(3);
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

  it("caches formatLocalContext's output (re-sent every tool-loop step)", () => {
    const ctx: LocalContext = {
      ...localCtx(),
      scenes: [{ id: "s1", number: 1, heading: "INT. UFFICIO - GIORNO" }],
    };
    const blocks = assembleSystemPromptV2(globalCtx(), [], ctx);
    const localBlock = blocks.find((b) => b.text.includes("CONTESTO LOCALE"));
    expect(localBlock).toBeDefined();
    expect(localBlock!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("caches historyContext and appends it last when present", () => {
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
    expect(historyBlock!.cache_control).toEqual({ type: "ephemeral" });
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
