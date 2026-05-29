# Spec 45 — Spec 44 Follow-ups

## Context

Spec 44 (shell refactor — Notion-style Cesare + Canva left rail + SplitDrawer) shipped in `refactor/ux-notion-v3-iter-2-merged` after 2 lead-validation iterations. The lead loop accepted a pragmatic gate (zero user-impacting blockers + zero majors). The 14 follow-up tickets below were deferred — they are polish, dedup, test coverage, and one contract refinement. None block daily use.

This spec lives as a backlog. Each ticket can be picked up independently; many are 1-2 hours. Group them in a single sprint when a polish pass is scheduled, or pick them off as opportunistic side fixes.

Source: `docs/specs/44-final-verdict.md` "Follow-up tickets" table.

## Tickets

### FU-44-01 · Deduplicate `ChangeTrace` ⇄ `CollapsibleNote` (minor · Software Engineer)

Ousterhout deep-modules: both primitives expose a similar collapsible-header + body pattern. `ChangeTrace` adds steps, updates, and accept/reject actions on top. Either fold `ChangeTrace` into `CollapsibleNote` via composition, or extract a shared `<CollapsiblePanel/>` primitive that both consume.

- Touches: `packages/ui/src/composites/ChangeTrace/`, `packages/ui/src/composites/CollapsibleNote/`
- Risk: low — both have full Vitest coverage to catch regressions
- Estimate: 2-3h

### FU-44-02 · Reuse `CesarePage` domain type in `ChangeTrace.kind` (minor · Software Engineer)

`ChangeTrace.kind` defines its own union (`'page' | 'doc' | 'scene' | 'breakdown' | 'budget' | 'schedule' | 'location'`) which overlaps with `@oh-writers/domain`'s `DocumentType` and `CesarePage`. Reuse the existing types to keep the domain single-source-of-truth.

- Touches: `packages/ui/src/composites/ChangeTrace/ChangeTrace.tsx`, `packages/domain/`
- Risk: low
- Estimate: 1h

### FU-44-03 · Focus toggle button label is misleading (minor · Software Engineer)

The current Focus button label says "Focus" but the click handler never reaches the `focus` shell state — it only cycles `full ↔ collapsed`. Either wire the button to true Focus (`⌃⌥F` already does), or rename the label to "Compatta" to reflect what it actually does. Per the spec contract, the button should reach Focus.

- Touches: `apps/web/app/features/app-shell/components/AppShell.tsx`, top-strip chevron component
- Risk: low
- Estimate: 30min
- Related: **FU-44-08** (major) — they share root cause

### FU-44-04 · `useRailOverlay` missing teardown on AppShell unmount (minor · Software Engineer)

The overlay hook attaches a body data-attribute and an outside-click listener; on AppShell unmount (e.g. SSR hydration mismatch, route blowing up) the attribute can stick. Add a `useEffect` cleanup that removes both on unmount.

- Touches: `packages/ui/src/shell/LeftRail/use-rail-overlay.ts`
- Risk: very low
- Estimate: 30min

### FU-44-05 · Breadcrumb clipped by `«` chevron padding (minor · Software Engineer)

When the LeftRail is in overlay mode and the `«` close button renders, the parent grid clips the breadcrumb on long project titles. Adjust the chevron column to `min-content` and add `padding-inline-end` to the breadcrumb cell.

- Touches: `packages/ui/src/shell/LeftRail/LeftRail.module.css`
- Risk: low
- Estimate: 1h

### FU-44-06 · `cmd+\` captured by editor focus (minor · Software Engineer)

