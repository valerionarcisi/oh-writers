# Spec 12d — DS-v2 Primitives Unification

> Status: draft · Date: 2026-05-15 · Owner: Valerio
> Extends: [12 — Design System v2 Ambient](./12-design-system-v2-ambient.md)

Polish pass on the post-DS-v2 surface. Goal: kill visual drift across pages by
turning seven recurring patterns into one set of DS primitives, used everywhere
they recur. Output of a manual UX audit (15 May 2026) — see brainstorm thread
in conversation notes.

---

## 1. Problems we are fixing

Drifts observed across `Synopsis`, `Soggetto`, `Outline`, `Treatment`,
`Screenplay`, `Breakdown`, `Schedule`:

1. **Stats footers** drift. `Synopsis` shows `"711 characters · ~1 page"`,
   `Soggetto` shows `"1 cartella · 1123 caratteri"`, `Screenplay` shows
   nothing. Three implementations, three positions, three font sizes.
2. **Modals drift**. Seven modal files (`ExportPdfModal`, `ExportSiaeModal`,
   `VersionCompareModal`, `SceneNumberConflictModal`, `ExportScreenplayPdfModal`,
   `ExportBreakdownModal`, `AddElementModal`) ship their own `.module.css`.
   `ExportSiaeModal` has a cream background, the others are white. Headers,
   paddings and footer button alignment are all subtly different.
3. **Button radius drift**. Pill (`--radius-full`) and rounded
   (`--radius-md`) buttons appear interchangeably without a rule. There is no
   shared decision matrix; designers pick by feel.
4. **Version triggers drift**. The "Versioni" affordance lives in
   `ScreenplayToolbar`, `ToolbarMenu`, `NarrativeEditor`, `AppShell`,
   `VersionsPanel`, and as a pill on `Schedule`. Five visually different
   triggers, all opening the same `VersionsDrawer`.
5. **Logline font drift**. `Soggetto.tsx` renders `Logline` in sans while the
   body of the same document is serif. Same card, two type systems.
6. **Right side of Viewbar drift**. Every section invents its own combination
   of filter chip + version pill. Schedule has the cleanest pattern
   (`Tutte le giornate ▾  v3 · 14 mag 2026 ▾`), Breakdown has
   `Indice 1/10 ▾  v3 · 14 mag 2026 ▾`, Screenplay has
   `Indice 1/10 ▾  v3 · 14 mag 2026 ▾` styled differently.

## 2. Scope (in)

- **New primitive `DocStats`** (`packages/ui/src/primitives/DocStats/`).
- **New primitive `Modal`** (`packages/ui/src/primitives/Modal/`).
- **New primitive `VersionTrigger`** (`packages/ui/src/primitives/VersionTrigger/`)
  with two visual forms: `variant="pill"` (Viewbar) and `variant="ghost"`
  (FloatingDock).
- **Pill-vs-rounded button rule** documented and enforced.
- **Migrate** all stats footers, modals, version triggers, Logline font and
  Viewbar right slots to the new primitives.

## 3. Scope (out)

- No new features. No new server functions. No DB changes.
- Right-panel of Breakdown (`Categorie` + `Cesare` tabs, the `+` no-ops,
  `SCENA 1 · INT/EXT…` sub-header) is out of scope here — that lives in spec
  **12e (Breakdown right-panel redesign)**.
- Table/matrix restyle of Breakdown is out of scope — spec **12f**.

## 4. Primitives

### 4.1 `DocStats`

A small inline status block, anchored bottom-left of the page. Replaces every
ad-hoc footer.

```tsx
type DocStat =
  | { kind: "chars"; value: number }
  | { kind: "words"; value: number }
  | { kind: "pages"; value: number; approx?: boolean }
  | { kind: "cartelle"; value: number }
  | { kind: "scenes"; value: number };

type DocStatsProps = {
  stats: ReadonlyArray<DocStat>;
  className?: string;
};
```

- Rendered as `<dl>` with `display:flex; gap:var(--space-3)`.
- Each stat is a `<div>` with value (large, `--ds-text-sm`) and label
  (small-caps, `--ds-text-xs`, color `--ds-fg-mute`).
- Italian labels: `caratteri`, `parole`, `pagine`, `cartelle`, `scene`.
- `approx` → prefix `~`.
- Positioning is the caller's responsibility (DocStats is layout-agnostic).
  Convention: inside the page layout, before the FloatingDock.

