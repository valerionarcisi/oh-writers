// packages/ui/src/composites/CesareDrawer/use-drawer-state.ts
/**
 * Drawer state machine for the Notion-class Cesare Drawer.
 *
 * Public API:
 *   - {@link CesareDrawerState} — the 5 visible states.
 *   - {@link useDrawerState} — React hook exposing `state` + action creators.
 *
 * The reducer is built on `ts-pattern` so transitions are exhaustive.
 * Each action ("cycle", "stepBack", "peek", "close", "open") maps every
 * incoming state to its successor — `ts-pattern`'s `.exhaustive()` guards
 * against forgetting a case at compile time.
 *
 * Action contract:
 *   - cycle:    closed → expanded → expanded-split → full → expanded
 *               (peek behaves like expanded for cycling)
 *   - stepBack: peek → expanded; full → expanded-split; expanded-split → expanded;
 *               expanded → closed; closed stays closed.
 *   - peek:     any state → peek (parking gesture).
 *   - close:    any state → closed.
 *   - open(target?): closed → target (default expanded); already-open ignores.
 */

import { useCallback, useReducer } from "react";
import { match, P } from "ts-pattern";

export type CesareDrawerState =
  | "closed"
  | "peek"
  | "expanded"
  | "expanded-split"
  | "full";

type Action =
  | { kind: "cycle" }
  | { kind: "stepBack" }
  | { kind: "peek" }
  | { kind: "close" }
  | { kind: "open"; target?: CesareDrawerState };

/**
 * Pure reducer. Exported for tests.
 */
export function drawerReducer(
  state: CesareDrawerState,
  action: Action,
): CesareDrawerState {
  return (
    match<[CesareDrawerState, Action], CesareDrawerState>([state, action])
      .with([P.any, { kind: "close" }], () => "closed")
      .with([P.any, { kind: "peek" }], () => "peek")
      .with([P.any, { kind: "open", target: P.select() }], (target) => {
        // open is a no-op once we're already open.
        if (state !== "closed") return state;
        return target ?? "expanded";
      })
      .with([P.any, { kind: "open" }], () =>
        state === "closed" ? "expanded" : state,
      )
      // ── cycle (↗) — moves "forward" through the three open layouts ────
      .with(["closed", { kind: "cycle" }], () => "expanded")
      .with(["peek", { kind: "cycle" }], () => "expanded")
      .with(["expanded", { kind: "cycle" }], () => "expanded-split")
      .with(["expanded-split", { kind: "cycle" }], () => "full")
      .with(["full", { kind: "cycle" }], () => "expanded")
      // ── stepBack (↙) — undoes one cycle step ──────────────────────────
      .with(["closed", { kind: "stepBack" }], () => "closed")
      .with(["peek", { kind: "stepBack" }], () => "expanded")
      .with(["expanded", { kind: "stepBack" }], () => "closed")
      .with(["expanded-split", { kind: "stepBack" }], () => "expanded")
      .with(["full", { kind: "stepBack" }], () => "expanded-split")
      .exhaustive()
  );
}

export interface UseDrawerStateOptions {
  initialState?: CesareDrawerState;
  /** Called after every state change. Useful for persisting to localStorage. */
  onChange?: (next: CesareDrawerState) => void;
}

export interface UseDrawerStateResult {
  state: CesareDrawerState;
  cycle: () => void;
  stepBack: () => void;
  peek: () => void;
  close: () => void;
  open: (target?: CesareDrawerState) => void;
  setState: (next: CesareDrawerState) => void;
}

/**
 * React hook wrapping {@link drawerReducer}. Pass `initialState` to restore
 * a persisted value at mount. `onChange` fires synchronously after every
 * dispatch so the consumer can persist the state per-user.
 */
export function useDrawerState(
  opts: UseDrawerStateOptions = {},
): UseDrawerStateResult {
  const { initialState = "closed", onChange } = opts;

  const [state, dispatch] = useReducer((s: CesareDrawerState, a: Action) => {
    const next = drawerReducer(s, a);
    // onChange is intentionally read at dispatch time via the latest closure
    // — that's the trade-off of using useReducer here (no access to current
    // props from inside the reducer). The owner re-creates the hook with the
    // up-to-date callback every render, so the closure captured by useCallback
    // below will use the freshest reference.
    return next;
  }, initialState);

  const dispatchWithNotify = useCallback(
    (a: Action) => {
      dispatch(a);
      // We can't read the result of the reducer here without a manual run.
      // Re-derive the next state to notify the listener.
      const next = drawerReducer(state, a);
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
  const peek = useCallback(
    () => dispatchWithNotify({ kind: "peek" }),
    [dispatchWithNotify],
  );
  const close = useCallback(
    () => dispatchWithNotify({ kind: "close" }),
    [dispatchWithNotify],
  );
  const open = useCallback(
    (target?: CesareDrawerState) =>
      dispatchWithNotify({ kind: "open", target }),
    [dispatchWithNotify],
  );
  const setState = useCallback(
    (next: CesareDrawerState) => {
      // Imperative escape hatch used when restoring state externally.
      if (next === state) return;
      // Route via "open" / "close" / "peek" / cycle equivalence — but easier
      // to just close → cycle to the target. Simplest: dispatch open with the
      // explicit target (handles closed→X), and for any-to-any prefer a
      // dedicated path. We model it as: close first, then dispatch open with
      // the target. Two dispatches feel ugly, but they keep reducer purity.
      dispatch({ kind: "close" });
      if (next === "closed") {
        onChange?.("closed");
        return;
      }
      dispatch({ kind: "open", target: next });
      onChange?.(next);
    },
    [state, onChange],
  );

  return { state, cycle, stepBack, peek, close, open, setState };
}
