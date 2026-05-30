// apps/web/app/features/predictions/cesare-tool-entity-map.ts
//
// Spec 47a (A2) — maps a Cesare tool name to the entity it touches and whether
// it READS or WRITES that entity. This is the keystone of the cross-domain
// trace: the mapping is keyed by TOOL NAME, not by the page the user is on, so
// a `propose_synopsis_from_screenplay` issued on the Sceneggiatura page resolves
// to `writing{synopsis}` even though the active page is `screenplay`.
//
// Shared by the server stream emitter (cesare-stream.server.ts) and the client
// reducer (use-cesare-chat.ts) so both sides agree on the entity a step touched.
import type { EntityRef, StreamEntityDomain } from "./cesare-stream-events";

export type ToolAccessKind = "read" | "write";

export interface ToolEntityMapping {
  readonly access: ToolAccessKind;
  readonly domain: StreamEntityDomain;
}

// User-facing IT label per domain. Kept here (not in the page-label map) so the
// stream layer has no dependency on the CesareSheet component.
const DOMAIN_LABEL: Record<StreamEntityDomain, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
  screenplay: "Sceneggiatura",
  breakdown: "Breakdown",
  budget: "Budget",
  schedule: "Calendario",
  "shooting-plan": "Piano Inquadrature",
  locations: "Location",
};

export const labelForDomain = (domain: StreamEntityDomain): string =>
  DOMAIN_LABEL[domain];

export const entityRefForDomain = (domain: StreamEntityDomain): EntityRef => ({
  domain,
  label: DOMAIN_LABEL[domain],
});

// The canonical mapping. Every tool the registry can expose is classified here.
// `read_*` tools are reads; everything that mutates is a write. The DOMAIN is
// the tool's TARGET, which is what makes the cross-domain trace correct.
const TOOL_ENTITY_MAP: Readonly<Record<string, ToolEntityMapping>> = {
  // ── reads ────────────────────────────────────────────────────────────────
  read_scene: { access: "read", domain: "screenplay" },
  read_scene_range: { access: "read", domain: "screenplay" },
  read_document: { access: "read", domain: "soggetto" },
  read_breakdown: { access: "read", domain: "breakdown" },
  read_budget_lines: { access: "read", domain: "budget" },
  read_shooting_day: { access: "read", domain: "schedule" },
  read_location_requirement: { access: "read", domain: "locations" },
  list_location_requirements: { access: "read", domain: "locations" },
  get_weather_forecast: { access: "read", domain: "locations" },
  search_places: { access: "read", domain: "locations" },
  analyze_variance: { access: "read", domain: "budget" },
  evaluate_against_cap: { access: "read", domain: "budget" },
  estimate_scene_cost: { access: "read", domain: "breakdown" },
  suggest_reorder: { access: "read", domain: "schedule" },

  // ── document writes (cross-domain targets) ────────────────────────────────
  propose_logline_from_screenplay: { access: "write", domain: "logline" },
  write_logline: { access: "write", domain: "logline" },
  propose_synopsis_from_screenplay: { access: "write", domain: "synopsis" },
  propose_soggetto_v2: { access: "write", domain: "soggetto" },
  propose_scaletta_from_soggetto: { access: "write", domain: "outline" },
  apply_text_edit: { access: "write", domain: "soggetto" },
  expand_section: { access: "write", domain: "soggetto" },
  compress_section: { access: "write", domain: "soggetto" },

  // ── screenplay writes ─────────────────────────────────────────────────────
  rewrite_scene: { access: "write", domain: "screenplay" },
  propose_screenplay_edit: { access: "write", domain: "screenplay" },
  propose_screenplay_revision: { access: "write", domain: "screenplay" },
  propose_blocking_for_scene: { access: "write", domain: "shooting-plan" },
  propose_move_actor_position: { access: "write", domain: "shooting-plan" },
  propose_move_camera_pin: { access: "write", domain: "shooting-plan" },

  // ── breakdown writes ──────────────────────────────────────────────────────
  propose_rename_entity: { access: "write", domain: "breakdown" },
  tag_element: { access: "write", domain: "breakdown" },

  // ── budget writes ─────────────────────────────────────────────────────────
  set_budget_cap: { access: "write", domain: "budget" },
  update_budget_line: { access: "write", domain: "budget" },
  add_budget_line: { access: "write", domain: "budget" },
  add_to_budget: { access: "write", domain: "budget" },
  mark_line_actual: { access: "write", domain: "budget" },
  redistribute_topsheet: { access: "write", domain: "budget" },
  propose_excessive_lines_flags: { access: "write", domain: "budget" },
  propose_missing_lines: { access: "write", domain: "budget" },
  accept_ghost: { access: "write", domain: "budget" },
  reject_ghost: { access: "write", domain: "budget" },

  // ── schedule writes ───────────────────────────────────────────────────────
  move_scene_to_day: { access: "write", domain: "schedule" },
  swap_scenes: { access: "write", domain: "schedule" },
  merge_days: { access: "write", domain: "schedule" },
  lock_day: { access: "write", domain: "schedule" },
  unlock_day: { access: "write", domain: "schedule" },

  // ── locations writes ──────────────────────────────────────────────────────
  add_candidate: { access: "write", domain: "locations" },
  create_location_requirement: { access: "write", domain: "locations" },
  find_or_create_requirement_for_scene: {
    access: "write",
    domain: "locations",
  },

  // ── shooting-plan writes ──────────────────────────────────────────────────
  add_shot_to_plan: { access: "write", domain: "shooting-plan" },
  update_shot: { access: "write", domain: "shooting-plan" },
  remove_shot: { access: "write", domain: "shooting-plan" },
  add_parallel_plan: { access: "write", domain: "shooting-plan" },
  set_active_plan: { access: "write", domain: "shooting-plan" },
  generate_plan_from_description: { access: "write", domain: "shooting-plan" },
};

/** Resolve a tool name to its entity mapping, or `null` when unknown (the
 *  emitter then falls back to a raw `tool` event rather than guessing). */
export const mappingForTool = (toolName: string): ToolEntityMapping | null =>
  TOOL_ENTITY_MAP[toolName] ?? null;
