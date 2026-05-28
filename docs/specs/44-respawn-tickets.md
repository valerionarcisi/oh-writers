# Spec 44 — WP Respawn Tickets

This file is the contract between WP-QA and WP-LEAD: when QA finds a divergence
between our implementation and EITHER the visual reference (`docs/specs/mockups/shell-canva-notion.html`)
OR the interaction reference (Notion AI chat live), WP-QA writes a respawn
brief here. WP-LEAD then re-dispatches the responsible WP agent with this
brief as input.

When this section is empty, every WP agent's deliverables match both references
to the QA harness's satisfaction.

## Ticket format

```
### TKT-NN — One-line summary
- **Failing assertion**: which Playwright tag or visual property failed
- **Responsible WP**: WP-A | WP-B | WP-C | WP-D | WP-DESIGN | WP-SPLIT | WP-NOTIFICATIONS
- **Failing file path**: absolute path to the source that needs to change
- **Corrected expectation**: what the file should produce per the references
- **Reference**: mockup section / Notion screen URL / spec line
```

## Open tickets

### TKT-01 — BreakdownPage still mounts the legacy FloatingDock alongside the new BottomDock

- **Failing assertion**: `[OHW-044-A]` editor width pixel-stability — the breakdown view ends up with two overlapping docks (legacy `FloatingDock` and Spec-44 `BottomDock`), so when Cesare opens the CSS hides only `BottomDock` and `FloatingDock` stays — the editor's perceived width changes because the legacy dock floats over different real estate. The Cesare-state pixel-stability test fails because the page never had only one command surface to start with.
- **Responsible WP**: WP-C (per-page mitigations)
- **Failing file path**: `apps/web/app/features/breakdown/components/BreakdownPage.tsx` — lines 12 (import `FloatingDock`) and ~1086 (`<FloatingDock ... />` JSX).
- **Corrected expectation**: drop the `FloatingDock` import + JSX entirely. The Spec 44 BottomDock owns the dock surface globally and BreakdownPage must NOT render a second one. The primary "Ri-spogliare con AI" / "Esporta" actions should migrate into the Top Strip or the `RecapStrip` action menu (line-producer affordance) — confirm with WP-DESIGN if visual placement is in doubt.
- **Reference**: Spec 44 §Bottom Dock — "Bottom Dock … Hidden when Cesare ≠ closed"; §WP-A — "Build BottomDock (animated ✦ Cesare icon, hides when Cesare ≠ closed)"; mockup `docs/specs/mockups/shell-canva-notion.html` shows one and only one dock pill at bottom-right.

### TKT-02 — `⌘\` shortcut for shell collapse is not wired

- **Failing assertion**: `[OHW-044-B]` "toggles full ↔ collapsed via `⌘\` and lock-open chip" — pressing `Meta+Backslash` does NOT transition `data-shell` from `full` to `collapsed`. The keydown listener in AppShell only handles `⌘K` (palette) and `⌃⌥F` (focus).
- **Responsible WP**: WP-A (shell primitives & layout)
- **Failing file path**: `apps/web/app/features/app-shell/components/AppShell.tsx` — the keyboard `useEffect` around lines 324–344 needs an extra branch:
  ```ts
  if (isMod && e.key === "\\") {
    e.preventDefault();
    setShellState((prev) => (prev === "collapsed" ? "full" : "collapsed"));
    return;
  }
  ```
- **Corrected expectation**: `⌘\` (Notion's "Toggle sidebar" shortcut) cycles `full` ↔ `collapsed`. `focus` state is unaffected — to leave focus the user still presses `⌃⌥F`.
- **Reference**: Spec 44 glossary — "AppShell Shell State … Toggled via `⌘\` (Notion shortcut) for full↔collapsed and `⌃⌥F` for focus."

### TKT-03 — BottomDock does not hide when shell is in focus mode

- **Failing assertion**: `[OHW-044-B]` "⌃⌥F toggles into and out of focus" — entering focus mode hides the rail (via AppShell's `.rail { display: none }` under `body[data-shell="focus"]`), but the BottomDock stays visible because its CSS module only hides on `body[data-cesare]` states.
- **Responsible WP**: WP-A (BottomDock primitive owns the visibility rule) or WP-DESIGN (design ownership of the dock CSS module).
- **Failing file path**: `packages/ui/src/shell/BottomDock/BottomDock.module.css` — after the existing `body[data-cesare="..."] .dock { display: none }` block, add:
  ```css
  :global(body[data-shell="focus"]) .dock {
    display: none;
  }
  ```
  Optionally also add `body[data-shell="focus"]` parity rules to `packages/ui/src/shell/TopBar/TopBar.module.css` and the AppShell focus toggle button so the entire chrome retreats together.
- **Corrected expectation**: in `focus` shell mode the dock is hidden. Cesare's peek pill remains the only floating affordance per spec.
- **Reference**: Spec 44 glossary — "AppShell Shell State … `focus` (rail + topstrip + dock hidden, NO hover-reveal)."

## Closed tickets

_None yet._
