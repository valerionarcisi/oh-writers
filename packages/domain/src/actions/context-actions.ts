// packages/domain/src/actions/context-actions.ts
//
// The per-page context-action registry (Spec 55 backbone). A declarative map
// `route segment → ordered action descriptors` — the single source of truth for
// "what can I do on this page". This is the narrow interface every page/feature
// uses to surface its actions in the TopBar action zone, so no page reinvents
// placement.
//
// The registry is PURE: it holds data + a pure resolver and lives in
// `packages/domain`, which must not import browser/router/React APIs. A
// descriptor declares WHAT an action is (stable id, label key, optional feature
// gate, order) — never HOW it runs. The web `useContextActions` hook layers
// runtime handlers + per-page enablement on top, so the same registry drives
// every surface (web today, the mobile companion later).

import type { Feature } from "../features/flags.js";
import type { TranslationKey } from "../i18n/keys.js";

/** Stable identifiers for every context action across the app. */
export const ContextActionIds = {
  EXPORT_PDF: "export-pdf",
  EXPORT_DOCX: "export-docx",
  EXPORT_FOUNTAIN: "export-fountain",
  EXPORT_SIAE: "export-siae",
  EXPORT_CSV: "export-csv",
  IMPORT_FOUNTAIN: "import-fountain",
  IMPORT_PDF: "import-pdf",
  VERSIONS: "versions",
} as const;

export type ContextActionId =
  (typeof ContextActionIds)[keyof typeof ContextActionIds];

/**
 * A declarative action descriptor — no handlers, no DOM. The `feature` gate, when
 * set, hides the action unless the resolved feature set includes it (Spec 54).
 * `order` is the stable sort key within a segment's menu (lower = earlier).
 */
export interface ContextActionDescriptor {
  readonly id: ContextActionId;
  readonly labelKey: TranslationKey;
  readonly feature?: Feature;
  readonly order: number;
}

/**
 * Route segment → ordered action descriptors. Scope here is the NARRATIVE
 * surface (Spec 55 Narrative Walk); production pages (budget/breakdown/schedule/
 * locations) and screenplay register their own segments in their own lanes
 * (N-28 / A5) — the resolver returns `[]` for any segment not declared here, so
 * a page that has not registered yet simply renders no context actions.
 */
export const CONTEXT_ACTIONS: Readonly<
  Record<string, ReadonlyArray<ContextActionDescriptor>>
> = {
  soggetto: [
    {
      id: ContextActionIds.EXPORT_DOCX,
      labelKey: "documents.editor.exportDocx",
      order: 10,
    },
    {
      id: ContextActionIds.EXPORT_SIAE,
      labelKey: "documents.editor.exportSiae",
      feature: "siaeExport",
      order: 20,
    },
    {
      id: ContextActionIds.VERSIONS,
      labelKey: "documents.editor.versions",
      order: 90,
    },
  ],
  synopsis: [
    {
      id: ContextActionIds.EXPORT_PDF,
      labelKey: "documents.editor.exportPdf",
      order: 10,
    },
    {
      id: ContextActionIds.VERSIONS,
      labelKey: "documents.editor.versions",
      order: 90,
    },
  ],
  outline: [
    {
      id: ContextActionIds.EXPORT_PDF,
      labelKey: "documents.editor.exportPdf",
      order: 10,
    },
    {
      id: ContextActionIds.VERSIONS,
      labelKey: "documents.editor.versions",
      order: 90,
    },
  ],
  treatment: [
    {
      id: ContextActionIds.EXPORT_PDF,
      labelKey: "documents.editor.exportPdf",
      order: 10,
    },
    {
      id: ContextActionIds.VERSIONS,
      labelKey: "documents.editor.versions",
      order: 90,
    },
  ],
} as const;

/**
 * Resolve the visible, ordered descriptors for a segment given the enabled
 * feature set. Pure — the web hook layers handlers + per-page enablement on top.
 * Returns a fresh array so callers can never mutate the registry. An unknown
 * segment resolves to `[]` (an unregistered page surfaces no context actions).
 */
export function resolveContextActions(
  segment: string,
  enabledFeatures: ReadonlySet<Feature>,
): ReadonlyArray<ContextActionDescriptor> {
  const set = CONTEXT_ACTIONS[segment] ?? [];
  return [...set]
    .filter((a) => a.feature === undefined || enabledFeatures.has(a.feature))
    .sort((a, b) => a.order - b.order);
}
