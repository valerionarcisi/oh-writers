# Spec 55 — Shell Action Standard (context-aware TopBar, one home per action)

Status: APPROVED (brainstorm 2026-06-03) — design first, implementation via plan.
Related: [Spec 44](44-shell-refactor-notion-style.md) (Cesare shell), [Spec 46](46-split-drawer.md) (SplitDrawer), [Spec 54](54-feature-flags.md) (feature gating). Enforced by [Spec 56](56-continuous-qa-system.md).

## Problem

Actions are scattered and placement is inconsistent: the screenplay export sits in a
mid-page toolbar menu, SIAE export hides inside the Soggetto actions menu, budget export
is its own modal, notifications live bottom-left in the rail. The user experience has no
single, predictable home for "what can I do here". This is the root of the "drawer brutti
/ azioni in giro / incoerenza" pain.

## The standard

### Canonical zones

- **TopBar (top-right action zone)** — the single home for:
  - **Global search** (lens, ⌘K)
  - **Context-aware actions** for the current page/feature (export, import, versions,
    and any per-feature primary actions)
  - **Notifications** (bell)
  - **Account / avatar** menu (profile, settings)
- **Left rail** — navigation (Sviluppo / Produzione / Recenti) + Cesare sessions ONLY.
  The footer AccountRow is removed; bell + account move to the TopBar.
- **Drawers** — unchanged inventory, now documented as canonical: Cesare = floating
  bottom-right (no routing); SplitDrawer = routed side-peek (`?peek=`). No third drawer
  pattern. `FloatingDock`/`BottomDock` per-page action bars are retired in favour of the
  TopBar action slot.

### Core rule — one home per action (DRY / orthogonality)

Every action type has exactly ONE canonical home: the context-aware TopBar slot for its
page. Scattered duplicates are **migrated and removed**, not left in place:

- Screenplay: export PDF/Fountain + import PDF/Fountain + versions → TopBar (remove the
  mid-page `ToolbarMenu` / `Esporta PDF ▾` cluster).
- Soggetto: DOCX + SIAE export → TopBar context actions (remove from the Altre-azioni menu).
- Budget / Schedule / Breakdown / Shooting plan: CSV/PDF exports → TopBar context actions
  (retire the per-page export buttons/modals).

### Context-action registry

A declarative map `route/feature → ordered action set`, resolved server-side and gated by
`useFeature`/`resolveFeatures` (Spec 54) so market/plan/locale gating still applies (e.g.
SIAE only in the IT market). The TopBar renders the registry; pages do not place their own
action bars. This is what makes actions "discriminated by page and feature".

### Invariant change

This supersedes the CLAUDE.md rule "bell/avatar/gear live in exactly one of BottomDock or
Cesare header". New rule: **bell + account live in the TopBar; the rail has no account
footer**. CLAUDE.md + Spec 44 are updated when this ships.

## Out of scope (for now)

- Redesigning individual action dialogs (only their placement/home changes).
- The cut-off "Ma an…" example the user deferred ("poi vediamo").

## Acceptance (coherence exit-conditions, enforced by Spec 56)

- Zero action buttons (export/import/versions) rendered outside the TopBar zone.
- Notifications + account reachable only from the TopBar; no rail AccountRow.
- One drawer inventory only (Cesare floating + SplitDrawer routed).
- The earlier rail tools→top-left fix (commit `ba59f05`) is reworked into the TopBar here.
