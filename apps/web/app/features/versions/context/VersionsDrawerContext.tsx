import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { VersionScope } from "@oh-writers/domain";

const STORAGE_KEY_WIDTH = "ohw-versions-drawer-width";
const DEFAULT_WIDTH = 360;

const getInitialWidth = (): number => {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const stored = localStorage.getItem(STORAGE_KEY_WIDTH);
  const parsed = stored ? parseInt(stored, 10) : NaN;
  return isNaN(parsed) ? DEFAULT_WIDTH : parsed;
};

interface VersionsDrawerState {
  isOpen: boolean;
  scope: VersionScope | null;
  width: number;
}

interface VersionsDrawerContextValue {
  state: VersionsDrawerState;
  /** Called when the user clicks a version row in the drawer. */
  onSelectVersion: ((versionId: string) => void) | null;
  open: (
    scope: VersionScope,
    onSelectVersion?: (versionId: string) => void,
  ) => void;
  close: () => void;
  setWidth: (width: number) => void;
}

const VersionsDrawerContext = createContext<VersionsDrawerContextValue | null>(
  null,
);

export function VersionsDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VersionsDrawerState>({
    isOpen: false,
    scope: null,
    width: getInitialWidth(),
  });
  const [onSelectVersion, setOnSelectVersion] = useState<
    ((versionId: string) => void) | null
  >(null);

  const open = useCallback(
    (scope: VersionScope, selectHandler?: (versionId: string) => void) => {
      setState((prev) => ({ ...prev, isOpen: true, scope }));
      // useState setter receives a function → must wrap to avoid it being
      // treated as an updater function
      setOnSelectVersion(selectHandler ? () => selectHandler : null);
    },
    [],
  );

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const setWidth = useCallback((width: number) => {
    localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
    setState((prev) => ({ ...prev, width }));
  }, []);

  return (
    <VersionsDrawerContext.Provider
      value={{ state, onSelectVersion, open, close, setWidth }}
    >
      {children}
    </VersionsDrawerContext.Provider>
  );
}

export function useVersionsDrawer(): VersionsDrawerContextValue {
  const ctx = useContext(VersionsDrawerContext);
  if (!ctx) {
    throw new Error(
      "useVersionsDrawer must be used within VersionsDrawerProvider",
    );
  }
  return ctx;
}
