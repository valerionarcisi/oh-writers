# Spec 55 — Shell Action Standard (context-aware TopBar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a **multi-slice** plan — each slice (A–D) is an independent WIP=1 front that ships working software on its own. Pull one slice, take it to merge, `/clear`, pull the next.

**Goal:** Make the TopBar the single, predictable home for every page's actions (search · context actions · notifications · account), driven by a declarative per-page **context-action registry**, with scattered export/import/versions/dock affordances migrated in and removed.

**Architecture:** A declarative registry maps `route segment → ordered action set`, each action feature-gated via the existing `resolveFeatures`/`useFeature` (Spec 54). The TopBar renders the resolved set in its existing `actions` slot using the existing `ActionsMenu`. Pages stop placing their own action bars. Notifications (bell) + account move from the LeftRail footer to the TopBar; the rail footer and the per-page docks are retired. A Spec 56 static + structural check enforces "actions live only in the TopBar zone" across all routes.

**Tech Stack:** TanStack Start/Router, React 19, CSS Modules, react-aria (`DropdownMenu`/`ActionsMenu`), Zod, Vitest + Playwright. Feature flags in `packages/domain/src/features/flags.ts`.

---

## Background — verified current state (2026-06-03 survey)

- **TopBar** (`packages/ui/src/shell/TopBar/TopBar.tsx`) is slim; pages inject via the slot context `apps/web/app/features/app-shell/top-bar-slots-context.tsx` (`useTopBarSlotPublisher(key, value)`) with slots `elementLegend | center | actions`. `ActionsMenu` (`packages/ui/src/shell/TopBar/ActionsMenu.tsx`) is the "…" menu already rendered in the `actions` slot.
- **Narrative pages already conform**: soggetto (`_app.projects.$id_.soggetto.tsx:224`), synopsis/outline/treatment (`NarrativeEditor.tsx` `docActionsMenu`, published via `NarrativeDocsShell.tsx`). These publish an `ActionsMenu` to `actions`. SIAE is already gated via `useFeature(Features.SIAE_EXPORT)`.
- **Non-conforming pages** (actions in a dock/custom toolbar, must migrate):
  - Screenplay: `ScreenplayToolbar.tsx` (export Fountain/PDF, import, versions) — floating.
  - Budget: `features/budget/components/BudgetPage.tsx:463-501` — FloatingDock secondary "Esporta" → `ExportBudgetModal`.
  - Schedule: `features/schedule/components/SchedulePage.tsx:526-551` — FloatingDock "Export" CSV + "Print" PDF.
  - Breakdown: `features/breakdown/components/BreakdownPage.tsx:1143-1163` — FloatingDock "Export" → `ExportBreakdownModal`.
  - Shooting plan: `features/shooting-plan/components/ShootingPlanPage.tsx:420-432` — custom `ShootingPlanDock`.
  - Locations: `features/locations/components/LocationsPage.tsx:500-527` — FloatingDock "Export".
- **Bell + account** currently live in the **LeftRail footer** (`LeftRail.tsx:801-809`, `account` prop), wired in `AppShell.tsx` (bell → `useBellOpener()` SplitDrawer). Spec 55 **supersedes Spec 47b** and moves these to the TopBar; the rail footer is removed. (Update CLAUDE.md + Spec 44 invariant when Slice C ships.)
- **Docks**: `BottomDock` = shell Cesare pill (keep). `FloatingDock` = per-page bars (retire after migration). `ShootingPlanDock` custom (retire).
- **Flags**: `packages/domain/src/features/flags.ts` (`Features` catalogue, `resolveFeatures`), hook `apps/web/app/features/feature-flags/feature-context.tsx` (`useFeature(feature): boolean`).
- **Spec 56 guards**: `tests/route-smoke.spec.ts` (route reachability) + `apps/web/app/quality/ds-consistency.test.ts` (no inline gating + rogue-hex ratchet). The "single-home action check + shell-zone structural assertions" are **not yet scaffolded** (Slice D).

