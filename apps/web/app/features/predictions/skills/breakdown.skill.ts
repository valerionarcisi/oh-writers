import { CESARE_BREAKDOWN_TOOLS, executeBreakdownTool } from "../cesare-tools";
import type { Skill, SkillBuildContext } from "./types";

// ─── Guidance builder ─────────────────────────────────────────────────────────

const buildBreakdownGuidance = (): string =>
  `\n\nTOOLS DISPONIBILI SUL BREAKDOWN:
- tag_element(scene_number, category, name, quantity?): aggiunge un elemento allo spoglio di una scena.
- accept_ghost(occurrence_id): accetta un suggerimento ghost.
- reject_ghost(occurrence_id): rifiuta un suggerimento ghost.
- estimate_scene_cost(scene_number): calcola costo e difficoltà di una scena.
- add_to_budget(scene_number): converte la stima della scena in righe budget reali.

Quando l'utente chiede di taggare un elemento ('spoglia X', 'aggiungi X come prop', 'questa scena ha un'arma'), USA tag_element. Quando chiede una stima di costo per una scena, USA estimate_scene_cost. Quando chiede di portare i costi al budget, USA add_to_budget. Conferma sempre in italiano cosa hai fatto.`;

// ─── Skill factory ────────────────────────────────────────────────────────────

export const buildBreakdownSkill = (_ctx: SkillBuildContext): Skill => ({
  id: "breakdown",
  // Read tools are provided by the companion read-scene skill in PAGE_SKILL_MAP.
  tools: [...CESARE_BREAKDOWN_TOOLS] as Skill["tools"],
  guidanceBlock: buildBreakdownGuidance(),
  executor: (block, db, projectId) =>
    executeBreakdownTool(block, db, projectId),
  requiredData: ["breakdown", "screenplay"],
});
