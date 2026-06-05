# Spec 58 — Settings pages polish (N-23, N-24)

Narrative Walk fleet · Agent A6. Two settings-area defects from the manual walk
(`docs/BUGS.md`).

## N-23 — Account settings page too narrow (MEDIO)

### Problem

`UserSettingsPage` renders inside a `max-width: 640px` single column. Every
section (Profile, Language, Password, Team) stacks in that one narrow lane, so
on a wide viewport the page reads as a cramped strip floating in whitespace
(walk img #19).

### Decision

Give the page a comfortable, container-driven layout:

- The page becomes an inline-size **container** (`container-type: inline-size`)
  with a generous outer measure (`--max-width-wide`, 1200px) instead of 640px.
- Sections lay out in a **two-column grid** at comfortable widths and collapse
  to a single column on narrow containers — driven by `@container`, not
  `@media`, per the CSS convention.
- The page header spans the full width above the grid.
- Each section keeps its own internal max measure so form fields never stretch
  into uncomfortably long line lengths (forms read best at ~`--max-width-content`).
- All sizing via tokens (`--max-width-*`, `--space-*`) + logical properties.
  No new magic px.

The page keeps the existing `--space-*` / `--color-*` / `--text-*` token
namespace it already uses (consistent with the file today); no churn to `--ds-*`.

### Done

- Account settings page uses a wide container (`--max-width-wide`) and a
  container-query two-column section grid that collapses to one column when the
  container is narrow.
- E2E asserts the page content box is comfortably wide on a wide viewport
  (well beyond the old 640px), and that the grid collapses on a narrow viewport.

## N-24 — Project icon affordance unclear (BASSO)

### Problem

The LeftRail project header (e.g. "Non fa ridere") renders a **chevron-down**
glyph — the universal "opens a menu" affordance — but clicking it just navigates
to the project home (`/projects/:id`). The glyph promises a menu; the behavior
is a plain link. Users can't tell what it opens (walk img #4).

### Decision (Notion-like default)

A chevron-down on a project title means a **project menu**. Make the rail project
header open a small menu (the DS `DropdownMenu`, react-aria backed) anchored to
the header, with clear destinations:

1. **Apri progetto** → project home (`/projects/:id`) — the old click target,
   now an explicit item.
2. **Impostazioni progetto** → project settings (`/projects/:id/settings`).
3. **Cambia progetto** → opens the project switcher / dashboard
   (`handleBrandClick`, the existing "all projects" affordance).

This makes the chevron honest and gives the user the obvious project actions in
one place — the Notion pattern (workspace/page title → dropdown of actions).

The `LeftRail.project` prop gains an optional `menuItems` list; when provided the
header renders as a `DropdownMenu` trigger instead of a bare button. When omitted
the header keeps its current single-action `onPress` behavior (backwards
compatible — the `LeftRail` unit tests that pass only `onPress` stay green).

### Done

- Clicking the rail project header opens a menu with Apri progetto /
  Impostazioni progetto / Cambia progetto, each navigating to its own route.
- The affordance is obvious (chevron-down now opens an actual menu).
- E2E asserts the menu opens and that "Impostazioni progetto" lands on
  `/projects/:id/settings`.

## i18n

New keys under `shell.projectMenu.*` (EN + IT) in `appShell.ts`:
`open`, `settings`, `switch`. EN/IT parity enforced by `keys.test.ts`.