---

## Slice decomposition (each is a WIP=1 front)

- **Slice A — Registry + TopBar action zone (backbone).** Build the declarative registry + a `useContextActions(segment)` resolver that feature-gates entries, and migrate the already-conforming narrative pages to consume it (proves the mechanism end-to-end without touching dock pages). Ships working: narrative actions now come from the registry; behaviour identical.
- **Slice B — Migrate dock pages into the registry.** Screenplay, budget, schedule, breakdown, shooting-plan, locations: register their export/import/versions actions; remove the dock/custom-toolbar action affordances. One page per task; ships incrementally.
- **Slice C — Bell + account → TopBar; retire rail footer + docks.** Add notifications + account zones to the TopBar; remove the LeftRail `account` footer; retire `FloatingDock`/`ShootingPlanDock`; update CLAUDE.md + Spec 44 invariant.
- **Slice D — Spec 56 enforcement (single-home + shell-zone).** Structural assertions across all routes so a non-compliant page fails CI.

> Recommended order: A → B → C → D. A unblocks B and C. Do not start B until A is merged.

---

## SLICE A — Registry + TopBar action zone (backbone)

**New files**

- Create: `packages/domain/src/actions/context-actions.ts` — the action-type catalogue + per-segment registry (pure data + types; framework-agnostic, no React/router imports).
- Create: `packages/domain/src/actions/context-actions.test.ts` — unit tests for the registry resolver.
- Create: `apps/web/app/features/app-shell/use-context-actions.ts` — React hook that resolves the registry for a segment, applies `useFeature` gating, and binds handlers.
- Test: `tests/shell/context-actions-registry.spec.ts` — E2E asserting the narrative pages render the same actions from the registry.

**Modify**

- `apps/web/app/routes/_app.projects.$id_.soggetto.tsx` — build its `ActionsMenu` items from `useContextActions("soggetto")` instead of the hand-written array.
- `apps/web/app/features/documents/components/NarrativeEditor.tsx` — same for synopsis/outline/treatment `docActionsMenu`.

### Design — what the registry holds

The registry must stay **handler-agnostic** (it lives in `packages/domain`, which must not import browser/router APIs — see CLAUDE.md). So it declares action _descriptors_ (id, label key, optional `feature` gate, optional `group`), and the **web hook** supplies the runtime handlers + visibility predicates (e.g. "export enabled only when `hasContent`").

```ts
// packages/domain/src/actions/context-actions.ts
import type { Feature } from "../features/flags.js";
import type { TranslationKey } from "../i18n/index.js"; // adjust to actual export

/** Stable identifiers for every context action across the app. */
export const ContextActionIds = {
  EXPORT_PDF: "export-pdf",
  EXPORT_DOCX: "export-docx",
  EXPORT_FOUNTAIN: "export-fountain",
  EXPORT_SIAE: "export-siae",
  EXPORT_CSV: "export-csv",
  IMPORT_FOUNTAIN: "import-fountain",
  IMPORT_PDF: "import-pdf",
  VERSIONS: "versions",
} as const;
export type ContextActionId =
  (typeof ContextActionIds)[keyof typeof ContextActionIds];

/** A declarative action descriptor — no handlers, no DOM. */
export interface ContextActionDescriptor {
  readonly id: ContextActionId;
  readonly labelKey: TranslationKey;
  /** When set, the action is hidden unless `resolveFeatures` includes it. */
  readonly feature?: Feature;
  /** Optional visual grouping/order hint within the menu. */
  readonly order: number;
}

/** Route segment → ordered action descriptors. The single source of truth for
 *  "what can I do on this page". */
export const CONTEXT_ACTIONS: Readonly<
  Record<string, ReadonlyArray<ContextActionDescriptor>>
> = {
  soggetto: [
    { id: "export-docx", labelKey: "actions.exportDocx", order: 10 },
    {
      id: "export-siae",
      labelKey: "actions.exportSiae",
      feature: "siae_export",
      order: 20,
    },
    { id: "versions", labelKey: "actions.versions", order: 90 },
  ],
  synopsis: [
    { id: "export-pdf", labelKey: "actions.exportPdf", order: 10 },
    { id: "versions", labelKey: "actions.versions", order: 90 },
  ],
  outline: [{ id: "versions", labelKey: "actions.versions", order: 90 }],
  treatment: [
    { id: "export-pdf", labelKey: "actions.exportPdf", order: 10 },
    { id: "versions", labelKey: "actions.versions", order: 90 },
  ],
  // Slice B fills in: screenplay, budget, schedule, breakdown, shooting-plan, locations.
} as const;

/** Resolve the visible, ordered descriptors for a segment given the enabled
 *  feature set. Pure — the web hook layers handlers + per-page enablement on top. */
export function resolveContextActions(
  segment: string,
  enabledFeatures: ReadonlySet<Feature>,
): ReadonlyArray<ContextActionDescriptor> {
  const set = CONTEXT_ACTIONS[segment] ?? [];
  return [...set]
    .filter((a) => a.feature === undefined || enabledFeatures.has(a.feature))
    .sort((a, b) => a.order - b.order);
}
```