### 4.2 `Modal`

Single dialog primitive. Replaces every per-feature modal CSS.

```tsx
type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;        // optional sub-title
  size?: "sm" | "md" | "lg";   // default "md"
  children: ReactNode;          // body
  footer?: ReactNode;           // footer slot, right-aligned by default
  initialFocusRef?: RefObject<HTMLElement>;
};
```

- Implemented with native `<dialog>` and `showModal()` (same pattern as
  `CommandPalette`).
- Always white background `var(--ds-surface-1)`, `--radius-lg`, `--shadow-4`.
- Header: `--ds-text-lg`, weight 600. Optional description below in
  `--ds-text-sm`, `--ds-fg-mute`.
- Body padding: `--space-5`.
- Footer: flex row, `gap: var(--space-2)`, right-aligned. Caller passes the
  buttons. Convention: ghost cancel on the left, primary CTA on the right.
- Backdrop: `oklch(0% 0 0 / 0.35)`, fade respects `prefers-reduced-motion`.
- Esc closes. Click outside closes. Focus trap inside.
- Sizes: `sm 360px / md 480px / lg 640px` max-inline-size.

### 4.3 `VersionTrigger`

A single component, two visual variants.

```tsx
type VersionTriggerProps = {
  label?: string;       // default "Versioni"
  versionLabel?: string;// e.g. "v3 · 14 mag 2026"
  variant?: "pill" | "ghost"; // default "ghost"
  onClick: () => void;
};
```

- `variant="pill"` → for use in Viewbar right slot. Renders the
  `versionLabel` directly with a trailing chevron. `--radius-full`.
- `variant="ghost"` → for use in FloatingDock. Renders the static `label`
  ("Versioni") with no chevron. `--radius-md`.
- Both call the same `onClick`, which the caller wires to
  `useVersionsDrawer().open()`.

The `VersionsDrawer` itself is unchanged.

## 5. Pill-vs-rounded rule

Documented in this spec, encoded as ESLint convention via comment in
`packages/ui/src/primitives/Button/Button.tsx`.

| Form | Token | Use case |
|---|---|---|
| **Pill** | `--radius-full` | Primary CTA in modals/docks (`Esporta PDF`, `Genera PDF`, `Ri-spogliare con AI`), live status badges (`● Cesare 6`, `● Salvato`) |
| **Rounded** | `--radius-md` | Everything else: secondary buttons, ghost actions, chips, tabs, form fields, popover items, FloatingDock secondary slots |

Concretely:
- The two buttons inside a modal footer are **both rounded**.
- The "Aggiusta" / "Versioni" / "Esporta SIAE" in document FloatingDocks are
  **rounded** (not pill).
- The single primary CTA in those docks (`Esporta PDF`/`Esporta DOCX`) stays
  **pill**.

## 6. Viewbar right-slot pattern

Standardised across every page:

```
[FILTER ▾]   [VERSION PILL ▾]
```

- `FILTER`: page-specific. Screenplay/Breakdown → `Indice 1/10 ▾`. Schedule →
  `Tutte le giornate ▾`. Doc pages → omitted.
- `VERSION PILL`: `<VersionTrigger variant="pill" versionLabel="…" />` —
  identical across all pages.
- The "Versioni" entry currently in some FloatingDocks is **removed** from
  the dock when the page has a Viewbar (i.e. everywhere except modals).
  Doc pages without a Viewbar keep the ghost "Versioni" in the dock.

## 7. Migration list

