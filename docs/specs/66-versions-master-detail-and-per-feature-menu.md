# Spec 66 — Versions master→detail (unified) + per-feature action menu

Status: **Built** (2026-06-06). Supersedes the diff modes of Spec 49. See
ADR-0004, ADR-0002, ADR-0003. Glossary: CONTEXT.md _Version_, _Versions surface_,
_Per-feature action menu_.

## What shipped (vs the plan below)

- **Phase 1** migration `0037` adds `draft_color`/`draft_date` to `document_versions`.
- **Phase 2/3**: shared `VersionView` + mappers; the canonical narrative versions
  server already had switch/duplicate/rename/delete/save — only `updateVersionMeta`
  (colour/date) was new. The duplicate `features/versions` {hook,server,schema,errors}
  was retired (one live importer repointed).
- **Phase 4**: master→detail `VersionsSplitDrawer` (editor-agnostic via a
  `renderContent` render-prop); `?compare=` removed end-to-end (drawer, lane,
  AppShell, `_app.tsx`, versions-peek).
- **Phase 5**: the screenplay joined the unified surface via a `?vkind=screenplay`
  companion + per-kind lane branch (`ReadOnlyScreenplayView`); **Attiva = restore**;
  old `/screenplay/versions/$vId` route redirects.
- **Phase 6**: a TopBar `[● Versioni]` chip in a dedicated `versionSelector` slot
  (stable entry point, independent of the `⋯` menu).
- **Phase 7**: the chip + `⋯` menu were already universal across narrative routes
  (NarrativeEditor publishes both); grouped them into one "page actions" cluster
  left of the account zone (Notion-style, near the gear).
- **Phase 8**: OHW-066 E2E + a real bug fix — the "current" badge read the static
  `?vcur=` URL hint and didn't move after Attiva; now it reads the document's LIVE
  `currentVersionId` (`getCurrentVersionId` server fn).

Known follow-ups: logline has no per-page export menu yet; long version lists
(67+ on a heavily-edited doc) render in a scroll, no grouping yet; the duplicate
`features/versions` server's old route file removal; screenplay "current" semantics
(restore copies content, no pointer) keep the URL hint.

## Why

Two gaps:

1. **Versions** today is a list + side-by-side diff (`VersionsSplitDrawer`,
   "vs current" + "Confronta due"). The diff is programmer language for a
   writer/director/producer audience. And the screenplay carries a _separate_,
   richer inline `VersionsPanel`. Writers meet two models for "my history".
2. **Per-feature tools were unmounted.** `useContextActions` (export/import + page
   tools) is mounted only on Soggetto + screenplay; Sinossi/Trattamento/Logline/
   Outline/Synopsis/Treatment lost their tooling. There is no top-right contextual
   menu.

## Decisions (from the grill)

- **Scope:** narrative + screenplay **unified** into one master→detail Versions
  surface.
- **Drawer actions:** detail pane = read-only content + **Attiva** + **Indietro**,
  plus full meta ported to narrative: rename, duplicate, delete, **draft-colour
  dot**, draft date, and a header **"+ Nuova versione"**.
- **Data model:** **two tables, one UI contract** (ADR-0004). `document_versions`
  gains `draftColor` + `draftDate`. `screenplay_versions` untouched. Shared
  `VersionView` + two server adapters → one drawer. `pageCount` is screenplay-only.
- **Attiva = restore** for screenplay too; the old screenplay restore route is
  superseded (redirect, then remove in a follow-up).
- **TopBar:** `[● v3]` chip shows the current version, click opens the surface. No
  create from the TopBar. (Colour dot prefixes the label.)
- **No diff anywhere:** remove the `?compare=` param, the segmented control, the
  side-by-side table, and the `buildSideBySideDiff` usage in this surface.
- **Per-feature menu:** a **Notion-style popover anchored top-right near the gear**
  holding the page's contextual export/import/tools, resolved from the shared
  action registry, feature-flag gated. Mounted on **all** narrative routes.

## Domain & files

Owned by `features/versions` (drawer + shared contract), `features/documents`
(narrative adapter + schema/migration), `features/screenplay-editor` (screenplay
adapter), `features/app-shell` (TopBar chip + per-feature menu host).

### A. Shared version contract + drawer (master→detail)

- New shared `VersionView` (UI contract): `id, number, label, createdAt, content,
draftColor, draftDate, pageCount?`. Lives where both editors can consume it
  without crossing the browser/editor import ban (likely `packages/domain` for the
  type, content stays a string at the contract boundary).