> Confirm the real `Feature` value type and `TranslationKey` import path before writing — the survey shows `Features.SIAE_EXPORT = "siae_export"`. Add the `actions.*` label keys to `packages/domain/src/i18n/keys/common.ts` (EN + IT) in Step 3 — `actions.export`/`action.export` may already exist; reuse, don't duplicate.

### Tasks

- [ ] **A1 — Write the failing registry unit test**

```ts
// packages/domain/src/actions/context-actions.test.ts
import { describe, it, expect } from "vitest"; // confirm domain has a vitest runner; if not, place this test under apps/web and import from @oh-writers/domain
import { resolveContextActions, CONTEXT_ACTIONS } from "./context-actions";

describe("resolveContextActions", () => {
  it("returns soggetto actions ordered, gating SIAE on the feature", () => {
    const withSiae = resolveContextActions(
      "soggetto",
      new Set(["siae_export"]),
    );
    expect(withSiae.map((a) => a.id)).toEqual([
      "export-docx",
      "export-siae",
      "versions",
    ]);

    const withoutSiae = resolveContextActions("soggetto", new Set());
    expect(withoutSiae.map((a) => a.id)).toEqual(["export-docx", "versions"]);
  });

  it("returns [] for an unknown segment", () => {
    expect(resolveContextActions("nope", new Set())).toEqual([]);
  });
});
```

- [ ] **A2 — Run it, confirm it fails** (`module not found`). Command: `pnpm --filter @oh-writers/domain exec vitest run src/actions/context-actions.test.ts` (if domain has no vitest, run via the web app project). Expected: FAIL.
- [ ] **A3 — Implement `context-actions.ts`** as designed above (verify `Feature`/`TranslationKey` types compile). Add the `actions.*` i18n keys (EN + IT) if missing.
- [ ] **A4 — Run the unit test, confirm PASS.** Then `pnpm --recursive typecheck`. Expected: PASS, clean.
- [ ] **A5 — Commit.** `git add packages/domain/src/actions ... && git commit -m "[OHW] feat(actions): declarative context-action registry (Spec 55 Slice A)"`
- [ ] **A6 — Build `use-context-actions.ts`** — the web hook. It calls `resolveContextActions(segment, enabledSet)` (build `enabledSet` from `useFeature` per descriptor feature), maps each descriptor to a `DropdownMenuItem` using a handler table the caller passes in, and drops actions whose handler is absent/disabled:

