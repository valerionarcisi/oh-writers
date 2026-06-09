import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SaveState } from "@oh-writers/ui";

type SaveStateValue = {
  state: SaveState | undefined;
  secondsAgo: number | undefined;
  // "Save now" handler the pill calls on press. Undefined → the pill is not
  // actionable (read-only view, or no editor published one). Spec 63 F3.
  onFlush: (() => void) | undefined;
};

type SaveStateContextValue = {
  value: SaveStateValue;
  setSaveState: (next: SaveStateValue) => void;
};

const EMPTY: SaveStateValue = {
  state: undefined,
  secondsAgo: undefined,
  onFlush: undefined,
};

const SaveStateContext = createContext<SaveStateContextValue | null>(null);

export function SaveStateProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SaveStateValue>(EMPTY);

  const setSaveState = useCallback((next: SaveStateValue) => {
    setValue((prev) =>
      prev.state === next.state &&
      prev.secondsAgo === next.secondsAgo &&
      prev.onFlush === next.onFlush
        ? prev
        : next,
    );
  }, []);

  const ctx = useMemo(() => ({ value, setSaveState }), [value, setSaveState]);
  return (
    <SaveStateContext.Provider value={ctx}>
      {children}
    </SaveStateContext.Provider>
  );
}

export function useSaveStateValue(): SaveStateValue {
  const ctx = useContext(SaveStateContext);
  if (!ctx) return EMPTY;
  return ctx.value;
}

/**
 * Publish a save-state to the TopBar pill. Pass `undefined` for `state` to
 * hide the pill (e.g. before the first edit, or on read-only views). `onFlush`
 * makes the pill a "save now" button (Spec 63 F3).
 *
 * The pill clears automatically on unmount so a previous editor cannot leak
 * its state into a sibling route that does not publish.
 */
export function useSaveStatePublisher(
  state: SaveState | undefined,
  secondsAgo?: number,
  onFlush?: () => void,
) {
  const ctx = useContext(SaveStateContext);
  // Depend ONLY on the stable `setSaveState` (a `useCallback([])`), never on the
  // whole `ctx` object: `ctx` is a `useMemo([value, setSaveState])` whose
  // reference changes every time the save-state updates. Depending on `ctx` made
  // this effect re-run on each publish — cleanup reset to undefined, the body
  // re-set the state, the value changed, `ctx` changed, the effect fired again —
  // an infinite setState loop ("Maximum update depth exceeded").
  const setSaveState = ctx?.setSaveState;
  // `onFlush` is a fresh closure each render. Keep it in a ref so the publish
  // effect can stay keyed on `state`/`secondsAgo` only (a new flush identity must
  // not re-fire the effect — same infinite-loop class as above). The pill always
  // calls the LATEST flush through this stable wrapper.
  const flushRef = useRef(onFlush);
  flushRef.current = onFlush;
  const stableFlush = useMemo<(() => void) | undefined>(
    () => (onFlush ? () => flushRef.current?.() : undefined),
    // Only the PRESENCE of a handler matters for the published value; the
    // identity is bridged through the ref.
    [onFlush === undefined],
  );

  useEffect(() => {
    if (!setSaveState) return;
    setSaveState({ state, secondsAgo, onFlush: stableFlush });
    return () => {
      setSaveState(EMPTY);
    };
  }, [setSaveState, state, secondsAgo, stableFlush]);
}
