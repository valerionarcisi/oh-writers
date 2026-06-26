// apps/web/app/features/app-shell/split-drawer-context.tsx
/**
 * SplitDrawerContext — single shell-level provider that lets any feature
 * open the right-anchored `SplitDrawer` (Spec 44 cross-component flow).
 *
 * The shell mounts the actual `<SplitDrawer>` once and renders the active
 * payload's title/body/footer based on the payload `kind`:
 *
 *   - `preview` — Cesare's `[Mostra modifiche]` flow from inside a chat session,
 *     hosts a READ-ONLY view of the affected page with the change highlighted
 *     inline (no accept/reject — the edit is already applied; ADR-0001).
 *   - `notifications` — Bell drawer, hosts the Cesare notification list.
 *
 * Typical callers:
 *
 * ```ts
 * // Cesare Step Block (in a chat session): open the read-only preview.
 * const { open } = useSplitDrawer();
 * open({
 *   kind: 'preview',
 *   pageRef: { kind: 'soggetto', scope: 'Atto II' },
 *   liveDiffs,
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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TargetPageRef, SplitDrawerState } from "@oh-writers/ui";
import type { LiveDiffSegment } from "./cesare-live-diff-store";

/**
 * Read-only diff to render per touched document inside the preview body.
 * Mirrors a `LiveDiffMarker` — the same `diff_segments` the in-editor highlight
 * uses, so the preview and the inline flash paint the same change.
 */
export interface SplitDrawerPreviewDiff {
  readonly documentType: string;
  readonly label: string;
  readonly segments: ReadonlyArray<LiveDiffSegment>;
}

/**
 * Payload describing Cesare's `[Mostra modifiche]` preview flow — the
 * SplitDrawer body renders a **read-only** view of the affected page with the
 * change highlighted inline. There is NO accept/reject: a Cesare edit is always
 * applied live (CONTEXT.md / ADR-0001); the preview only lets the writer look at
 * the modified page beside the conversation. Used only from inside a chat
 * session.
 */
export interface SplitDrawerPreviewPayload {
  kind: "preview";
  /** Reference to the target page rendered (read-only) in the drawer body. */
  pageRef: TargetPageRef;
  /** Per-document diffs to highlight in the preview body. */
  liveDiffs: ReadonlyArray<SplitDrawerPreviewDiff>;
  /** Optional header title; defaults to `pageRef.title` or kind label. */
  title?: string;
  /** Short human summary of what changed (Cesare's "Cosa cambia" reply prose),
   *  shown at the top of the preview only — Claude-Desktop-style artifact header. */
  summary?: string;
  /** Stable identity for history dedupe (re-opening the same content brings the
   *  existing entry forward instead of duplicating it). Defaults to
   *  kind+pageRef. */
  dedupeKey?: string;
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
  /** Stable identity for history dedupe. Defaults to the kind. */
  dedupeKey?: string;
}

/**
 * Payload mirroring the routed Cesare PEEK column (`?peek=cesare`) into the
 * shared history. Unlike `preview` / `notifications`, the body is NOT rendered
 * by the shell SplitDrawer host: the lane is still `CesarePeekLane` driven by
 * the URL param. This entry is a NAVIGATION RECORD — it lets the one auxiliary
 * track be navigable across Cesare ↔ Versioni ↔ Notifiche with a single ←/→
 * history (Spec 78 A6). The shell reconciles the active payload back to the URL.
 */
export interface SplitDrawerCesarePeekPayload {
  kind: "cesare-peek";
  /** Stable identity for history dedupe. Defaults to the kind. */
  dedupeKey?: string;
}

/**
 * Payload mirroring the routed Versions surface (`?versions=<documentId>`) into
 * the shared history. Like `cesare-peek`, the body is rendered by the URL-driven
 * `VersionsSplitLane` (so the A3/A4 master→detail UI is untouched); this entry
 * only carries the routed-surface coordinates so the shell can reconcile it back
 * to the URL when the user navigates the shared history (←/→). Spec 78 A6.
 */