```ts
// apps/web/app/features/app-shell/use-context-actions.ts
import { useMemo } from "react";
import {
  resolveContextActions,
  type ContextActionId,
} from "@oh-writers/domain";
import type { DropdownMenuItem } from "@oh-writers/ui";
import { useFeature } from "~/features/feature-flags";
import { useTranslation } from "~/features/i18n";
import { Features } from "@oh-writers/domain";

export type ContextActionHandlers = Partial<
  Record<ContextActionId, { onSelect: () => void; disabled?: boolean }>
>;

export function useContextActions(
  segment: string,
  handlers: ContextActionHandlers,
): DropdownMenuItem[] {
  const { t } = useTranslation();
  const siae = useFeature(Features.SIAE_EXPORT);
  // Extend this set as more gated actions appear.
  const enabled = useMemo(() => {
    const s = new Set<string>();
    if (siae) s.add(Features.SIAE_EXPORT);
    return s as ReadonlySet<never>;
  }, [siae]);
  return useMemo(() => {
    return resolveContextActions(segment, enabled as never)
      .map((d) => {
        const h = handlers[d.id];
        if (!h) return null; // page didn't wire this action → hide it
        return {
          label: t(d.labelKey),
          onClick: h.onSelect,
          disabled: h.disabled,
        };
      })
      .filter((x): x is DropdownMenuItem => x !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, enabled, handlers, t]);
}
```

- [ ] **A7 — Migrate Soggetto** to build its `topBarActions` items from `useContextActions("soggetto", {...})` (handlers: `export-docx` → open ExportPdfModal, `export-siae` → open SIAE modal, `versions` → toggleVersions). Remove the hand-written items array. Keep the `useMemo` discipline for `useTopBarSlotPublisher`.
- [ ] **A8 — Migrate synopsis/outline/treatment** in `NarrativeEditor.tsx` `docActionsMenu` the same way, keyed by the active segment.
- [ ] **A9 — Write the E2E** `tests/shell/context-actions-registry.spec.ts`: on soggetto (IT user) the actions menu lists Esporta DOCX + Esporta SIAE + Versioni; on synopsis it lists Esporta PDF + Versioni; assert order. (Direct-URL nav via `authenticatedPage` — avoid the flaky `testProjectId` fixture, see `docs/LEARNINGS.md`.)
- [ ] **A10 — Run unit + the new E2E + typecheck + DS guard.** Screenshot the soggetto + synopsis menus for the recap. Commit.

**Slice A acceptance:** narrative-page actions are produced by the registry; menu contents + order unchanged; SIAE still IT-gated; unit + E2E green; no behaviour change visible to the user.

---

## SLICE B — Migrate dock pages into the registry

For **each** page below, one task: (1) add its segment + descriptors to `CONTEXT_ACTIONS`; (2) in the page, publish an `ActionsMenu` to the TopBar `actions` slot built from `useContextActions(segment, handlers)`; (3) remove the export/import affordance from its dock/custom toolbar; (4) E2E: action reachable from the TopBar menu, absent from the dock; (5) screenshot; (6) commit.

- [ ] **B1 — Screenplay** (`ScreenplayToolbar.tsx` + `ScreenplayEditor.tsx` / `ScreenplayEditorShell.tsx`): descriptors `export-pdf`, `export-fountain`, `import-fountain`, `import-pdf`, `versions`. Keep the import _file-picker_ mechanics; only the trigger moves to the TopBar menu. Remove the toolbar export/import cluster.
- [ ] **B2 — Budget** (`BudgetPage.tsx`): descriptor `export-csv` (and/or `export-pdf`) → opens `ExportBudgetModal`; remove the FloatingDock secondary "Esporta". Keep the dock's primary "Regenerate" for now (Slice C retires the dock).
- [ ] **B3 — Schedule** (`SchedulePage.tsx`): `export-csv` + a print/PDF action; remove FloatingDock "Export"/"Print".
- [ ] **B4 — Breakdown** (`BreakdownPage.tsx`): `export-csv`/export → `ExportBreakdownModal`; remove FloatingDock "Export" (keep ⌘E shortcut wired to the same handler).
- [ ] **B5 — Shooting plan** (`ShootingPlanPage.tsx`): export CSV + print → registry; remove the custom `ShootingPlanDock` export buttons.
- [ ] **B6 — Locations** (`LocationsPage.tsx`): export → registry; remove FloatingDock "Export".