| File | Change |
|---|---|
| `features/documents/components/ExportPdfModal.tsx` | Wrap in `<Modal>`, remove `.module.css` |
| `features/documents/components/ExportSiaeModal.tsx` | Wrap in `<Modal>`, kill cream bg |
| `features/documents/components/VersionCompareModal.tsx` | Wrap in `<Modal>` |
| `features/screenplay-editor/components/ExportScreenplayPdfModal.tsx` | Wrap in `<Modal>` |
| `features/screenplay-editor/components/SceneNumberConflictModal.tsx` | Wrap in `<Modal>` |
| `features/breakdown/components/ExportBreakdownModal.tsx` | Wrap in `<Modal>` |
| `features/breakdown/components/AddElementModal.tsx` | Wrap in `<Modal>` |
| `features/documents/SynopsisPage` | Replace footer text with `<DocStats stats=[chars, pages~]/>` |
| `features/documents/SoggettoPage` | Replace footer text with `<DocStats stats=[cartelle, chars]/>` |
| `features/documents/OutlinePage` | Add `<DocStats stats=[scenes, words]/>` |
| `features/documents/TreatmentPage` | Add `<DocStats stats=[words, pages~]/>` |
| `features/screenplay-editor/ScreenplayPage` | Add `<DocStats stats=[scenes, pages]/>` |
| `features/documents/components/SoggettoCard` | Logline → serif (`--ds-font-serif`) |
| `features/screenplay-editor/components/Viewbar*` | Right slot uses `<VersionTrigger variant="pill"/>` |
| `features/breakdown/components/BreakdownPageV2` | Right slot uses `<VersionTrigger variant="pill"/>`, drop dock "Versioni" |
| `features/schedule/...` | Right slot uses `<VersionTrigger variant="pill"/>`, drop dock "Versioni" |
| FloatingDocks on doc pages (4 pages) | "Versioni" stays ghost, but uses `<VersionTrigger variant="ghost"/>` |

## 8. Visual tokens introduced

None new. Re-uses:
- `--ds-surface-1`, `--ds-surface-2`, `--ds-line`
- `--ds-fg-strong`, `--ds-fg-mute`
- `--radius-full`, `--radius-md`, `--radius-lg`
- `--ds-shadow-4`
- `--ds-text-xs`, `--ds-text-sm`, `--ds-text-lg`

## 9. Accessibility (WCAG AA)

- `Modal`: focus trap, Esc close, focus return on close, ARIA
  `role="dialog" aria-modal="true" aria-labelledby` wired to title id.
- `VersionTrigger`: `aria-haspopup="dialog"` (since it opens the drawer),
  `aria-expanded` reflected.
- `DocStats`: rendered as `<dl>` with proper `<dt>/<dd>` for assistive
  technologies; `aria-live="polite"` so dynamic count changes are announced.
- All animations honour `prefers-reduced-motion`.

## 10. Done criteria

- All 7 modals visually identical at a glance: white card, same header,
  same footer, same radius, same shadow.
- `Synopsis` and `Soggetto` show stats in the same primitive, same spot.
- One regex grep `grep -rn "Versioni" apps/web` returns the same component
  call from every page.
- `Logline` font matches `Soggetto` body font.
- Pill/rounded rule documented in primitive comments + this spec.
- `pnpm --filter @oh-writers/web typecheck` green.
- Visual spot-check via Chrome MCP on `/synopsis`, `/soggetto`,
  `/screenplay`, `/breakdown`, `/schedule` and at least two modals
  (Export DOCX, Export SIAE).

## 11. Open questions

1. `DocStats` position when a FloatingDock is present: bottom-left of page
   (avoids dock) vs inside the Viewbar right slot. **Decision (15 May 2026):
   bottom-left, sticky, separate from Viewbar — counts change frequently and
   should not crowd the right slot.**
2. Should `VersionTrigger variant="pill"` also surface the `Salvato …s ago`
   state? **No — that stays in the TopBar `SavePill`. Concerns separated.**
3. Should doc-page FloatingDocks render `<VersionTrigger variant="ghost">`
   as a ReactNode child, or stay with `FloatingDock.secondaryActions=[{
   label: "Versioni" }]`? **Decision (15 May 2026): stay with
   `secondaryActions`. The dock's ghost button is visually and semantically
   the same as `VersionTrigger ghost` — introducing a node slot only for
   naming would add API surface without value. The two render paths are the
   canonical ghost-version-trigger pattern.**

## 12. Out of scope — explicit follow-ups

These came up during migration but are not porting cleanup. Tracked here so
they don't get lost:

- **Versioning for `breakdown` and `schedule`.** `VersionScopeSchema` today
  has only `screenplay | document`. The `VersionTrigger variant="pill"` on
  Breakdown V2 and Schedule V2 currently fires an `onClick` that does
  nothing (mirrors the previous `disabled` button). Wiring requires a new
  `breakdown` / `schedule` scope in the schema, server functions to
  list/create/restore versions, and a DB column. Own spec when prioritised.
- **E2E test selectors.** `char-counter`, `page-counter`, `page-indicator`,
  `scene-indicator` test-ids were removed when ad-hoc footers were
  replaced with `DocStats`. Tests updated in this spec to query DocStats
  labels — see commit referenced in the implementation log.