export interface SplitDrawerVersionsPayload {
  kind: "versions";
  /** The versioned entity id (the `?versions=` value). */
  documentId: string;
  /** `?vcur=` companion — the current baseline version id, if known. */
  currentVersionId?: string | null;
  /** `?vkind=` companion — `screenplay` versions a screenplay, else narrative. */
  versionKind?: string | null;
  /** Stable identity for history dedupe. Defaults to `versions:<documentId>`. */
  dedupeKey?: string;
}

/**
 * Discriminated union of every payload the shell-level SplitDrawer can
 * host. `preview` / `notifications` are rendered by the host body; `cesare-peek`
 * / `versions` are navigation records mirroring the routed lanes so the single
 * auxiliary track is navigable with one shared ←/→ history (Spec 78 A6).
 */
export type SplitDrawerPayload =
  | SplitDrawerPreviewPayload
  | SplitDrawerNotificationsPayload
  | SplitDrawerCesarePeekPayload
  | SplitDrawerVersionsPayload;

interface SplitDrawerContextValue {
  /** Open the drawer with a new content — pushes it onto the history and shows
   *  it. A content identical (by `dedupeKey`) to one already in the history is
   *  brought forward instead of duplicated. */
  open: (payload: SplitDrawerPayload, target?: SplitDrawerState) => void;
  /** Close the drawer and clear the whole history. */
  close: () => void;
  /** Current state. */
  state: SplitDrawerState;
  /** Imperatively set state (cycle / stepBack). */
  setState: (next: SplitDrawerState) => void;
  /** Currently-shown content, or `null` when closed/hidden. */
  payload: SplitDrawerPayload | null;
  /** Go to the previous content in the history (no-op at the start). */
  back: () => void;
  /** Go to the next content in the history (no-op at the end). */
  forward: () => void;
  /** Whether a previous / next content exists (drives ←/→ enabled state). */
  canGoBack: boolean;
  canGoForward: boolean;
  /** Read-and-reset whether the last history mutation was a ←/→ navigation.
   *  Lets the unified-split reconciler distinguish "navigated to a routed
   *  surface" (re-assert its URL param) from "the param was cleared externally"
   *  (close the host). Consumed exactly once per navigation (Spec 78 A6). */
  consumeNavIntent: () => boolean;
  /** Read the nav-intent flag WITHOUT resetting it. The reconciler peeks first
   *  so a no-op reconcile tick (a transient render that resolves to `none`)
   *  cannot swallow the intent before the real transition consumes it — that
   *  swallow broke ←/→ back to Cesare while a sibling routed param lingered. */
  peekNavIntent: () => boolean;
  /** Collapse the lane but KEEP the history, so the ⊟ toggle can re-open the last
   *  content. (vs `close`, which destroys the history.) */
  hide: () => void;
  /** Re-open the most-recent content after a `hide`. No-op when there is none. */
  reopen: () => void;
  /** True when there is history to re-open (drives the ⊟ toggle's enabled state). */
  hasContent: boolean;
}

const SplitDrawerContext = createContext<SplitDrawerContextValue | null>(null);

/**
 * Stable identity for a payload so re-opening the SAME content brings the
 * existing history entry forward instead of pushing a duplicate. Callers may
 * provide an explicit `dedupeKey`; otherwise we derive one from the kind + the
 * distinguishing fields.
 */
function payloadKey(p: SplitDrawerPayload): string {
  if (p.dedupeKey) return p.dedupeKey;
  if (p.kind === "preview") {
    return `preview:${p.pageRef.kind}:${p.pageRef.scope ?? ""}`;
  }
  if (p.kind === "versions") {
    return `versions:${p.documentId}`;
  }
  return p.kind;
}

