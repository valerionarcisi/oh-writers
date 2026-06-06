# 4. Versions surface is master→detail, not a side-by-side diff

Date: 2026-06-06

## Status

Accepted. Refines ADR-0002 (SplitDrawer is the only drawer). Supersedes the
"vs current" + "Confronta due versioni" diff modes shipped in Spec 49.

## Context

The Versions surface (in the SplitDrawer) shipped with two diff modes: a default
"vs current" two-column word-level diff and a "Confronta" pick-two side-by-side,
deep-linked via `?compare=a,b`. ADR-0003 already established that a word-by-word
green/red diff _in the editor_ is programmer language for a writer/director/producer
audience. The same reasoning was never applied to the Versions surface, which kept a
two-column diff as its primary view.

Separately, the screenplay and the narrative documents carried two divergent version
UIs: the screenplay an inline `VersionsPanel` with rich meta (rename, duplicate,
delete, draft colour, draft date, page count) and a _separate_ restore route; the
narrative docs a read-only list + the diff. A writer moving between a Soggetto and a
screenplay met two different mental models for "my history".

## Decision

The Versions surface is **master→detail**, for every document, in one shared
SplitDrawer-hosted component:

- **List → click a version → its full content, formatted and read-only**, with
  **Attiva** and **Indietro**. No two-column diff. No "compare two" mode.
- **Attiva is the single verb** for making a version current: switch (narrative) or
  restore (screenplay). The screenplay's separate restore route is superseded.
- Per-version meta — label, **draft-colour dot** (stable identifier), draft date,
  rename, duplicate, delete, manual "Nuova versione" — is **ported to narrative
  versions** so both stacks share one UI contract.
- Storage stays **two tables**, not one: `document_versions` gains `draftColor` +
  `draftDate`; `screenplay_versions` is untouched. A shared `VersionView` contract
  and two thin server adapters feed the one drawer. (`pageCount` is screenplay-only
  and stays absent from narrative — it is not forced into a shared row.)
- The **current version shows in the TopBar** (`● v3`) and is the single click
  entry point to the surface.

The `?compare=` param, the segmented "vs current / Confronta" control, and the
side-by-side diff table are removed.

## Consequences

- The reader's task becomes "read an old version, then bring it back" rather than
  "scan a coloured diff" — matched to the audience.
- One mental model across narrative and screenplay history.
- Additive migration on `document_versions`; no change to screenplay storage keeps
  the existing screenplay diff/versions routes low-risk.
- Storage is **not** unified into one table: chosen for reversibility — collapsing
  two live tables is a heavy, hard-to-undo migration, and `pageCount` would leak the
  screenplay's concept into narrative rows. A shared _interface_ delivers the
  unification the user can see; shared _storage_ was judged unnecessary cost.
- Lost on the routed surface: the deep-linkable two-version compare. If a genuine
  "compare two" need resurfaces it returns as a deliberate, separate affordance —
  not the default.
- **The retirement is complete (Spec 67).** The legacy floating `VersionsDrawer`,
  its `VersionCompareModal` (the two-version diff), the old `VersionsList`, the
  `VersionsDrawerProvider`, and the `vs-current-baseline` diff helper are deleted.
  The production pages (breakdown, budget, schedule, locations) no longer surface
  versions at all — from the breakdown onward everything works against the **active**
  screenplay version, so "versions" is a narrative/screenplay concept only.
- ADR-0003's no-diff-in-editor principle and this no-diff-in-versions decision now
  hold product-wide: there is no word-level diff anywhere.
