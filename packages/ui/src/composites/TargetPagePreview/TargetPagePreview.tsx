// packages/ui/src/composites/TargetPagePreview/TargetPagePreview.tsx
/**
 * TargetPagePreview — read-only embedded view of a target page rendered
 * inside the SplitDrawer body, with a trace overlay highlighting Cesare's
 * edits.
 *
 * Public contract per Spec 44 "Cross-component flow":
 *   - Each per-page route registers a `<PageTraceView pageRef />` renderer
 *     via {@link registerPageTraceView}. The lookup is done by `pageRef.kind`.
 *   - When a kind is not registered we render a "modalità trace" stub so
 *     the user still sees the timeline + raw markers.
 *   - The left rail is a sticky timeline that scrolls the body to the
 *     selected marker when clicked.
 *   - Markers paint inline overlays using the `--ds-diff-*` tokens.
 *
 * The component does NOT mutate any data — accept/reject is fully delegated
 * to the parent via `onAccept` / `onReject`.
 */

import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useButton } from "react-aria";
import styles from "./TargetPagePreview.module.css";

// ─── Public types ───────────────────────────────────────────────────────────

export type TargetPageKind =
  | "soggetto"
  | "sinossi"
  | "scaletta"
  | "trattamento"
  | "screenplay"
  | "breakdown"
  | "budget"
  | "locations";

export interface TargetPageRef {
  kind: TargetPageKind;
  /** Optional document / scene / row identifier. */
  id?: string;
  /** Optional scope hint (e.g. "Atto II", "Sc.2"). */
  scope?: string;
  /** Optional display title (fallback derived from kind). */
  title?: string;
}

export type TraceMarkerKind = "replace" | "append" | "rename" | "delete";

export interface TraceMarker {
  id: string;
  kind: TraceMarkerKind;
  /** Anchor label rendered in the timeline (e.g. "Atto II · §3"). */
  anchor: string;
  /** Optional before-text for `replace` / `rename` / `delete`. */
  before?: string;
  /** Optional after-text for `replace` / `append` / `rename`. */
  after?: string;
}

