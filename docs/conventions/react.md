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
