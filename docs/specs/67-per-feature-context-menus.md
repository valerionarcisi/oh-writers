# Spec 67 — Per-feature contextual `⋯` menus (export/import/versions everywhere)

Status: **Planned** (2026-06-06). Builds on Spec 55 (action registry) + Spec 66
(routed Versions surface). Closes BACKLOG ICEBOX **N-28**. Glossary: CONTEXT.md
_Per-feature action menu_.

## Why

The TopBar `⋯` "page actions" menu (export/import/versions, resolved per page from
the shared registry) is wired on the **narrative docs + screenplay** only. The
**production pages** (breakdown, budget, schedule, locations) still expose their
own ad-hoc export modals + a legacy floating `VersionsDrawer` (`useVersionsDrawer`),
so:

- export is reached via per-page buttons, not the standard `⋯` menu;
- versions open the OLD floating drawer + `VersionCompareModal` (the two-version
  diff Spec 66 / ADR-0004 retired from the routed surface) — the partial-retirement
  gap the Lead judge flagged;
- `logline` has no registry entry at all (no `⋯`).

This spec makes the `⋯` menu **uniform across every page**: one registry, one menu,
export from the existing backends, versions via the Spec 66 routed surface, the
legacy floating drawer retired.

## What exists (no new export backend needed)

Every feature already ships an export `createServerFn`:

| Page                           | Export server fns                          | Import                |
| ------------------------------ | ------------------------------------------ | --------------------- |
| synopsis / outline / treatment | narrative PDF (`exportNarrativePdf`)       | —                     |
| soggetto                       | DOCX, SIAE (`siaeExport` flag)             | —                     |
| screenplay                     | PDF, Fountain                              | PDF, Fountain (exist) |
| breakdown                      | `exportBreakdownPdf`, `exportBreakdownCsv` | —                     |
| budget                         | `exportBudgetCsv`, `exportBudgetPdf`       | —                     |
| schedule                       | `exportScheduleCsv`, `exportSchedulePdf`   | —                     |
| locations                      | `exportLocationsCsv`                       | —                     |
| logline                        | — (it is a field, not a document)          | —                     |

So this spec is **wiring, not new export backends**. Imports: only the screenplay
has a real file-import backend today. **No new import backend is built here** —
"import where it makes sense" is deferred to a follow-up (no production page has an
import server fn, and inventing one — e.g. breakdown-from-CSV — is its own feature).

## Decisions

1. **Registry** (`packages/domain/src/actions/context-actions.ts`): add entries for
   `breakdown`, `budget`, `schedule`, `locations` (their export ids) + `logline`
   (Versions only). Add the new `ContextActionId`s the production exports need
   (`EXPORT_CSV` exists; PDF/CSV per page). Each export action is feature-flag
   aware where relevant.
2. **Handlers**: each production page wires its `ContextActionHandlers`
   (`useContextActions(segment, handlers)`) to open its existing export modal /
   call its export hook, and publishes the result as `topBarActions` — exactly the
   Soggetto/NarrativeEditor pattern. The ad-hoc per-page export buttons are removed
   in favour of the `⋯` menu.
3. **Versions**: production pages open the **Spec 66 routed surface**
   (`?versions=<id>&vkind=…`) instead of `useVersionsDrawer`. Breakdown/budget/
   schedule/locations version a screenplay-derived artefact, so they use
   `vkind=screenplay` against the screenplay id (their versions are the screenplay's),
   OR — if a page has its own versioned entity — its own id. (Confirm per page
   during implementation; flag if a page's "versions" don't map to an existing
   routed kind — that page keeps Versions out of the menu rather than shipping a
   broken entry.)
4. **Retire the legacy floating drawer**: once no page calls `useVersionsDrawer`,
   delete `VersionsDrawer`, `VersionCompareModal`, the legacy `VersionsList`, and
   the `VersionsDrawerProvider` from the shell — completing the Spec 66/ADR-0004
   retirement (N-28). Update ADR-0004 to drop the "partial" caveat.
5. **logline**: `⋯` shows **Versioni** only (it has no dedicated export; it is a
   field surfaced on the Soggetto). If logline has no routed versioned entity,
   it gets no `⋯` (decide during impl — don't ship a dead entry).

## Out of scope / follow-ups

- New import backends (breakdown-from-CSV, budget import, …) — own feature.
- New export formats beyond what each backend already produces.
- DOCX for synopsis/outline/treatment (only soggetto has DOCX today).

## Tests (OHW-067)

E2E first, per Definition of Done. One spec `tests/per-feature-context-menu.spec.ts`:

- On each page (soggetto, synopsis, treatment, breakdown, budget, schedule,
  locations, screenplay) the `⋯` menu opens and contains the EXPECTED export items
  for that page (table above) — and `Versioni` where the page has a routed version
  entity.
- An export action triggers the export (smoke: the export server fn is hit / a
  download starts) for at least one production page (budget CSV).
- Versions opens the **routed** surface (`?versions=`), not the legacy drawer
  (regression: `versions-drawer` testid absent).
- Feature-gated items (SIAE) hidden in the EN market.
- Unit: `resolveContextActions` returns the right ids per new segment + flag gating.

## Definition of Done

`⋯` uniform on every page · legacy `VersionsDrawer`/`VersionCompareModal` deleted ·
ADR-0004 "partial" caveat removed · tests green · screenshots of the `⋯` menu on
the production pages in a recap · BACKLOG N-28 → DONE.