export interface TargetPagePreviewProps {
  pageRef: TargetPageRef;
  traceMarkers: ReadonlyArray<TraceMarker>;
  onAccept: (markerId: string) => void;
  onReject: (markerId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  testId?: string;
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Shape registered per page kind. The renderer receives the same props as
 * the top-level component (minus the accept/reject callbacks which are
 * still owned by the parent) and is expected to render a `mode="trace"`
 * version of the page body.
 *
 * Concrete page-body trace renderers live in the per-page feature folder;
 * this primitive only exposes the registry slot.
 */
export interface PageTraceViewProps {
  pageRef: TargetPageRef;
  traceMarkers: ReadonlyArray<TraceMarker>;
  onAccept: (markerId: string) => void;
  onReject: (markerId: string) => void;
}

export type PageTraceViewComponent = (props: PageTraceViewProps) => ReactNode;

const PAGE_TRACE_VIEW_REGISTRY = new Map<TargetPageKind, PageTraceViewComponent>();

/**
 * Register a per-page trace renderer. Idempotent: calling with the same
 * kind replaces the previous entry. Consumers typically register at
 * module load time inside `apps/web/app/features/app-shell/page-trace-registry.tsx`.
 */
export function registerPageTraceView(
  kind: TargetPageKind,
  view: PageTraceViewComponent,
): void {
  PAGE_TRACE_VIEW_REGISTRY.set(kind, view);
}

/** Read the registered view for a kind. Exported for tests. */
export function getPageTraceView(
  kind: TargetPageKind,
): PageTraceViewComponent | undefined {
  return PAGE_TRACE_VIEW_REGISTRY.get(kind);
}

const KIND_LABELS: Record<TargetPageKind, string> = {
  soggetto: "Soggetto",
  sinossi: "Sinossi",
  scaletta: "Scaletta",
  trattamento: "Trattamento",
  screenplay: "Sceneggiatura",
  breakdown: "Breakdown",
  budget: "Budget",
  locations: "Location",
};

const MARKER_GLYPHS: Record<TraceMarkerKind, string> = {
  replace: "↺",
  append: "+",
  rename: "✎",
  delete: "−",
};

const MARKER_LABELS: Record<TraceMarkerKind, string> = {
  replace: "replace",
  append: "append",
  rename: "rename",
  delete: "delete",
};

function markerGlyphStyle(kind: TraceMarkerKind, base: string | undefined): string {
  const safeBase = base ?? "";
  if (kind === "delete") return `${safeBase} ${styles.markerGlyphRemove ?? ""}`.trim();
  if (kind === "replace") return `${safeBase} ${styles.markerGlyphReplace ?? ""}`.trim();
  return safeBase;
}

// ─── Internal building blocks ───────────────────────────────────────────────

function TimelineButton({
  marker,
  onPress,
}: {
  marker: TraceMarker;
  onPress: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, "aria-label": `Vai a ${marker.anchor} (${MARKER_LABELS[marker.kind]})` },
    ref,
  );
  return (
    <button
      ref={ref}
      {...buttonProps}
      type="button"
      className={styles.markerBtn}
    >
      <span className={markerGlyphStyle(marker.kind, styles.markerGlyph)}>
        {MARKER_GLYPHS[marker.kind]}
      </span>
      <span>{marker.anchor}</span>
    </button>
  );
}

function MarkerBlock({
  marker,
  onAccept,
  onReject,
}: {
  marker: TraceMarker;
  onAccept: () => void;
  onReject: () => void;
}) {
  const blockClass = useMemo(() => {
    if (marker.kind === "delete") return `${styles.markerBlock} ${styles.markerBlockRemove}`;
    if (marker.kind === "append") return `${styles.markerBlock} ${styles.markerBlockAdd}`;
    if (marker.kind === "rename") return `${styles.markerBlock} ${styles.markerBlockReplace}`;
    return `${styles.markerBlock} ${styles.markerBlockReplace}`;
  }, [marker.kind]);

  return (
    <div
      className={blockClass}
      id={`trace-marker-${marker.id}`}
      data-marker-kind={marker.kind}
    >
      <div className={styles.markerHeader}>
        <span>{MARKER_LABELS[marker.kind]}</span>
        <span>·</span>
        <span>{marker.anchor}</span>
      </div>
      {marker.kind === "append" && marker.after && (
        <div className={styles.markerAfter}>{marker.after}</div>
      )}
      {marker.kind === "delete" && marker.before && (
        <div className={styles.markerBefore}>{marker.before}</div>
      )}
      {(marker.kind === "replace" || marker.kind === "rename") && (
        <>
          {marker.before && (
            <div className={styles.markerBefore}>{marker.before}</div>
          )}
          {marker.after && (
            <div className={styles.markerAfter}>{marker.after}</div>
          )}
        </>
      )}
      <div className={styles.markerActions}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionAccept}`}
          onClick={onAccept}
          aria-label={`Accetta ${MARKER_LABELS[marker.kind]} ${marker.anchor}`}
        >
          Accetta
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionReject}`}
          onClick={onReject}
          aria-label={`Rifiuta ${MARKER_LABELS[marker.kind]} ${marker.anchor}`}
        >
          Rifiuta
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function TargetPagePreview({
  pageRef,
  traceMarkers,
  onAccept,
  onReject,
  onAcceptAll: _onAcceptAll,
  onRejectAll: _onRejectAll,
  testId,
}: TargetPagePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  const scrollToMarker = useCallback((markerId: string) => {
    const root = previewRef.current;
    if (!root) return;
    const node = root.querySelector<HTMLElement>(`#trace-marker-${markerId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const RegisteredView = getPageTraceView(pageRef.kind);
  const pageTitle = pageRef.title ?? KIND_LABELS[pageRef.kind];

  return (
    <div className={styles.root} data-testid={testId ?? "target-page-preview"}>
      <aside className={styles.timeline} aria-label="Trace timeline">
        <span className={styles.timelineLabel}>Modifiche</span>
        {traceMarkers.length === 0 ? (
          <p className={styles.empty}>Nessuna modifica</p>
        ) : (
          traceMarkers.map((marker) => (
            <TimelineButton
              key={marker.id}
              marker={marker}
              onPress={() => scrollToMarker(marker.id)}
            />
          ))
        )}
      </aside>

      <div ref={previewRef} className={styles.preview}>
        <div className={styles.previewHeader}>
          <span className={styles.previewBadge}>
            {pageRef.scope ? `${KIND_LABELS[pageRef.kind]} · ${pageRef.scope}` : KIND_LABELS[pageRef.kind]}
          </span>
          <h2 className={styles.previewTitle}>{pageTitle}</h2>
          <span className={styles.previewBadge}>modalità trace</span>
        </div>

        {RegisteredView ? (
          <RegisteredView
            pageRef={pageRef}
            traceMarkers={traceMarkers}
            onAccept={onAccept}
            onReject={onReject}
          />
        ) : (
          <div className={styles.stub}>
            <strong>Anteprima trace</strong>
            <span>
              Nessun renderer registrato per <code>{pageRef.kind}</code>. Le
              modifiche sono elencate qui sotto.
            </span>
          </div>
        )}

        {/* Even when a registered renderer is provided we ALSO list the
            markers so the parent can switch between "page body" + "raw list"
            without re-mounting. The registered renderer is expected to
            render the actual page body; we render the marker cards below
            it as a fallback / supplement. The per-page renderer can hide
            them if it embeds the markers inline. */}
        {!RegisteredView && traceMarkers.map((marker) => (
          <MarkerBlock
            key={marker.id}
            marker={marker}
            onAccept={() => onAccept(marker.id)}
            onReject={() => onReject(marker.id)}
          />
        ))}
      </div>
    </div>
  );
}
