// apps/web/app/features/app-shell/split-drawer-context.tsx
/**
 * SplitDrawerContext — single shell-level provider that lets any feature
 * open the right-anchored `SplitDrawer` (Spec 44 cross-component flow).
 *
 * The shell mounts the actual `<SplitDrawer>` once and renders the active
 * payload's title/markers/children. Feature code only needs to call
 * `useSplitDrawer().open(payload)`.
 *
 * Typical caller — the inline `[Mostra modifiche]` button inside a Cesare
 * Step Block:
 *
 * ```ts
 * const { open } = useSplitDrawer();
 * open({
 *   pageRef: { kind: 'soggetto', scope: 'Atto II' },
 *   traceMarkers,
 *   onAccept,
 *   onReject,
 *   onAcceptAll,
 *   onRejectAll,
 *   title: 'Soggetto · Atto II',
 * });
 * ```
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  TargetPageRef,
  TraceMarker,
  SplitDrawerState,
} from "@oh-writers/ui";

export interface SplitDrawerPayload {
  /** Reference to the target page rendered in the drawer body. */
  pageRef: TargetPageRef;
  /** Trace markers to overlay on the embedded page. */
  traceMarkers: ReadonlyArray<TraceMarker>;
  /** Accept a single marker. */
  onAccept: (markerId: string) => void;
  /** Reject a single marker. */
  onReject: (markerId: string) => void;
  /** Accept every pending marker. */
  onAcceptAll: () => void;
  /** Reject every pending marker. */
  onRejectAll: () => void;
  /** Optional header title; defaults to `pageRef.title` or kind label. */
  title?: string;
}

interface SplitDrawerContextValue {
  /** Open the drawer with a new payload. Resets state to `open`. */
  open: (payload: SplitDrawerPayload, target?: SplitDrawerState) => void;
  /** Close the drawer and clear the payload. */
  close: () => void;
  /** Current state. */
  state: SplitDrawerState;
  /** Imperatively set state (cycle / stepBack). */
  setState: (next: SplitDrawerState) => void;
  /** Current payload, or `null` when closed. */
  payload: SplitDrawerPayload | null;
}

const SplitDrawerContext = createContext<SplitDrawerContextValue | null>(null);

export function SplitDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SplitDrawerState>("closed");
  const [payload, setPayload] = useState<SplitDrawerPayload | null>(null);

  const open = useCallback(
    (next: SplitDrawerPayload, target: SplitDrawerState = "open") => {
      setPayload(next);
      setState(target);
    },
    [],
  );

  const close = useCallback(() => {
    setState("closed");
    setPayload(null);
  }, []);

  const value = useMemo<SplitDrawerContextValue>(
    () => ({
      open,
      close,
      state,
      setState,
      payload,
    }),
    [open, close, state, payload],
  );

  return (
    <SplitDrawerContext.Provider value={value}>
      {children}
    </SplitDrawerContext.Provider>
  );
}

/**
 * Read the SplitDrawerContext. Returns a stable `noop`-flavoured value
 * when no provider is mounted so isolated callers stay safe.
 */
export function useSplitDrawer(): SplitDrawerContextValue {
  const ctx = useContext(SplitDrawerContext);
  if (ctx) return ctx;
  // SSR / isolated callers — return inert handlers.
  return {
    open: () => undefined,
    close: () => undefined,
    state: "closed",
    setState: () => undefined,
    payload: null,
  };
}
