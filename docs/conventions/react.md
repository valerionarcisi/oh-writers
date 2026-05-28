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

The AppShell is composed of exactly four top-level building blocks (see [Spec 44](../specs/44-shell-refactor-notion-style.md)):

- `LeftRail` — project identity, Document Type / Production View nav, Cesare Sessions (when Cesare is expanded), Recents, tool icons. Owns the `full`/`collapsed` width transition.
- `TopBar` — slim per-page header. Optional `elementLegend` slot, used only on Sceneggiatura for the SCENE/ACTION/CHARACTER/DIALOGUE/PAREN/TRANSITION row.
- `BottomDock` — floating pill bottom-right (`bell · avatar · gear · ✦ Cesare`). Visible only when Cesare is `closed`.
- `CesareSheet` — Notion-style floating sub-window bottom-right (`closed | expanded | peek | full`). When non-closed, the dock icons merge into its header.

Rule: **page-level components NEVER render a Cesare panel themselves; they consume the shell-level one via context.** Adding a per-page Cesare panel, sheet, or pill is a hard no.
