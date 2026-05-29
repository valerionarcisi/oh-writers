# React Patterns

## State — useReducer + ts-pattern

```typescript
const reducer = (state: State, action: Action): State =>
  match(action)
    .with({ type: "set/screenplay" }, ({ payload }) => ({
      ...state,
      screenplay: payload,
    }))
    .with({ type: "set/error" }, ({ error }) => ({ ...state, error }))
    .exhaustive();
```

## Action creators are pure functions

```typescript
const actions = {
  setScreenplay: (payload: Screenplay): Action => ({
    type: "set/screenplay",
    payload,
  }),
  setError: (error: Error): Action => ({ type: "set/error", error }),
} as const;
```

## Feature folder structure

Each feature is self-contained. Never reach across feature boundaries directly — use the feature's `index.ts`.

```
features/screenplay-editor/
├── components/
├── hooks/
├── server/        ← createServerFn definitions live here
├── styles/
└── index.ts       ← public API of the feature
```

## Shell composition

The AppShell is composed of these top-level building blocks (see [Spec 44](../specs/44-shell-refactor-notion-style.md)):

- `LeftRail` — project identity, Document Type / Production View nav, Cesare Sessions (when Cesare is expanded), Recents, tool icons. In `collapsed` mode the rail is hidden and a top-left `RailHamburger` toggles it back in as a sliding overlay (`useRailOverlay`); dismiss via outside-click / ESC / hamburger again — no hover-reveal.
- `TopBar` — slim per-page header. Optional `elementLegend` slot, used only on Sceneggiatura.
- `BottomDock` — floating pill bottom-right (`bell · avatar · gear · ✦ Cesare`). Visible only when Cesare = `closed` AND shell ≠ `focus`.
- `CesareSheet` — composes the `CesareDrawer` Notion-class primitive. Owns the chat state (messages, sessions, send pipeline); the drawer owns chrome + state machine. When non-closed, the dock icons merge into its header.
- `SplitDrawerProvider` + `SplitDrawerHost` — mounted once at the shell level. Hosts every right-anchored auxiliary panel via a discriminated payload (`trace` for Cesare's `[Mostra modifiche]` flow, `notifications` for the bell). New auxiliary panels add a payload kind, not a new mounted drawer.
- `NotificationCenterDrawer` — the bell drawer; renders through `SplitDrawerHost` via the `notifications` payload.

**Rules:**

- **Pages NEVER mount a chat container.** Consume the shell-level Cesare via context (`useCesare`, `CesareProvider`). Adding a per-page Cesare panel, sheet, or pill is a hard no.
- **Pages NEVER render a right column.** Auxiliary panels live in `SplitDrawer`, opened through `useSplitDrawer().open({ kind: ... })`.
- **Per-page action bars use `FloatingDock`** (legacy, repositioned to bottom-LEFT by default and hidden when Cesare ≠ `closed` or shell = `focus`). New per-page CTAs should ideally migrate into the TopBar action slot — that migration is out of scope for Spec 44.
