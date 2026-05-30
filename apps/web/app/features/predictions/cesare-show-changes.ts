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
