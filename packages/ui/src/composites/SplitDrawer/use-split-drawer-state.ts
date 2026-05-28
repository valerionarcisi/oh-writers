// packages/ui/src/composites/SplitDrawer/use-split-drawer-state.ts
/**
 * Drawer state machine for the right-anchored SplitDrawer primitive (Spec 44).
 *
 * The SplitDrawer is the Notion `»` chevron pattern: an auxiliary panel that
 * occupies roughly half the viewport while the page reflows narrower on the
 * left. It is completely separate from {@link useDrawerState} which governs
 * the Cesare drawer.
 *
 * Public API:
 *   - {@link SplitDrawerState} — the 3 visible states.
 *   - {@link useSplitDrawerState} — React hook exposing `state` + actions.
 *
 * Action contract:
 *   - cycle:    closed → open → full → open (cyclic between the two open
 *               states; closed only enters via `open()`).
 *   - stepBack: full → open; open → closed; closed stays closed.
 *   - close:    any state → closed.
 *   - open(target?): any state → target (default open).
 */

import { useCallback, useReducer } from "react";
import { match, P } from "ts-pattern";

export type SplitDrawerState = "closed" | "open" | "full";

type Action =
  | { kind: "cycle" }
  | { kind: "stepBack" }
  | { kind: "close" }
  | { kind: "open"; target?: SplitDrawerState };

/**
 * Pure reducer. Exported for tests.
 */
export function splitDrawerReducer(
  state: SplitDrawerState,
  action: Action,
): SplitDrawerState {
  return (
    match<[SplitDrawerState, Action], SplitDrawerState>([state, action])
      .with([P.any, { kind: "close" }], () => "closed")
      .with([P.any, { kind: "open", target: P.select() }], (target) => target ?? "open")
      .with([P.any, { kind: "open" }], () => "open")
      // ── cycle (↗) — moves "forward" through the open layouts ─────────
      .with(["closed", { kind: "cycle" }], () => "open")
      .with(["open", { kind: "cycle" }], () => "full")
      .with(["full", { kind: "cycle" }], () => "open")
      // ── stepBack (↙) — undoes one cycle step ──────────────────────────
      .with(["closed", { kind: "stepBack" }], () => "closed")
      .with(["open", { kind: "stepBack" }], () => "closed")
      .with(["full", { kind: "stepBack" }], () => "open")
      .exhaustive()
  );
}

export interface UseSplitDrawerStateOptions {
  initialState?: SplitDrawerState;
  /** Called after every state change. Useful for persisting to localStorage. */
  onChange?: (next: SplitDrawerState) => void;
}

export interface UseSplitDrawerStateResult {
  state: SplitDrawerState;
  cycle: () => void;
  stepBack: () => void;
  close: () => void;
  open: (target?: SplitDrawerState) => void;
  setState: (next: SplitDrawerState) => void;
}

/**
 * React hook wrapping {@link splitDrawerReducer}. Pass `initialState` to
 * restore a persisted value at mount. `onChange` fires synchronously after
 * every dispatch so the consumer can persist the state per-user.
 */
export function useSplitDrawerState(
  opts: UseSplitDrawerStateOptions = {},
): UseSplitDrawerStateResult {
  const { initialState = "closed", onChange } = opts;

  const [state, dispatch] = useReducer(splitDrawerReducer, initialState);

  const dispatchWithNotify = useCallback(
    (a: Action) => {
      dispatch(a);
      const next = splitDrawerReducer(state, a);
      if (next !== state) onChange?.(next);
    },
    [state, onChange],
  );

  const cycle = useCallback(
    () => dispatchWithNotify({ kind: "cycle" }),
    [dispatchWithNotify],
  );
  const stepBack = useCallback(
    () => dispatchWithNotify({ kind: "stepBack" }),
    [dispatchWithNotify],
  );
  const close = useCallback(
    () => dispatchWithNotify({ kind: "close" }),
    [dispatchWithNotify],
  );
  const open = useCallback(
    (target?: SplitDrawerState) =>
      dispatchWithNotify({ kind: "open", target }),
    [dispatchWithNotify],
  );
  const setState = useCallback(
    (next: SplitDrawerState) => {
      // Imperative escape hatch — used when restoring state externally.
      if (next === state) return;
      if (next === "closed") {
        dispatch({ kind: "close" });
        onChange?.("closed");
        return;
      }
      dispatch({ kind: "open", target: next });
      onChange?.(next);
    },
    [state, onChange],
  );

  return { state, cycle, stepBack, close, open, setState };
}
