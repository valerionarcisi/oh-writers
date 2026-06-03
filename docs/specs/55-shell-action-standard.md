# Spec 55 — Shell Action Standard (context-aware TopBar, one home per action)

Status: APPROVED (brainstorm 2026-06-03) — design first, implementation via plan.
Plan: `docs/superpowers/plans/2026-06-03-spec55-topbar-action-standard.md` (slices A–D; A = backbone registry + TopBar zone).
Related: [Spec 44](44-shell-refactor-notion-style.md) (Cesare shell), [Spec 46](46-split-drawer.md) (SplitDrawer), [Spec 54](54-feature-flags.md) (feature gating). Enforced by [Spec 56](56-continuous-qa-system.md).

## Problem

Actions are scattered and placement is inconsistent: the screenplay export sits in a
mid-page toolbar menu, SIAE export hides inside the Soggetto actions menu, budget export
is its own modal, notifications live bottom-left in the rail. The user experience has no
single, predictable home for "what can I do here". This is the root of the "drawer brutti
/ azioni in giro / incoerenza" pain.

## Systemic — one pattern, app-wide (not per-page)

These issues are **shared-component** problems, not page bugs; the walk screenshots are
examples that reverberate across the whole app. The fix lives ONCE in the shell layer
(TopBar + a per-page action registry + shared drawer/chat/account components), and every
page consumes it — never patch a single page. Verification drives **every** narrative
page (soggetto, sinossi, scaletta, trattamento, screenplay, breakdown, budget, schedule,
locations), not only the screenshotted ones. Spec 56's single-home + shell-zone checks run
across ALL routes, so a non-compliant page fails CI — that is how "everywhere" is guaranteed.

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

## Implemented — narrative-surface backbone (A1, Narrative Walk)

Shipped the shell backbone + the NARRATIVE surface (soggetto/sinossi/scaletta/
trattamento). Production-page action registration (budget/breakdown/schedule/
locations) and screenplay export are deferred (N-28 / A5).

- **Context-action registry (the backbone).** `packages/domain/src/actions/context-actions.ts`
  — a pure, framework-agnostic declarative map `segment → ordered descriptors`
  (`{ id, labelKey, feature?, order }`) + `resolveContextActions(segment, enabledFeatures)`.
  The web binding `apps/web/app/features/app-shell/use-context-actions.ts`
  (`useContextActions(segment, handlers)`) resolves it, feature-gates via
  `useFeatures()` (Spec 54), translates label keys, and drops descriptors the page
  did not wire — returning `DropdownMenuItem[]` for the TopBar `ActionsMenu`.
  Downstream lanes register descriptors here + wire handlers; they never reinvent
  TopBar placement.
- **Narrative actions through the registry** (N-02/N-03): soggetto (DOCX, SIAE
  IT-gated, Versioni) and synopsis/outline/treatment (PDF, Versioni) now build
  their TopBar menu from `useContextActions`. SIAE gating moved out of an inline
  `useFeature` call into the registry.
- **TopBar account zone** (N-01/N-22): `packages/ui/src/shell/TopBar/TopBarAccount.tsx`
  hosts bell + avatar + gear in the TopBar right zone (the single home). The
  LeftRail footer `AccountRow` is no longer rendered by the shell (the `account`
  prop is dropped). Avatar → `/settings` (user), gear → `/projects/:id/settings`
  (project) — distinct destinations. The bell opens the notifications SplitDrawer
  (unchanged transport).
- **Cesare starts closed** (N-05): `readPersistedCesare()` always returns
  `closed`; the persisted state is never acted on at mount, so Cesare never
  auto-opens.
- **No redundant wordmark** (N-21): with no project selected, `_app.tsx` leaves
  `projectName` empty (was `"Oh Writers"`), so no project row renders and the
  brand wordmark is hidden (`LeftRail` `brand.showLabel`); the "O" mark stands
  alone.
- **Tests.** Unit: `packages/domain/src/actions/context-actions.test.ts`.
  E2E: `tests/shell/spec55-shell-backbone.spec.ts` (N-01..N-05, N-21, N-22);
  legacy `tests/shell-dock.spec.ts` + `tests/cesare-header-minimal.spec.ts`
  updated to the TopBar account home (and made hydration-robust). N-02 rollback
  path stays covered by `tests/versions-splitdrawer.spec.ts`.
- **Deferred / not done here.** The legacy `VersionsDrawer` context (`~/features/versions`)
  stays mounted in `AppShell` because screenplay/budget/breakdown still consume
  it (out of scope; A5 + N-28). The narrative surface itself uses only the routed
  `?versions=` SplitDrawer. Spec 56 single-home enforcement (Slice D) and the
  dock-page migration (Slice B) are separate fronts.
