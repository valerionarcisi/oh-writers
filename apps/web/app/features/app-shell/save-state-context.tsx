import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SaveState } from "@oh-writers/ui";

type SaveStateValue = {
  state: SaveState | undefined;
  secondsAgo: number | undefined;
};

type SaveStateContextValue = {
  value: SaveStateValue;
  setSaveState: (next: SaveStateValue) => void;
};

const SaveStateContext = createContext<SaveStateContextValue | null>(null);

export function SaveStateProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SaveStateValue>({
    state: undefined,
    secondsAgo: undefined,
  });

  const setSaveState = useCallback((next: SaveStateValue) => {
    setValue((prev) =>
      prev.state === next.state && prev.secondsAgo === next.secondsAgo
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
  if (!ctx) return { state: undefined, secondsAgo: undefined };
  return ctx.value;
}

/**
 * Publish a save-state to the TopBar pill. Pass `undefined` for `state` to
 * hide the pill (e.g. before the first edit, or on read-only views).
 *
 * The pill clears automatically on unmount so a previous editor cannot leak
 * its state into a sibling route that does not publish.
 */
export function useSaveStatePublisher(
  state: SaveState | undefined,
  secondsAgo?: number,
) {
  const ctx = useContext(SaveStateContext);
  // Depend ONLY on the stable `setSaveState` (a `useCallback([])`), never on the
  // whole `ctx` object: `ctx` is a `useMemo([value, setSaveState])` whose
  // reference changes every time the save-state updates. Depending on `ctx` made
  // this effect re-run on each publish — cleanup reset to undefined, the body
  // re-set the state, the value changed, `ctx` changed, the effect fired again —
  // an infinite setState loop ("Maximum update depth exceeded").
  const setSaveState = ctx?.setSaveState;
  useEffect(() => {
    if (!setSaveState) return;
    setSaveState({ state, secondsAgo });
    return () => {
      setSaveState({ state: undefined, secondsAgo: undefined });
    };
  }, [setSaveState, state, secondsAgo]);
}
