# 10h — Breakdown read-only UX

Sub-spec of `10-breakdown`.

## Problem

The breakdown page (`/projects/$id/breakdown`) leaks editor affordances into a view that is supposed to be read-only:

1. Clicking a scene heading opens the editing menu (`Edit number`, `Unlock number`, `Resequence from here`, `Remove heading`). During the breakdown the user must not be able to alter the screenplay.
2. The scene Table of Contents on the left does not follow the script reader scroll. Scrolling in the centre column updates `activeSceneId` but the corresponding TOC item stays out of view, forcing the user to scroll the TOC by hand.

## Goal

Make the breakdown page strictly read-only with respect to screenplay structure, and keep the TOC visually in sync with the script reader at all times.

## Non-goals

- No change to the editable screenplay editor (`/projects/$id/screenplay`).
- No change to the data model.
- No change to the element extraction pipeline (covered by `10i`).

## Design

### 1. `HeadingNodeView` accepts a `readOnly` flag

`createHeadingNodeView` (in `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts`) gets a third options argument:

```ts
interface HeadingNodeViewOptions {
  readOnly?: boolean;
}

export function createHeadingNodeView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
  options: HeadingNodeViewOptions = {},
): NodeView;
```

Behaviour when `readOnly === true`:

- The scene number badge stays visible (it is informative).
- The trigger button (`⋮`) and the contextual menu are not rendered. No DOM listener is attached for the menu.
- Lock indicators stay visible but are not interactive.

Default `readOnly: false` preserves the editable screenplay behaviour.

### 2. `ReadOnlyScreenplayView` passes `readOnly: true`

In `ReadOnlyScreenplayView.tsx` the `nodeViews.heading` factory forwards `{ readOnly: true }`:

```ts
heading: (node, v, getPos) =>
  createHeadingNodeView(node, v, getPos, { readOnly: true }),
```

The editable `ScreenplayEditor` either omits the option or passes `{ readOnly: false }` — no behavioural change.

### 3. `SceneTOC` auto-scrolls the active item

`SceneTOC.tsx` keeps a `Map<sceneId, HTMLButtonElement>` populated via `ref` callbacks on each `<button>`. A `useEffect` listens to `activeSceneId` changes:

```ts
useEffect(() => {
  if (!activeSceneId) return;
  const el = itemsRef.current.get(activeSceneId);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({
    block: "nearest",
    behavior: reduced ? "auto" : "smooth",
  });
}, [activeSceneId]);
```

`block: "nearest"` avoids jumping when the item is already visible.

## Files touched

- `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts` — add `options.readOnly` branch.
- `apps/web/app/features/screenplay-editor/components/ReadOnlyScreenplayView.tsx` — pass `{ readOnly: true }`.
- `apps/web/app/features/breakdown/components/SceneTOC.tsx` — add ref map + auto-scroll effect.

No new dependencies, no schema changes, no server functions.

## Tests

### Vitest

- `heading-nodeview.test.ts`
  - With `readOnly: true`, `[data-testid="heading-menu-trigger"]` is not present in the DOM.
  - With `readOnly: false` (or omitted), the trigger renders as today.

### Playwright

- `[OHW-10h-1]` Open `/projects/$id/breakdown`, click on any scene heading, assert that the menu (`heading-menu`) is **not** visible.
- `[OHW-10h-2]` Open the same page, scroll the script reader to scene 15, wait for the debounced `activeSceneId` update, then assert that `[data-testid="scene-toc-item-15"]` is within the visible bounds of `[data-testid="breakdown-toc"]`.
- `[OHW-10h-3]` Regression: open `/projects/$id/screenplay`, click a heading, assert that the menu **is** visible (the editable view is unchanged).

## Risks

- Forgetting to pass `{ readOnly: false }` from a future read/write consumer of `createHeadingNodeView` would silently disable the menu. Mitigation: default value is `false`, so the existing call site in `ScreenplayEditor` keeps working without changes.

## Rollout

Single PR. No flag, no migration. Mergeable independently of `10i`.
