// apps/web/app/features/predictions/cesare-show-changes.ts
//
// Spec 47 task A6 — the "Mostra / Nascondi modifiche" control must work
// end-to-end, but WHAT it does depends on how Cesare is open:
//
//   - FLOATING / expanded — Cesare is a small bottom-right sub-window and the
//     edited document is fully visible behind it. "Mostra modifiche" flashes an
//     inline transient highlight ON the open document (Spec 47e: green additions;
//     "Nascondi modifiche" flashes the red previous text — a peek, not a revert).
//
//   - FULL page / SPLIT lane — Cesare either fills a right-anchored full-height
//     panel or lives in the collapsing peek lane. Either way the open document
//     is hidden or unreachable, so a live diff on <main> is meaningless. Instead
//     "Mostra modifiche" opens the routed SplitDrawer (A4's lane) showing the
//     trace's TARGET page with the diff overlay.
//
// This module owns ONLY that decision — a pure function so the branch is unit
// testable in isolation and the CesareSheet wiring stays a thin adapter.
// Modeled on Notion AI's "show changes" which inlines the diff when the doc is
// visible and pops a side panel when it is not.

import type {
  CesareDrawerState,
  TargetPageKind,
  TargetPageRef,
} from "@oh-writers/ui";
import type { CesarePage } from "./components/CesareSheet";

/**
 * Where "Mostra modifiche" surfaces the diff. Tagged so callers branch
 * exhaustively with ts-pattern and never fall through silently.
 */
export type ShowChangesSurface =
  | { readonly _tag: "live-diff" }
  | { readonly _tag: "split-drawer" };

/**
 * Inputs the decision needs. `surface` is the CesareSheet rendering surface
 * (floating bottom-right vs the routed split lane); `drawerState` is the
 * floating sub-window's 4(+1)-state machine.
 */
export interface ShowChangesContext {
  /** Rendering surface of the Cesare chat container. */
  readonly surface: "floating" | "split";
  /** The floating drawer's current state (ignored when `surface === "split"`). */
  readonly drawerState: CesareDrawerState;
}

/**
 * Decide where the diff is shown.
 *
 * The diff renders inline on the live document ONLY when the document is
 * actually visible behind the chat — i.e. the floating drawer in `expanded`
 * (or its transient `peek` / `expanded-split` resize states). In `full` the
 * panel is a right-anchored full-height surface that covers the document, and
 * in the `split` lane the page is collapsed away; both cases route the diff to
 * the SplitDrawer showing the affected page.
 */
export function decideShowChangesSurface(
  ctx: ShowChangesContext,
): ShowChangesSurface {
  if (ctx.surface === "split") return { _tag: "split-drawer" };
  if (ctx.drawerState === "full") return { _tag: "split-drawer" };
  return { _tag: "live-diff" };
}

// ─── Target-page mapping (split-drawer branch) ──────────────────────────────
//
// The SplitDrawer's TargetPagePreview is keyed by `TargetPageKind`, which uses
// IT-flavoured kinds (`sinossi`/`scaletta`/`trattamento`) and does not model
// schedule / shooting-plan. We map the Cesare page onto the closest preview
// kind so the split branch always has a page to render. Pages without a diff
// preview (schedule, shooting-plan) fall back to `null` — the caller keeps the
// floating live-diff behaviour for those rather than opening an empty drawer.

const PAGE_TO_TARGET_KIND: Record<CesarePage, TargetPageKind | null> = {
  soggetto: "soggetto",
  synopsis: "sinossi",
  outline: "scaletta",
  treatment: "trattamento",
  screenplay: "screenplay",
  breakdown: "breakdown",
  budget: "budget",
  locations: "locations",
  schedule: null,
  "shooting-plan": null,
};

const PAGE_TO_TARGET_TITLE: Record<CesarePage, string> = {
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
  screenplay: "Sceneggiatura",
  breakdown: "Breakdown",
  budget: "Budget",
  locations: "Location",
  schedule: "Calendario",
  "shooting-plan": "Piano Inquadrature",
};

