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
  /** Push a ROUTED-kind surface (`cesare-peek` / `versions`) onto the shared
   *  history AS A NAVIGATION — like ←/→, it sets the nav-intent flag so the
   *  unified-split reconciler RE-ASSERTS the surface's URL param instead of
   *  reading the (transiently absent) param as an external close. Used to promote
   *  a routed surface INTO the host while a host kind (notifications / preview)
   *  is showing, so the previous surface survives as a ←back-step rather than the
   *  whole host collapsing (Bug 4b). For host kinds use `open`. */
  promoteRoutedSurface: (payload: SplitDrawerPayload) => void;
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
  /** Read-and-reset whether the active HOST payload was opened OVER a routed
   *  surface and so may evict the now-stale routed param (`clear-both`). The
   *  reconciler consumes this exactly once, when it issues `clear-both`, so a
   *  merely-stale host payload (cursor lingering while a routed param is being
   *  mirrored) never collapses the host (Bug 2). */
  consumeHostSupersede: () => boolean;
  /** Peek the host-supersede flag without resetting it (same peek-then-consume
   *  discipline as `peekNavIntent`). */
  peekHostSupersede: () => boolean;
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

/** A routed surface is one MIRRORED into the history from a URL param (its body
 *  is rendered by the URL-driven lane, not the host). `cesare-peek` / `versions`
 *  are routed; `preview` / `notifications` are HOST kinds (rendered in-place). */
function isRoutedKind(p: SplitDrawerPayload): boolean {
  return p.kind === "cesare-peek" || p.kind === "versions";
}

/**
 * Pure history-stack transition shared by `open` and `promoteRoutedSurface`
 * (DRY: one place owns "bring an existing entry forward, else push and drop the
 * forward tail"). Returns the NEXT history array and the cursor it should point
 * at — always a valid index into the returned array, so the cursor can never
 * drift out of range (Bug 4). Re-targeting an existing entry refreshes it in
 * place and jumps the cursor to it (no duplicate keys); a genuinely new entry is
 * appended after the live cursor, dropping any forward ("redo") entries.
 */
