// apps/web/app/features/app-shell/split-drawer-context.tsx
/**
 * SplitDrawerContext — single shell-level provider that lets any feature
 * open the right-anchored `SplitDrawer` (Spec 44 cross-component flow).
 *
 * The shell mounts the actual `<SplitDrawer>` once and renders the active
 * payload's title/body/footer based on the payload `kind`:
 *
 *   - `trace` — Cesare's `[Mostra modifiche]` flow, hosts a
 *     `<TargetPagePreview>` of the affected page.
 *   - `notifications` — Bell drawer, hosts the Cesare notification list.
 *
 * Typical callers:
 *
 * ```ts
 * // Cesare Step Block: open the trace flow.
 * const { open } = useSplitDrawer();
 * open({
 *   kind: 'trace',
 *   pageRef: { kind: 'soggetto', scope: 'Atto II' },
 *   traceMarkers,
 *   onAccept,
 *   onReject,
 *   onAcceptAll,
 *   onRejectAll,
 *   title: 'Soggetto · Atto II',
 * });
 *
 * // BottomDock / Cesare header bell: open the notification centre.
 * open({ kind: 'notifications' });
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

/**
 * Payload describing Cesare's `[Mostra modifiche]` trace flow — the
 * SplitDrawer body renders a `<TargetPagePreview>` of the affected page.
 */
export interface SplitDrawerTracePayload {
  kind: "trace";
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

/**
 * Payload opening the bell notification centre. The drawer body lists
 * every completed Cesare run; clicking a row pulses the affected entities
 * and navigates to the originating page.
 */
export interface SplitDrawerNotificationsPayload {
  kind: "notifications";
  /** Optional override; defaults to "Notifiche". */
  title?: string;
}

/**
 * Payload opening a Cesare session's context surface from the LeftRail.
 * Spec 44 sessions menu: clicking a session row opens Cesare to `full` and
 * lifts the page/scope/entities the session touched into a SplitDrawer.
 * The trace payload is intentionally minimal for now — once we persist
 * per-session entity references this becomes a richer view.
 */
export interface SplitDrawerSessionContextPayload {
  kind: "session-context";
  /** The session id this drawer reflects. */
  sessionId: string;
  /** Session title used as the SplitDrawer header. */
  title: string;
}

/**
 * Discriminated union of every payload the shell-level SplitDrawer can
 * host. New kinds (versions, document browser) get added here.
 */
export type SplitDrawerPayload =
  | SplitDrawerTracePayload
  | SplitDrawerNotificationsPayload
  | SplitDrawerSessionContextPayload;

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

/**
 * Shared opener for the bell entry-points (BottomDock when Cesare is
 * `closed`, Cesare header `dockIcons.onBell` when state ≠ closed). Keeping
 * the helper here guarantees both call sites reach the same SplitDrawer
 * instance.
 *
 * Returns a stable callback; safe to pass into `BottomDock`/`CesareDrawer`
 * props or to memoise further with `useMemo`.
 */
export function useBellOpener(): () => void {
  const { open } = useSplitDrawer();
  return useCallback(() => {
    open({ kind: "notifications" });
  }, [open]);
}