When focus is inside the Monaco editor (Sceneggiatura) or a contentEditable (Soggetto), `⌘\` is swallowed by the editor and the rail toggle never fires. Re-route the shortcut through `useHotkeys` (or a higher-priority capture-phase listener on `document`).

- Touches: `apps/web/app/features/app-shell/components/AppShell.tsx`
- Risk: medium — editor keybindings overlap
- Estimate: 2h

### FU-44-07 · LeftRail project label collapses to `…` (minor · Software Engineer)

TKT-LEAD-07 from the original lead-watcher report — intermittent. Project name gets truncated to `…` on certain viewports even when there's room. Likely caused by a flex parent with no `min-width: 0` chain. Reproduce on 1280×800 + 1440×900 and apply the `min-width: 0` fix where needed.

- Touches: `packages/ui/src/shell/LeftRail/LeftRail.module.css`
- Risk: low
- Estimate: 1h

### FU-44-08 · True Focus mode not shipped (**major** · Product Owner)

**Spec 44 contract says**: `focus` state hides rail + topstrip + dock entirely. Currently the toggle cycles only `full ↔ collapsed`. `⌃⌥F` reaches `focus` in state, but the visual outcome is the same as `collapsed`. Either:

1. Implement true Focus: when `data-shell="focus"`, hide ALL chrome — only the editor visible. Bottom-right Cesare pill optional.
2. Drop the third state from the contract and document `focus` as an alias of `collapsed`.

Option 1 honours the original spec; option 2 simplifies but reduces feature.

- Touches: `apps/web/app/features/app-shell/components/AppShell.module.css`, `packages/ui/src/shell/{TopBar,BottomDock,LeftRail}/*.module.css`, spec 44 glossary
- Risk: medium — requires CSS gate audit on every shell component
- Estimate: 4h
- **This is the only deferred major. Prioritise.**

### FU-44-09 · Remove `test.skip` in `tests/shell-dock.spec.ts:79` (minor · QA)

The bell-from-Cesare-header test was skipped at WP-D delivery because dockIcons weren't wired. WP-CLEANUP fixed dockIcons. Remove the skip + verify the test passes.

- Touches: `apps/web/tests/e2e/shell-dock.spec.ts`
- Risk: very low
- Estimate: 15min

### FU-44-10 · Playwright regression "FloatingDock anchor bottom-left across 10 views" (minor · QA)

Add a Playwright spec that opens each production view (Sceneggiatura, Breakdown, Budget, Locations, Schedule, Inquadrature, NarrativeEditor logline + body) and asserts the FloatingDock's `data-position="bottom-left"` is honoured + does not overlap BottomDock. Guards TKT-LEAD-01 from regressing.

- Touches: `apps/web/tests/e2e/floatingdock-anchor.spec.ts` (new)
- Risk: low
- Estimate: 1h

### FU-44-11 · Playwright regression "prose column min-width 480px on Soggetto" (minor · QA)

Add a Playwright spec that paste a long paragraph into Soggetto and asserts no word-break per character. Guards TKT-LEAD-03 from regressing.

- Touches: `apps/web/tests/e2e/soggetto-prose-width.spec.ts` (new)
- Risk: low
- Estimate: 1h

### FU-44-12 · `CLAUDE.md` Never-do — per-page FloatingDock anchor rule (cosmetic · Tech Writer)

Add to the "Never Do" list: "Never anchor a per-page FloatingDock at bottom-right — that anchor belongs to the shell-level BottomDock. Page-scoped action bars use bottom-left or migrate to the TopBar action slot."

- Touches: `CLAUDE.md`
- Risk: none
- Estimate: 10min

### FU-44-13 · `docs/conventions/css.md` "Prose column lanes" section (cosmetic · Tech Writer)

Document the `min-width: 0` + `container-type: inline-size` rule that bit us on TKT-LEAD-03. Two paragraphs + a code example. Adds a CSS convention that prevents the same class of bug in future writing pages.

- Touches: `docs/conventions/css.md`
- Risk: none
- Estimate: 30min

### FU-44-14 · Dashboard filter row stack (TKT-LEAD-06) (minor · Product Owner)

Verify on `/dashboard` at 1280px viewport whether the project-filter tabs stack vertically (lead-watcher reported it as a major; iter-2 deferred as unverified). Fix layout if confirmed.

- Touches: dashboard component CSS
- Risk: low — local CSS adjustment
- Estimate: 1h

## Suggested order

1. **FU-44-08** — only major, do first
2. **FU-44-04, 06** — small risk reducers
3. **FU-44-09, 10, 11** — test coverage block (gate against regressions)
4. **FU-44-01, 02** — primitive dedup pass
5. **FU-44-03, 05, 07, 14** — UI polish round
6. **FU-44-12, 13** — doc updates last

## Out of scope

These were spotted during Spec 44 work but belong elsewhere:

- **TKT-LEAD-09** (Italian URL slugs 404) — i18n / routing, separate spec
- **TKT-LEAD-10** (Locations toolbar overlap with Leaflet) — map/library layering, separate spec
- Per-page action bar migration into TopBar slots — broader refactor, separate spec when the shell action slot pattern matures
