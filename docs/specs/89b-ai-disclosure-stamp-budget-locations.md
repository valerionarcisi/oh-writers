# Spec 89b — AI disclosure stamp, Budget + Locations exports

Status: **Done**. Owner: Valerio. Sub-spec of [Spec 89](./89-ai-disclosure-stamp.md).

## Problem Statement

Spec 89 stamps every export Cesare has ever touched — narrative documents,
screenplay, breakdown, shooting schedule. It missed two surfaces that have
the exact same property: Cesare has real write tools against Budget
(`add_budget_line`, `update_budget_line`, `add_to_budget`,
`mark_line_actual`, `redistribute_topsheet`, `set_budget_cap`) and Locations
(`add_candidate`, `create_location_requirement`,
`find_or_create_requirement_for_scene`), and both have real export surfaces
(Budget CSV + PDF, Locations CSV) with no disclosure note. Same rationale as
the parent spec: proactive honesty toward whoever reads the export, not a
legal requirement.

## Solution

Same binary, permanent trigger rule as Spec 89: any Cesare write, ever, to
the exported artifact's data marks it permanently touched, independent of
later manual edits.

- **Budget**: one flag on `budgets` (1:1 per project, same granularity as
  `schedules.everAiTouched` — Cesare's budget tools mutate multiple lines
  per call, so "which line" has no clean meaning for a single flag, exactly
  the reasoning Spec 89 used for schedule). Note placed as a header line on
  the PDF, a leading metadata row on the CSV — same placement convention as
  breakdown/schedule.
- **Locations**: a flag on `locationRequirements` (per-row, same shape as
  `breakdown_elements.everAiTouched` — Cesare's location tools do address
  individual requirements/candidates, so a per-requirement flag is
  meaningful here, unlike budget). The CSV export aggregates with
  `requirements.some((r) => r.everAiTouched)` — identical to breakdown's
  `rows.some((r) => r.everAiTouched)` aggregation — and adds one leading
  metadata row when true.

No backfill for either: neither table had any AI-provenance signal before
these columns exist, matching screenplay/schedule's no-backfill decision in
the parent spec (marking history "touched" with zero real signal would be a
mass false positive, not caution).

## Implementation Decisions

- **Tracking coverage**:
  - `budgets.ever_ai_touched` (boolean, default false) — set by every Cesare
    tool that commits a real mutation to the budget: `set_budget_cap`,
    `update_budget_line`, `add_budget_line`, `add_to_budget`,
    `mark_line_actual`, `redistribute_topsheet`. `cesare-tool-entity-map.ts`
    also classifies `propose_excessive_lines_flags`/`propose_missing_lines`
    as `write`/`budget`, but they deliberately do **not** set the flag —
    they only surface a suggestion for the writer to accept or reject, they
    never mutate a budget row themselves (see `APPLYING_NON_DOCUMENT_TOOLS`
    in `cesare-tools.ts`: emitting an "applied" marker for a surface-only
    tool would reintroduce the fabricated-success bug F-A3). The
    entity-map's `write` classification tracks _tool-call authority_
    (whether the tool is allowed to write), not _whether this specific call
    committed a change_ — the disclosure flag follows the latter, so these
    two are a deliberate exception, not a gap.
  - `location_requirements.ever_ai_touched` (boolean, default false) — set
    by every Cesare tool that commits a real mutation to a requirement:
    `add_candidate`, `create_location_requirement`,
    `find_or_create_requirement_for_scene` (its create-branch only — the
    find-existing branch touches nothing and must not set the flag).
- **Placement**:
  - Budget PDF: header line (mirrors breakdown/schedule PDF placement).
  - Budget CSV: leading metadata row (mirrors breakdown/schedule CSV
    placement).
  - Locations CSV: leading metadata row, same convention. No PDF export
    exists for locations today, so no placement decision needed there.
- **Wording**: Italian, through the i18n catalogue as a new flat key per
  surface (`budget.export.aiDisclosureNote`,
  `locations.export.aiDisclosureNote`), same convention as every other
  Spec 89 surface.
- **Shared helper**: reuses the same `markXAiTouched` pattern as
  `breakdown/server/ai-disclosure.server.ts` and the schedule tools' inline
  `markScheduleAiTouched` — one small helper per domain, called from every
  write-tool call site, not duplicated per tool.

## Testing Decisions

Same shape as every other Spec 89 surface: sad path (never touched, no
note), happy path (one Cesare write, note present), permanence (a manual
edit after the Cesare write doesn't clear the note), plus direct plumbing
coverage proving a real Cesare tool call (not just the test-hook) sets the
flag — matching the screenplay/schedule precedent in the parent spec.

## Out of Scope

Same exclusions as the parent spec (no proportional measurement, no in-app
badge, no other export surface). Locations has no PDF export today — this
spec does not add one; if a Locations PDF export ships later, it inherits
this same flag and placement convention rather than needing a new decision.

## Definition of Done

- `budgets.ever_ai_touched` + `location_requirements.ever_ai_touched`
  migrations.
- All budget write tools + all location write tools set their respective
  flag.
- Budget PDF + CSV, Locations CSV carry the note when touched.
- E2E coverage: sad/happy/permanence per surface + one plumbing test per
  domain proving a real tool call sets the flag.
