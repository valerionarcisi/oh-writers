# Spec 44 — Design Notes (WP-DESIGN)

Companion to `docs/specs/44-shell-refactor-notion-style.md`. Captures the
design decisions taken inside the `CesareDrawer` + hover-reveal work, plus
the visual audit findings WP-A / WP-B / WP-C / WP-D need to address.

## 1. Token decisions

### 1.1 Drawer surfaces

| Surface       | State(s)           | Background                                         | Border                 | Shadow                                   |
| ------------- | ------------------ | -------------------------------------------------- | ---------------------- | ---------------------------------------- |
| Drawer frame  | `expanded`, `peek` | `--ds-surface`                                     | `--ds-line`            | `--ds-shadow-4`                          |
| Drawer frame  | `expanded-split`   | `--ds-surface`                                     | left only: `--ds-line` | `--ds-shadow-2` (anchored, not floating) |
| Drawer frame  | `full`             | `--ds-bg` (linen-50 warmth on shell-wide surfaces) | none                   | none                                     |
| Drawer header | all states         | `--ds-bg`                                          | bottom: `--ds-line`    | —                                        |
| Drawer body   | all states         | `--ds-surface`                                     | none                   | —                                        |
| Drawer footer | all states         | `--ds-bg`                                          | top: `--ds-line`       | —                                        |

Rationale: the header/footer use `--ds-bg` so they read as part of the OS
chrome (warm linen) while the body keeps `--ds-surface` so the conversation
is the focal point. In `full`, the body switches to `--ds-bg` and a centred
780px column to mimic Notion's "» full" page.

### 1.2 Typography

- Agent name + session selector trigger: `--ds-font-display` (Fraunces) at 14px.
- Body, composer, scope chips: `--ds-font-sans` (Inter) at 13px.
- Context-chip eyebrows: 10.5px uppercase, letter-spacing 0.06em.
- NO `--ds-font-mono` inside the drawer — it stays an Inter/Fraunces island.

### 1.3 Radii

- `expanded` corners: `--ds-radius-lg` (12px).
- `expanded-split`: 0 (anchored, full-height column).
- `full`: 0.
- `peek`: `--ds-radius-pill`.
- Composer: 10px (1 step above `--ds-radius-md`, hand-set to feel softer
  than the surrounding 8px buttons; consider promoting to a `--ds-radius-input`
  token in a future pass if more components want it).
- Buttons inside header: `--ds-radius-sm`.

### 1.4 Motion

Every transition uses `var(--ds-duration-3) var(--ds-ease)`. View
Transitions API is the preferred path for `closed → expanded` (the
expand-from-bottom-right animation) — the CSS keyframes
`drawer-expand-in`, `drawer-slide-from-right`, `drawer-scale-up` are the
fallback. All transforms are wrapped behind `@media (prefers-reduced-motion: reduce)`.

### 1.5 Resize bounds

- `expanded`: height `[320px, 76vh]`. Default 480.
- `expanded-split`: width `[360px, 60vw]`. Default 480.

Persistence keys in `DRAWER_SIZE_STORAGE_KEYS`:

- `ohw.drawer.size.expanded`
- `ohw.drawer.size.split`

## 2. Public API quick reference

### `CesareDrawer`

```tsx
<CesareDrawer
  state={state}
  onStateChange={setStateFromOutside}
  onCycle={cycle}
  onStepBack={stepBack}
  onPeek={peek}
  onClose={close}
  sessions={sessions}
  activeSessionId={activeSessionId}
  onSessionSelectorClick={openSessionPopover}
  contextTags={contextTags}
  dockIcons={{ onBell, onAvatar, onGear, avatarLabel: "V" }}
  scopes={scopes}
  onAddScope={openScopePicker}
  composer={{
    value,
    onChange,
    onSubmit,
    isThinking,
    onStop,
  }}
>
  {/* message stream, Step Blocks, recap cards */}
</CesareDrawer>
```

### `useDrawerState`

```ts
const { state, cycle, stepBack, peek, close, open } = useDrawerState({
  initialState: "closed",
  onChange: (next) => localStorage.setItem("ohw.drawer.state", next),
});
```

State machine:

```
closed ── cycle ──▶ expanded ── cycle ──▶ expanded-split ── cycle ──▶ full
   ▲                    │                       │                     │
   └── stepBack ────────┘                       ▼                     │
                  expanded ◀── stepBack ── expanded-split ◀── stepBack┘
   ▲
   └── close (from any) / peek (from any) / open(target?) (from closed)
```

### `useDrawerResize`

```ts
const { handleProps, size, isResizing } = useDrawerResize({
  axis: "block", // or "inline"
  initialSize: 480,
  min: 320,
  max: "76vh", // or px number, or "60vw"
  onSizeChange: persistFn,
  isDisabled: state !== "expanded",
});
```

### `useRailReveal`

```ts
const { sentinelProps, railProps, lockOpenProps, isRevealed } = useRailReveal({
  shellState,               // "full" | "collapsed" | "focus"
  onLockOpen: () => setShellState("full"),
  graceMs: 300,             // optional; default 300
});

// JSX
<>
  <div className={styles.sentinel} {...sentinelProps} />
  <aside className={styles.rail} {...railProps}>
    <button className={styles.lockOpen} {...lockOpenProps}>»</button>
    {…}
  </aside>
</>
```

Side effect: while the rail is revealed, the hook sets
`body[data-rail-reveal="open"]`. CSS keys off that attribute to slide the
rail in. When `shellState !== "collapsed"` the hook is a no-op.

## 3. Cross-page visual audit

The audit was run against the spec-44 HTML mockup
(`docs/specs/mockups/shell-canva-notion.html`). Screenshots of every
drawer + shell + view permutation are stored under
`docs/specs/mockups/audit/`.

### 3.1 Screenshots

| File                              | State                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| `01-closed.png`                   | Cesare closed, shell full — breakdown view, dock pill bottom-right |
| `02-expanded.png`                 | Cesare expanded (floating bottom-right)                            |
| `03-expanded-split.png`           | Cesare expanded-split (anchored right column)                      |
| `04-peek.png`                     | Cesare peek (pill bottom-right)                                    |
| `05-full.png`                     | Cesare full-page                                                   |
| `06-shell-collapsed.png`          | Shell collapsed (rail hidden, hamburger top-left, dock visible)    |
| `07-shell-collapsed-hover.png`    | Shell collapsed + rail revealed via hover sentinel                 |
| `08-shell-focus.png`              | Focus mode (rail + topstrip + dock hidden)                         |
| `09-screenplay-expanded.png`      | Sceneggiatura + expanded drawer                                    |
| `10-soggetto-expanded.png`        | Soggetto + expanded drawer (margin notes column shrinks)           |
| `11-locations-expanded-split.png` | Locations split-pane + expanded-split drawer                       |

### 3.2 Findings (file-level)

Each finding is a one-line PR comment proposal for the owning WP. Use the
token replacement listed in the third column — never invent a new token.

| Path                                                                                                                                                 | Finding                                                                                                           | Proposed token                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.module.css:116`                                                                 | `background: #fff;` hardcoded                                                                                     | `var(--ds-surface)`                                                                             |
| `apps/web/app/features/screenplay-editor/lib/plugins/proposed-edit-decoration.module.css:34`                                                         | `background-color: var(--ds-surface-raised, var(--color-surface, #fafafa));` falls back to `#fafafa` (rogue gray) | drop `#fafafa` fallback — `--ds-surface-raised` is provided by tokens                           |
| `apps/web/app/features/fundraising/components/OpportunityCard.module.css:64-108`                                                                     | Hardcoded `#3b82f6`, `#a855f7`, `#22c55e`, `#f97316`, `#dc2626`, `#d97706` category colors                        | introduce `--ds-cat-*` tokens or use `--ds-info`, `--ds-success`, `--ds-warning`, `--ds-danger` |
| `apps/web/app/features/fundraising/components/OpportunityCard.module.css:158`, `OpportunitiesPage.module.css:48`, `OpportunityDrawer.module.css:146` | `color: #fff;` hardcoded                                                                                          | `var(--ds-text-on-dark)`                                                                        |
| `apps/web/app/features/locations/components/LocationPanel.module.css:42-47`                                                                          | Hardcoded `#8b3a1a` / `#75301a` (clay tones)                                                                      | `var(--ds-action)` / `var(--ds-action-hover)`                                                   |
| `apps/web/app/features/locations/components/LocationPanel.module.css:114`                                                                            | Hardcoded `#2d6a4f` green                                                                                         | `var(--ds-success)` or `var(--ds-agent)`                                                        |
| `apps/web/app/features/locations/components/NominatimCombobox.module.css:132`                                                                        | Hardcoded `#8b3a1a`                                                                                               | `var(--ds-action)`                                                                              |
| `apps/web/app/features/locations/components/PlacesCombobox.module.css:18,131`                                                                        | Hardcoded `#8b3a1a` border color                                                                                  | `var(--ds-action)`                                                                              |
| `apps/web/app/features/user-settings/components/UserSettingsPage.module.css:108,113`                                                                 | Fallback hex on `--color-success`/`--color-error` references DS-v1 tokens                                         | use `var(--ds-success)` / `var(--ds-danger)` without fallback                                   |