/**
 * Build the `TargetPageRef` for the split-drawer branch from the page the
 * Cesare request ran on. Returns `null` when the page has no diff preview
 * (schedule / shooting-plan) so the caller can keep the live-diff fallback.
 */
export function buildTargetPageRef(
  page: CesarePage,
  scope?: string,
): TargetPageRef | null {
  const kind = PAGE_TO_TARGET_KIND[page];
  if (!kind) return null;
  return {
    kind,
    title: PAGE_TO_TARGET_TITLE[page],
    ...(scope ? { scope } : {}),
  };
}

// ─── Document-type mapping (the entity Cesare actually modified) ─────────────
//
// "Mostra modifiche" must follow the ENTITY Cesare edited, not the page the chat
// runs on (ADR-0001): a logline edit made from the Soggetto/session page must
// preview the LOGLINE, not the Soggetto. The live-diff marker carries the real
// `documentType` (e.g. "logline"); we map it to the preview kind + title.

const DOC_TYPE_TO_TARGET_KIND: Record<string, TargetPageKind> = {
  logline: "soggetto",
  soggetto: "soggetto",
  synopsis: "sinossi",
  outline: "scaletta",
  treatment: "trattamento",
};

const DOC_TYPE_TO_TARGET_TITLE: Record<string, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
};

/**
 * Build the `TargetPageRef` for the entity a live-diff marker touched. Returns
 * `null` for an unknown / empty document type so the caller can fall back to the
 * page-based ref. Logline maps onto the Soggetto preview kind (it lives there)
 * but keeps its own "Logline" title.
 */
export function buildTargetPageRefForDocument(
  documentType: string,
  scope?: string,
): TargetPageRef | null {
  const kind = DOC_TYPE_TO_TARGET_KIND[documentType];
  if (!kind) return null;
  return {
    kind,
    title: DOC_TYPE_TO_TARGET_TITLE[documentType] ?? kind,
    ...(scope ? { scope } : {}),
  };
}

// The router path (relative to `/projects/:id/`) for the page that hosts each
// edited entity's editor. Drives the result card's "Apri <Entity>" navigation.
// Covers the narrative documents AND the cross-domain entities Cesare can edit
// (locations, breakdown, budget, schedule, screenplay) so EVERY edit can jump to
// its page — new editable entities must be added here. Logline lives on its own
// route.
const ENTITY_TO_ROUTE: Record<string, string> = {
  logline: "logline",
  soggetto: "soggetto",
  synopsis: "synopsis",
  outline: "outline",
  treatment: "treatment",
  screenplay: "screenplay",
  breakdown: "breakdown",
  budget: "budget",
  schedule: "schedule",
  locations: "locations",
};

/** The `/projects/:id/<path>` route segment for an edited entity, or null when
 *  the entity has no dedicated page. */
export function documentRouteFor(documentType: string): string | null {
  return ENTITY_TO_ROUTE[documentType] ?? null;
}

// Which document type each Cesare page edits IN PLACE (the editor on that page).
// Logline lives on the Soggetto page (the logline pill), so a logline edit while
// on Soggetto is also "the open entity" — its feedback is the in-editor banner,
// not a split that duplicates it.
const PAGE_OPEN_DOC_TYPES: Partial<Record<CesarePage, readonly string[]>> = {
  soggetto: ["soggetto", "logline"],
  synopsis: ["synopsis"],
  outline: ["outline"],
  treatment: ["treatment"],
};

/** True when `documentType` is edited in place on `page` (so the split-preview
 *  would duplicate the open editor and should be skipped — Spec 63). */
export function documentTypeMatchesPage(
  documentType: string,
  page: CesarePage,
): boolean {
  return (PAGE_OPEN_DOC_TYPES[page] ?? []).includes(documentType);
}