export function nextHistory(
  prev: ReadonlyArray<SplitDrawerPayload>,
  cursor: number,
  next: SplitDrawerPayload,
): { history: ReadonlyArray<SplitDrawerPayload>; cursor: number } {
  const key = payloadKey(next);
  const existingIdx = prev.findIndex((p) => payloadKey(p) === key);
  if (existingIdx !== -1) {
    const updated = prev.slice();
    updated[existingIdx] = next;
    return { history: updated, cursor: existingIdx };
  }
  // Clamp the splice point into range so a stale/out-of-range cursor can't
  // silently drop the whole stack (Bug 4 — degenerate history → collapse).
  const safeCursor = Math.min(Math.max(cursor, -1), prev.length - 1);
  const base = prev.slice(0, safeCursor + 1);
  const pushed = [...base, next];
  return { history: pushed, cursor: pushed.length - 1 };
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
  // Latest history length, mirrored into a ref so `forward` can clamp the cursor
  // without depending on `history` state (which would change its identity).
  const historyLengthRef = useRef(history.length);
  historyLengthRef.current = history.length;
  // Records that the LAST history mutation was a ←/→ navigation (vs an `open`).
  // The unified-split reconciler reads this to tell "navigated back to a routed
  // surface whose URL param is currently absent" (re-open it) apart from "the
  // surface's param was cleared externally" (close the host). `consumeNavIntent`
  // reads-and-resets it so each navigation is honoured exactly once (Spec 78 A6).
  const navIntentRef = useRef(false);
  // Records that the active HOST payload (notifications / preview) was just
  // opened OVER a routed surface and so legitimately owns the track — the URL→
  // history reconciler may drop a now-stale routed param (`clear-both`). Without
  // this, a host payload that is merely STALE (e.g. an older notifications entry
  // still the cursor while Versioni is being opened from a header button and its
  // `?versions` param is mid-mirror) would be MISREAD as "host owns the track,
  // drop the routed param" — `clear-both` then yanks the fresh param before
  // Effect 1 mirrors it, collapsing the whole host (Bug 2). So `open` ARMS this
  // flag only when it pushes a host kind; every routed mutation (`open` of a
  // routed kind, `promoteRoutedSurface`, ←/→) disarms it, and the reconciler
  // defers to Effect 1 (`none`) for any routed param it sees with the flag down.
  const hostSupersedeRef = useRef(false);

  const open = useCallback(
    (next: SplitDrawerPayload, target: SplitDrawerState = "open") => {
      // A host kind opened here OWNS the track and may evict a stale routed param;
      // a routed kind (mirrored from the URL by Effect 1) must NOT — it is the
      // param's destination, not its evictor. This is the seed of the Bug 2 fix.
      navIntentRef.current = false;
      hostSupersedeRef.current = !isRoutedKind(next);
      setHistory((prev) => {
        const result = nextHistory(prev, cursorRef.current, next);
        setCursor(result.cursor);
        return result.history;
      });
      setState(target);
    },
    [],
  );

  // Promote a routed surface into the host AS A NAVIGATION (Bug 4b). Same history
  // push as `open`, but it SETS `navIntentRef` so the reconciler re-asserts the
  // surface's URL param (rather than reading the not-yet-set param as an external
  // close → `close-host`, which collapsed the whole host). Mirrors the ←/→ intent.
  const promoteRoutedSurface = useCallback((next: SplitDrawerPayload) => {
    setHistory((prev) => {
      const result = nextHistory(prev, cursorRef.current, next);
      setCursor(result.cursor);
      return result.history;
    });
    setState("open");
    // Set AFTER the history mutation so it survives into the reconcile tick that
    // reads it (the setState calls above don't reset it). A promote is a routed
    // navigation, never a host supersede — disarm the clear-both authorisation.
    navIntentRef.current = true;
    hostSupersedeRef.current = false;
  }, []);

  const close = useCallback(() => {
    navIntentRef.current = false;
    hostSupersedeRef.current = false;
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
      hostSupersedeRef.current = false;
      return c - 1;
    });
  }, []);

  const forward = useCallback(() => {
    // Clamp at the end so a forward past the last entry can never push the cursor
    // out of range (Bug 4 — an out-of-range cursor nulls the payload and collapses
    // the host). `historyLengthRef` reads the LATEST length without re-creating the
    // callback (it must stay reference-stable for the unified-split effect deps).
    setCursor((c) => {
      if (c >= historyLengthRef.current - 1) return c;
      navIntentRef.current = true;
      hostSupersedeRef.current = false;
      return c + 1;
    });
  }, []);

  const consumeNavIntent = useCallback(() => {
    const was = navIntentRef.current;
    navIntentRef.current = false;
    return was;
  }, []);

  const peekNavIntent = useCallback(() => navIntentRef.current, []);

  // The reconciler PEEKS the host-supersede flag (like nav-intent) so a no-op
  // reconcile tick can't swallow it before the clear-both transition reads it,
  // and CONSUMES it only when it actually issues `clear-both`.
  const consumeHostSupersede = useCallback(() => {
    const was = hostSupersedeRef.current;
    hostSupersedeRef.current = false;
    return was;
  }, []);

  const peekHostSupersede = useCallback(() => hostSupersedeRef.current, []);

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
      promoteRoutedSurface,
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
      consumeHostSupersede,
      peekHostSupersede,
      hide,
      reopen,
      hasContent,
    }),
    [
      open,
      promoteRoutedSurface,
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
      consumeHostSupersede,
      peekHostSupersede,
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
  promoteRoutedSurface: () => undefined,
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
  consumeHostSupersede: () => false,
  peekHostSupersede: () => false,
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