**Slice B acceptance:** every page's export/import/versions is reachable from its TopBar actions menu; no export/import button remains in any dock/custom toolbar; per-page E2E green; gates green.

---

## SLICE C — Bell + account → TopBar; retire rail footer + docks

- [ ] **C1 — TopBar notifications + account zones.** Add `notifications` (bell, with unread dot) and `account` (avatar menu → user settings; gear → project settings) to the TopBar right zone (new slots or fixed shell-level elements in `TopBar.tsx`). Wire the bell to the existing `useBellOpener()` SplitDrawer; wire avatar/gear to the existing routes (split user-settings vs project-settings per BUGS N-22 — note this also closes N-22).
- [ ] **C2 — Remove the LeftRail account footer.** Drop the `account` prop usage in `LeftRail.tsx:801-809` + its wiring in `AppShell.tsx`. Update the rail tests.
- [ ] **C3 — Retire per-page docks.** Remove `FloatingDock` usage from budget/schedule/breakdown/locations and the custom `ShootingPlanDock`; move any remaining primary CTAs (e.g. "Regenerate") to the TopBar action set or a `<FloatingDock/>`-free home per Spec 55. Keep `BottomDock` (Cesare pill).
- [ ] **C4 — Update invariants.** Edit CLAUDE.md (the "bell/avatar/gear live in exactly one of BottomDock or Cesare header" rule) + Spec 44 to the new rule: bell + account live in the TopBar; rail has no account footer. Mark Spec 47b FIX 1 superseded.
- [ ] **C5 — E2E + screenshots:** bell + account reachable only from the TopBar; no rail AccountRow; notifications still open in the SplitDrawer; avatar→user settings, gear→project settings.

**Slice C acceptance:** matches Spec 55 "Invariant change" + closes N-01 (notifications), N-22 (avatar≠gear).

---

## SLICE D — Spec 56 enforcement (single-home + shell-zone)

- [ ] **D1 — Single-home action structural test.** New Playwright spec that visits every project route (reuse the `ROUTES` list from `tests/route-smoke.spec.ts`) and asserts: zero export/import/versions action controls render outside the TopBar action zone (no FloatingDock action buttons; no mid-page export menus). Assert the bell + account live only in the TopBar.
- [ ] **D2 — Wire into CI** alongside the existing route-smoke + DS-consistency guards. Update `docs/specs/56-continuous-qa-system.md` Phase 2 to mark single-home + shell-zone checks as shipped.

**Slice D acceptance:** a page that places an action outside the TopBar fails CI — this is how "everywhere" is guaranteed (Spec 55 §Systemic).

---

## Self-review notes

- **Spec coverage:** canonical zones (Slice C), one-home rule + registry (A+B), context-action registry feature-gated (A), invariant change (C4), acceptance/enforcement (D). All Spec 55 sections mapped.
- **`packages/domain` purity:** the registry is pure data + a pure resolver; handlers/DOM live in the web hook — preserves the no-browser-imports rule.
- **Flag reuse:** gating goes through `useFeature`/`resolveFeatures` only (no inline locale/market checks) — keeps the DS-consistency guard green.
- **Risk:** the `Popover`/`DropdownMenu` positioning is already collision-aware (Spec 57), so TopBar menus on narrow/peek layouts are safe.
- **Open confirmation for the executor:** does `packages/domain` have its own vitest runner? (survey suggested not) — if not, place `context-actions.test.ts` under `apps/web` importing `@oh-writers/domain`. Confirm `TranslationKey` import path + that `actions.*`/`action.*` label keys exist before adding.