### 3.3 Findings (structural)

- **Breakdown** (`apps/web/app/features/breakdown/components/BreakdownPage.module.css`): contains a `right-panel` rule cluster that becomes dead code after WP-C drops the panel. WP-C is expected to delete it; flag for follow-up.
- **Soggetto + Sinossi + Trattamento** (`apps/web/app/features/documents/components/MarginNotesColumn.module.css` new in WP-C): confirm width collapses to single-line note when `body[data-cesare]` is not `closed`. Visual audit shows correct collapse in `10-soggetto-expanded.png`.
- **Sceneggiatura** Element Legend (`apps/web/app/features/screenplay-editor/components/ScreenplayPage.module.css`): the dot color in the mockup uses raw hex (`#8b3a1a` for `scene`, `#6b3e7a` for `char`, etc.). When implemented, these need to come from the `--cat-*` palette tokens in `packages/ui/src/themes/linen.css` — not invented in the page module.
- **Locations** split-pane (`apps/web/app/features/locations/components/LocationsPage.module.css`): confirm the `340px 1fr` grid + map background uses `--ds-surface-deep` for the gradient (mockup uses `linear-gradient(...#e2dfd6 0% ... #d8d6cd 100%)` which is `--ds-linen-200` → `--ds-linen-300`).

### 3.4 Drawer-specific assertions (WP-B integration)

WP-B should verify the following at integration time:

1. The drawer never re-mounts when transitioning between states. Setting
   `data-state` on the wrapper triggers a CSS animation, not a remount.
2. The composer textarea preserves its caret position when the drawer
   transitions from `expanded` to `expanded-split` (no defocus jitter).
3. `cmd+enter` submits the composer. `enter` alone inserts a newline.
4. When `composer.isThinking === true`, the send button is replaced by a
   `⏸ Stop` button bound to `composer.onStop`.
5. The scroll-anchor pill ("Vai alle nuove risposte") is only visible when
   the user has scrolled more than 80px above the bottom of the body.
6. `localStorage.getItem(DRAWER_SIZE_STORAGE_KEYS.expanded)` is updated on
   every drag tick — make sure quota errors are handled in private mode.

### 3.5 Pixel stability of the editor

The editor MUST remain pixel-stable across `data-cesare ∈ {closed, expanded,
peek, full}` AND `data-shell ∈ {full, collapsed, focus}` (when in `float`
mode). The mockup verifies this by inspecting `.editor-area`'s computed
`getBoundingClientRect()` in each state — the value of `width` does not
change across `data-cesare` transitions because the drawer never participates
in the grid in `float` mode. WP-A should mirror this rule in the real
`AppShell.module.css`.

In `expanded-split`, the editor DOES reflow (the drawer takes a real grid
column). This is the explicit Notion-`»` behaviour and is acceptable per
the spec.

## 4. Open questions

- **Touch hover-reveal**: the hover-sentinel is mouse-only. The hamburger
  button covers the touch / keyboard case. WP-A may want to add a swipe
  gesture; out of scope for WP-DESIGN.
- **Composer slash menu**: the spec mentions `/` opens a slash-command menu;
  WP-DESIGN does not implement it yet. WP-B is expected to layer a popover
  on top of the textarea.
- **Bell drawer**: in spec 44, the bell migrates from the BottomDock to the
  Cesare header when the drawer is open. The header just renders a button;
  WP-D owns the notification drawer state. WP-D should mount the drawer
  using the `<Drawer>` primitive (`packages/ui/src/primitives/Drawer/`).
