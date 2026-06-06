// apps/web/app/features/app-shell/versions-detail-context.tsx
//
// The Versions surface is master→detail. The LIST stays narrow (a calm version
// list, the host page keeps its space); opening a version's DETAIL widens the
// lane to ~half the page and collapses the rail, because the detail shows a whole
// document's formatted read-only preview that a thin lane would crush (Spec 66).
//
// `selectedId` lives inside the master→detail drawer (deep in the tree), but the
// lane width + rail collapse live at the shell. This tiny context lets the drawer
// publish "detail open?" up to AppShell without prop-drilling — same pattern as
// the TopBar slots context.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface VersionsDetailContextValue {
  /** True while a version's detail (not the list) is open. */
  readonly isDetailOpen: boolean;
  readonly setDetailOpen: (open: boolean) => void;
}

const VersionsDetailContext = createContext<VersionsDetailContextValue | null>(
  null,
);

export function VersionsDetailProvider({ children }: { children: ReactNode }) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const setDetailOpen = useCallback((open: boolean) => {
    setIsDetailOpen((prev) => (prev === open ? prev : open));
  }, []);
  const value = useMemo<VersionsDetailContextValue>(
    () => ({ isDetailOpen, setDetailOpen }),
    [isDetailOpen, setDetailOpen],
  );
  return (
    <VersionsDetailContext.Provider value={value}>
      {children}
    </VersionsDetailContext.Provider>
  );
}

/** Read whether the Versions detail (vs. list) is open. AppShell uses it for the
 *  lane width + rail collapse. */
export function useVersionsDetailOpen(): boolean {
  return useContext(VersionsDetailContext)?.isDetailOpen ?? false;
}

/** Publish the detail-open state from the master→detail drawer while it is
 *  mounted; clears on unmount so a closed surface never leaves the rail collapsed. */
export function usePublishVersionsDetail(isDetailOpen: boolean): void {
  const ctx = useContext(VersionsDetailContext);
  const setDetailOpen = ctx?.setDetailOpen;
  useEffect(() => {
    if (!setDetailOpen) return;
    setDetailOpen(isDetailOpen);
    return () => setDetailOpen(false);
  }, [setDetailOpen, isDetailOpen]);
}
