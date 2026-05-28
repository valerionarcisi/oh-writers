// apps/web/app/features/app-shell/page-trace-registry.tsx
/**
 * Per-page trace renderer registry (Spec 44).
 *
 * Each per-page route exports a `<PageTraceView pageRef />` component that
 * renders the page body in read-only `mode="trace"` with Cesare's edits
 * highlighted inline. The registry is the single lookup table consumed by
 * `<TargetPagePreview>` inside the SplitDrawer.
 *
 * For now this module ships STUB renderers for every spec-44 page kind so
 * the cross-component flow works end-to-end. WP-C / WP-LEAD will replace
 * each stub with the real `mode="trace"` body in a follow-up.
 *
 * Importing this module triggers the side-effecting `registerPageTraceView`
 * calls; it is imported once from the AppShell. Do not import it
 * recursively from per-page modules — it stays a leaf side-effect.
 */

import type { ReactNode } from "react";
import {
  registerPageTraceView,
  type PageTraceViewComponent,
  type TraceMarker,
} from "@oh-writers/ui";

const KIND_LABELS = {
  soggetto: "Soggetto",
  sinossi: "Sinossi",
  scaletta: "Scaletta",
  trattamento: "Trattamento",
  screenplay: "Sceneggiatura",
  breakdown: "Breakdown",
  budget: "Budget",
  locations: "Location",
} as const;

const MARKER_GLYPHS: Record<TraceMarker["kind"], string> = {
  replace: "↺",
  append: "+",
  rename: "✎",
  delete: "−",
};

const MARKER_LABELS: Record<TraceMarker["kind"], string> = {
  replace: "replace",
  append: "append",
  rename: "rename",
  delete: "delete",
};

/**
 * Minimal stub renderer. Shows a header that hints at the registered view
 * and a list of marker cards with accept/reject buttons. The styling stays
 * minimal so the real renderer can replace it without restructuring the
 * surrounding SplitDrawer body.
 */
function buildStubRenderer(kind: keyof typeof KIND_LABELS): PageTraceViewComponent {
  const Renderer: PageTraceViewComponent = ({ pageRef, traceMarkers, onAccept, onReject }) => {
    const label = pageRef.scope
      ? `${KIND_LABELS[kind]} · ${pageRef.scope}`
      : KIND_LABELS[kind];

    const list: ReactNode = traceMarkers.length === 0 ? (
      <p
        style={{
          padding: "12px 14px",
          color: "var(--ds-text-faint)",
          fontSize: 12.5,
        }}
      >
        Nessuna modifica.
      </p>
    ) : (
      traceMarkers.map((marker) => (
        <article
          key={marker.id}
          id={`trace-marker-${marker.id}`}
          data-marker-kind={marker.kind}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 12px",
            margin: "10px 0",
            borderRadius: "var(--ds-radius-md)",
            background:
              marker.kind === "delete"
                ? "var(--ds-diff-remove-bg)"
                : marker.kind === "append"
                  ? "var(--ds-diff-add-bg)"
                  : "var(--ds-diff-change-bg)",
            borderInlineStart: `3px solid var(${
              marker.kind === "delete"
                ? "--ds-diff-remove-fg"
                : marker.kind === "append"
                  ? "--ds-diff-add-fg"
                  : "--ds-diff-intra"
            })`,
            scrollMarginBlockStart: 80,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 10.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ds-text-faint)",
            }}
          >
            <span aria-hidden="true">{MARKER_GLYPHS[marker.kind]}</span>
            <span>{MARKER_LABELS[marker.kind]}</span>
            <span>·</span>
            <span>{marker.anchor}</span>
          </div>
          {marker.before && (
            <div
              style={{
                textDecoration: "line-through",
                color: "var(--ds-text-2)",
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              {marker.before}
            </div>
          )}
          {marker.after && (
            <div style={{ color: "var(--ds-text)", fontSize: 13 }}>
              {marker.after}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginBlockStart: 4 }}>
            <button
              type="button"
              onClick={() => onAccept(marker.id)}
              style={{
                fontSize: 11.5,
                padding: "3px 10px",
                border: "1px solid var(--ds-diff-add-fg)",
                color: "var(--ds-agent)",
                background: "transparent",
                borderRadius: "var(--ds-radius-sm)",
                cursor: "pointer",
              }}
            >
              Accetta
            </button>
            <button
              type="button"
              onClick={() => onReject(marker.id)}
              style={{
                fontSize: 11.5,
                padding: "3px 10px",
                border: "1px solid var(--ds-diff-remove-fg)",
                color: "var(--ds-danger)",
                background: "transparent",
                borderRadius: "var(--ds-radius-sm)",
                cursor: "pointer",
              }}
            >
              Rifiuta
            </button>
          </div>
        </article>
      ))
    );

    return (
      <section data-testid={`trace-view-${kind}`}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "var(--ds-surface-alt)",
            borderRadius: "var(--ds-radius-sm)",
            marginBlockEnd: 12,
            fontSize: 12,
            color: "var(--ds-text-3)",
          }}
        >
          <span aria-hidden="true">★</span>
          <strong style={{ color: "var(--ds-text)" }}>{label}</strong>
          <span>· modalità trace</span>
        </header>
        {list}
      </section>
    );
  };
  (Renderer as { displayName?: string }).displayName = `PageTraceView(${kind})`;
  return Renderer;
}

let hasRegistered = false;

/**
 * Eagerly register every stub renderer. Safe to call multiple times — the
 * registry overwrites the existing entry if any.
 */
export function ensurePageTraceRegistry(): void {
  if (hasRegistered) return;
  for (const kind of Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>) {
    registerPageTraceView(kind, buildStubRenderer(kind));
  }
  hasRegistered = true;
}