export function SplitDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SplitDrawerState>("closed");
  // History stack of contents shown in the drawer + the cursor into it. Only one
  // content is visible at a time (history[cursor]); ←/→ move the cursor.
  const [history, setHistory] = useState<ReadonlyArray<SplitDrawerPayload>>([]);
  const [cursor, setCursor] = useState(-1);
  // Mirror the cursor into a ref so `open` reads the LATEST value without closing
  // over `cursor` state. `open` must stay REFERENCE-STABLE: the unified-split
  // mirror effect (use-unified-split-navigation) lists it as a dep, and if `open`
  // changed identity on every cursor move the effect would re-fire and re-dedupe
  // the active payload to its old index — snapping a forward navigation back.
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  // Records that the LAST history mutation was a ←/→ navigation (vs an `open`).
  // The unified-split reconciler reads this to tell "navigated back to a routed
  // surface whose URL param is currently absent" (re-open it) apart from "the
  // surface's param was cleared externally" (close the host). `consumeNavIntent`
  // reads-and-resets it so each navigation is honoured exactly once (Spec 78 A6).
  const navIntentRef = useRef(false);

  const open = useCallback(
    (next: SplitDrawerPayload, target: SplitDrawerState = "open") => {
      navIntentRef.current = false;
      setHistory((prev) => {
        const key = payloadKey(next);
        const existingIdx = prev.findIndex((p) => payloadKey(p) === key);
        if (existingIdx !== -1) {
          // Same content already in history — refresh it in place and jump to it
          // (bring it forward) rather than pushing a duplicate.
          const updated = prev.slice();
          updated[existingIdx] = next;
          setCursor(existingIdx);
          return updated;
        }
        // New content: drop any "forward" entries past the cursor, then push.
        const base = prev.slice(0, cursorRef.current + 1);
        const pushed = [...base, next];
        setCursor(pushed.length - 1);
        return pushed;
      });
      setState(target);
    },
    [],
  );

  const close = useCallback(() => {
    navIntentRef.current = false;
    setState("closed");
    setHistory([]);
    setCursor(-1);
  }, []);

  const hide = useCallback(() => {
    // Collapse the lane but keep the history so the ⊟ toggle can re-open it.
    setState("closed");
  }, []);

  const reopen = useCallback(() => {
    setState((s) => (s === "closed" ? "open" : s));
  }, []);

  const back = useCallback(() => {
    setCursor((c) => {
      if (c <= 0) return c;
      navIntentRef.current = true;
      return c - 1;
    });
  }, []);

  const forward = useCallback(() => {
    setCursor((c) => {
      navIntentRef.current = true;
      return c + 1;
    });
  }, []);

  const consumeNavIntent = useCallback(() => {
    const was = navIntentRef.current;
    navIntentRef.current = false;
    return was;
  }, []);

  const peekNavIntent = useCallback(() => navIntentRef.current, []);

  // Content shows only when the lane is open AND the cursor points at an entry.
  // While hidden (`state === "closed"`) the history survives but `payload` is
  // null, so the lane unmounts and the page un-compresses.
  const hasContent = cursor >= 0 && cursor < history.length;
  const payload = hasContent && state !== "closed" ? history[cursor]! : null;
  const canGoBack = cursor > 0;
  const canGoForward = cursor >= 0 && cursor < history.length - 1;

  const value = useMemo<SplitDrawerContextValue>(
    () => ({
      open,
      close,
      state,
      setState,
      payload,
      back,
      forward,
      canGoBack,
      canGoForward,
      consumeNavIntent,
      peekNavIntent,
      hide,
      reopen,
      hasContent,
    }),
    [
      open,
      close,
      state,
      setState,
      payload,
      back,
      forward,
      canGoBack,
      canGoForward,
      consumeNavIntent,
      peekNavIntent,
      hide,
      reopen,
      hasContent,
    ],
  );

  return (
    <SplitDrawerContext.Provider value={value}>
      {children}
    </SplitDrawerContext.Provider>
  );
}

const INERT_SPLIT_DRAWER: SplitDrawerContextValue = {
  open: () => undefined,
  close: () => undefined,
  state: "closed",
  setState: () => undefined,
  payload: null,
  back: () => undefined,
  forward: () => undefined,
  canGoBack: false,
  canGoForward: false,
  consumeNavIntent: () => false,
  peekNavIntent: () => false,
  hide: () => undefined,
  reopen: () => undefined,
  hasContent: false,
};

/**
 * Read the SplitDrawerContext. Returns a stable `noop`-flavoured value
 * when no provider is mounted so isolated callers stay safe.
 */
export function useSplitDrawer(): SplitDrawerContextValue {
  const ctx = useContext(SplitDrawerContext);
  return ctx ?? INERT_SPLIT_DRAWER;
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