- Rewrite `VersionsSplitDrawer.tsx` → master→detail:
  - Left: version list, each row a **draft-colour dot** + label/`v{n}` + date +
    "current" badge.
  - Click → right pane renders the version's **content read-only, formatted like
    the editor** (reuse the narrative render / screenplay read-only view per
    adapter) + header actions: rename · duplicate · delete · colour · draft-date ·
    **Attiva** · **Indietro**.
  - Header: **"+ Nuova versione"** (manual create).
  - **Delete** the `CompareMode` segmented control, `picks`/`togglePick`,
    `orderPair`, `buildSideBySideDiff`, `DiffRowView`, `CompareDetail`, the
    `?compare=` plumbing (`onCompareChange`, `VersionsCompare`), and the diff CSS.
- The surface is fed by an adapter chosen by document kind (narrative vs
  screenplay), each a `createServerFn` read returning `VersionView[]`.

### B. Data model

- Migration: `document_versions += draftColor (nullable), draftDate (nullable)`.
  Reuse `DraftRevisionColor` from `packages/domain` (same enum the screenplay uses).
- New narrative version mutations (server fns, mirror screenplay's
  `useRenameVersion`/`useDuplicateVersion`/`useDeleteVersion`/`useUpdateVersionMeta`):
  rename, duplicate, delete, set colour, set draft date, **create manual version**.
  Narrative **Attiva** reuses existing `useSwitchToVersion`.
- Screenplay **Attiva** = restore: wire the existing restore logic behind the
  drawer's Attiva; redirect the old `_app.projects.$id_.screenplay.versions.$vId`
  restore route (removal is a follow-up, not this spec).

### C. TopBar version chip

- `[● v3]` in a TopBar action slot (left of the account zone, "near the lens",
  Spec 55), colour dot = current version's `draftColor`. Click → opens the Versions
  surface (`?versions=<documentId>` routing already exists — reuse `VersionsSplitLane`
  / `versions-peek.ts`).
- The current version id/number is reported per page (Spec 63 `reportCurrentVersion`
  groundwork) so the chip is correct on every narrative + screenplay route.

### D. Per-feature action menu (Notion popover, top-right near gear)

- One overflow popover (`•••` / "Strumenti") next to the gear in `TopBarAccount`'s
  zone, opening a `Popover` (collision-aware, Spec 57) with the page's contextual
  items from `resolveContextActions(page, features)`.
- Mount `useContextActions` on **all** narrative routes (today Soggetto only):
  sinossi, trattamento, logline, outline, synopsis, treatment.
- Restore per-page entries into each page's action set: **export/import**
  (PDF/DOCX/SIAE/Fountain/CSV per the registry, flag-gated), **SIAE metadata +
  author fields** where applicable, **margin notes / narrative-polish** affordances.
- Generalise the existing Soggetto export wiring into this menu — do not leave it
  Soggetto-special.

## Out of scope / follow-ups

- Collapsing the two version tables into one (ADR-0004 keeps them split).
- Deleting (vs redirecting) the old screenplay restore route.
- ICEBOX N-28 production pages (budget/breakdown/schedule/locations) per-page
  registration — separate front.

## Tests (OHW-066)

E2E first (`tests/`), per Definition of Done. Happy + sad paths.

- `tests/versions-master-detail.spec.ts`
  - list renders with colour dots + current badge (narrative & screenplay).
  - click a version → read-only formatted content in detail; **Indietro** returns.
  - **Attiva** narrative → switches active version (current badge moves).
  - **Attiva** screenplay → restores (content becomes current).
  - rename / duplicate / delete / set-colour / set-draft-date persist and reflect.
  - **"+ Nuova versione"** creates a manual version.
  - sad: load error (forbidden / not found) shows the alert, no crash.
  - regression: **no** segmented control, **no** `?compare=`, **no** diff table.
- `tests/versions-topbar-chip.spec.ts`
  - `[● v{n}]` shows current version + colour on each narrative + screenplay route;
    click opens the surface (`?versions=`).
- `tests/per-feature-action-menu.spec.ts`
  - top-right popover near gear opens; contains the page's contextual actions;
    differs Soggetto vs Sinossi vs screenplay; flag-OFF actions hidden.
  - export action triggers the export (PDF/DOCX/SIAE smoke); import where present.
- Unit: narrative version mutations (rename/dup/delete/meta/create) +
  `VersionView` adapter mapping (Vitest).
- Migration verified by `db:build` / `test-migrate`.

## Definition of Done

Tests at every layer green · screenshots of the master→detail surface (narrative +
screenplay), the TopBar chip, and the per-feature popover in a final recap ·
BACKLOG.md updated · ADR-0004 + CONTEXT.md committed.
