import { errAsync } from "neverthrow";
import { CesareError } from "../cesare.errors";
import type {
  SkillRegistry,
  Skill,
  SkillId,
  PageType,
  SkillBuildContext,
} from "./types";
import type { IntentResult } from "../cesare-intent-classifier";
import { buildLocationsSkill } from "./locations.skill";
import { buildBreakdownSkill } from "./breakdown.skill";
import { buildBudgetSkill } from "./budget.skill";
import { buildScheduleSkill } from "./schedule.skill";
import { buildShootingPlanSkill } from "./shooting-plan.skill";
import { buildScreenplayEditSkill } from "./screenplay-edit.skill";
import { buildReadSceneSkill } from "./read-scene.skill";
import { buildReadDocumentSkill } from "./read-document.skill";
import { buildDocumentGenSkill } from "./document-gen.skill";

// ─── Page → primary skill IDs mapping ─────────────────────────────────────────
// Universal dispatch (spec 47b): the page no longer GATES the tool surface — it
// only sets which skills lead the guidance/context ordering so the model gets
// page-appropriate phrasing first. `selectForPage` returns the FULL universal
// skill superset; this map just decides the leading (page-primary) skills so
// their guidance blocks are emitted first. Cesare is a layer above the SaaS: a
// request on any page can reach any tool, with project-access auth + Zod
// validation + auto-versioning still enforced at the executor boundary.
// Note: the "document-edit" skill is page-bound (it needs a live
// DocumentContext) and is injected as an override by the caller when on a
// document page. Cross-domain document WRITES go through the always-available
// "document-gen" skill instead, whose tools resolve their target by projectId.

const PAGE_PRIMARY_SKILLS: Record<PageType, SkillId[]> = {
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

const buildBaseSkills = (
  ctx: SkillBuildContext,
  userIdFallback: string | null,
): BaseSkills => ({
  locations: buildLocationsSkill(ctx),
  breakdown: buildBreakdownSkill(ctx),
  budget: buildBudgetSkill(ctx),
  schedule: buildScheduleSkill(ctx),
  "shooting-plan": buildShootingPlanSkill(ctx),
  "screenplay-edit": buildScreenplayEditSkill(ctx),
  "document-gen": buildDocumentGenSkill(ctx, userIdFallback),
  "read-scene": buildReadSceneSkill(ctx),
  "read-document": buildReadDocumentSkill(ctx),
});

// ─── Registry factory ─────────────────────────────────────────────────────────
// Accepts an optional overrides map so the caller can inject a document-edit
// skill built with the live DocumentContext, plus a `userIdFallback` so the
// always-available document-gen skill can attribute auto-created versions.

export const buildSkillRegistry = (
  ctx: SkillBuildContext,
  overrides: Partial<Record<SkillId, Skill>> = {},
  userIdFallback: string | null = null,
): SkillRegistry => {
  const base = buildBaseSkills(ctx, userIdFallback);
  const skills: Partial<Record<SkillId, Skill>> = { ...base, ...overrides };

  // Order the universal superset so the page-primary skills lead (their
  // guidance is emitted first), then every remaining skill follows. When a
  // page injects "document-edit" (which already bundles the document-gen
  // tools), drop the standalone "document-gen" skill to avoid duplicate tool
  // definitions reaching the model.
  const orderUniversal = (page: PageType): Skill[] => {
    const leadIds = PAGE_PRIMARY_SKILLS[page] ?? [];
    const hasDocEdit =
      leadIds.includes("document-edit") && !!skills["document-edit"];
    const ordered: Skill[] = [];
    const seen = new Set<SkillId>();
    const push = (id: SkillId): void => {
      if (seen.has(id)) return;
      if (id === "document-gen" && hasDocEdit) return;
      const skill = skills[id];
      if (!skill) return;
      seen.add(id);
      ordered.push(skill);
    };
    for (const id of leadIds) push(id);
    for (const id of Object.keys(skills) as SkillId[]) push(id);
    return ordered;
  };

  return {
    get: (id: SkillId): Skill | undefined => skills[id],

    selectForPage: (page: PageType, _intent: IntentResult | null): Skill[] =>
      orderUniversal(page),

    primarySkillsForPage: (page: PageType): Skill[] =>
      (PAGE_PRIMARY_SKILLS[page] ?? [])
        .map((id) => skills[id])
        .filter((s): s is Skill => s !== undefined),

    allTools: (selected: readonly Skill[]) => {
      // Dedup by tool name — defensive against any skill overlap so the model
      // never receives two tool definitions with the same name.
      const seen = new Set<string>();
      return selected.flatMap((s) =>
        s.tools.filter((t) => {
          if (seen.has(t.name)) return false;
          seen.add(t.name);
          return true;
        }),
      );
    },

    combinedExecutor:
      (selected: readonly Skill[]) => (block, db, projectId, access) => {
        const owner = selected.find((s) =>
          s.tools.some((t) => t.name === block.name),
        );
        if (!owner) {
          return errAsync(new CesareError(`Unknown tool: ${block.name}`));
        }
        return owner.executor(block, db, projectId, access);
      },
  };
};
