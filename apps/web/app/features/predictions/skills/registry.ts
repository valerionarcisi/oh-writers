import { errAsync } from "neverthrow";
import { CesareError } from "../cesare.errors";
import type { SkillRegistry, Skill, SkillId, PageType, SkillBuildContext } from "./types";
import type { IntentResult } from "../cesare-intent-classifier";
import { buildLocationsSkill } from "./locations.skill";
import { buildBreakdownSkill } from "./breakdown.skill";
import { buildBudgetSkill } from "./budget.skill";
import { buildScheduleSkill } from "./schedule.skill";
import { buildShootingPlanSkill } from "./shooting-plan.skill";
import { buildScreenplayEditSkill } from "./screenplay-edit.skill";
import { buildReadSceneSkill } from "./read-scene.skill";
import { buildReadDocumentSkill } from "./read-document.skill";

// ─── Page → Skill IDs mapping ─────────────────────────────────────────────────
// Each page declares which skills are active. The first entry is the primary
// skill (mutation-capable); read-* skills are lazy companions.
// Note: "document-edit" pages (soggetto/synopsis/outline/treatment) are handled
// specially by Agent C because buildDocumentEditSkill requires a DocumentContext
// (live document content) injected at call time.

const PAGE_SKILL_MAP: Record<PageType, SkillId[]> = {
  locations: ["locations", "read-scene", "read-document"],
  breakdown: ["breakdown", "read-scene"],
  budget: ["budget", "read-scene"],
  schedule: ["schedule", "read-scene"],
  "shooting-plan": ["shooting-plan", "read-scene"],
  soggetto: ["document-edit", "read-document"],
  synopsis: ["document-edit", "read-document"],
  outline: ["document-edit", "read-document"],
  treatment: ["document-edit", "read-document"],
  screenplay: ["screenplay-edit", "read-scene"],
};

// ─── Base skill map (excludes document-edit — requires DocumentContext) ────────

type BaseSkillId = Exclude<SkillId, "document-edit">;

type BaseSkills = Record<BaseSkillId, Skill>;

const buildBaseSkills = (ctx: SkillBuildContext): BaseSkills => ({
  locations: buildLocationsSkill(ctx),
  breakdown: buildBreakdownSkill(ctx),
  budget: buildBudgetSkill(ctx),
  schedule: buildScheduleSkill(ctx),
  "shooting-plan": buildShootingPlanSkill(ctx),
  "screenplay-edit": buildScreenplayEditSkill(ctx),
  "read-scene": buildReadSceneSkill(ctx),
  "read-document": buildReadDocumentSkill(ctx),
});

// ─── Registry factory ─────────────────────────────────────────────────────────
// Accepts an optional overrides map so Agent C can inject a document-edit skill
// built with the live DocumentContext.

export const buildSkillRegistry = (
  ctx: SkillBuildContext,
  overrides: Partial<Record<SkillId, Skill>> = {},
): SkillRegistry => {
  const base = buildBaseSkills(ctx);
  const skills: Partial<Record<SkillId, Skill>> = { ...base, ...overrides };

  return {
    get: (id: SkillId): Skill | undefined => skills[id],

    selectForPage: (page: PageType, _intent: IntentResult | null): Skill[] => {
      const ids = PAGE_SKILL_MAP[page] ?? [];
      return ids
        .map((id) => skills[id])
        .filter((s): s is Skill => s !== undefined);
    },

    allTools: (selected: readonly Skill[]) =>
      selected.flatMap((s) => s.tools),

    combinedExecutor:
      (selected: readonly Skill[]) =>
      (block, db, projectId, access) => {
        const owner = selected.find((s) =>
          s.tools.some((t) => t.name === block.name),
        );
        if (!owner) {
          return errAsync(
            new CesareError(`Unknown tool: ${block.name}`),
          );
        }
        return owner.executor(block, db, projectId, access);
      },
  };
};
