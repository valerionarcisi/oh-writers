import { describe, it, expect } from "vitest";
import {
  resolveContextActions,
  CONTEXT_ACTIONS,
  ContextActionIds,
} from "./context-actions.js";
import { Features } from "../features/flags.js";

describe("resolveContextActions", () => {
  // Spec 66: VERSIONS left the per-page ⋯ menu on every segment — it lives in
  // the TopBar version chip now. No menu may surface it.
  it("returns soggetto actions ordered, gating SIAE on the feature", () => {
    const withSiae = resolveContextActions(
      "soggetto",
      new Set([Features.SIAE_EXPORT]),
    );
    expect(withSiae.map((a) => a.id)).toEqual([
      ContextActionIds.EXPORT_DOCX,
      ContextActionIds.EXPORT_SIAE,
    ]);

    const withoutSiae = resolveContextActions("soggetto", new Set());
    expect(withoutSiae.map((a) => a.id)).toEqual([
      ContextActionIds.EXPORT_DOCX,
    ]);
  });

  it("returns export-only for every other narrative segment", () => {
    for (const segment of ["synopsis", "outline", "treatment"] as const) {
      expect(
        resolveContextActions(segment, new Set()).map((a) => a.id),
      ).toEqual([ContextActionIds.EXPORT_PDF]);
    }
  });

  it("returns screenplay export/import ordered (Spec 55a, no gate)", () => {
    expect(
      resolveContextActions("screenplay", new Set()).map((a) => a.id),
    ).toEqual([
      ContextActionIds.EXPORT_PDF,
      ContextActionIds.EXPORT_FOUNTAIN,
      ContextActionIds.IMPORT_PDF,
      ContextActionIds.IMPORT_FOUNTAIN,
    ]);
  });

  it("never surfaces VERSIONS in any segment's menu (Spec 66 — TopBar chip)", () => {
    for (const segment of Object.keys(CONTEXT_ACTIONS)) {
      expect(
        resolveContextActions(segment, new Set([Features.SIAE_EXPORT])).map(
          (a) => a.id,
        ),
      ).not.toContain(ContextActionIds.VERSIONS);
    }
  });

  it("returns export-only for the production pages (no versions) — Spec 67", () => {
    // breakdown + budget open their export modal via a single EXPORT action.
    for (const segment of ["breakdown", "budget"] as const) {
      expect(
        resolveContextActions(segment, new Set()).map((a) => a.id),
      ).toEqual([ContextActionIds.EXPORT]);
    }
    // schedule lists its two direct exports (CSV + PDF/Print).
    expect(
      resolveContextActions("schedule", new Set()).map((a) => a.id),
    ).toEqual([ContextActionIds.EXPORT_CSV, ContextActionIds.EXPORT_PDF]);
    // locations exports CSV only.
    expect(
      resolveContextActions("locations", new Set()).map((a) => a.id),
    ).toEqual([ContextActionIds.EXPORT_CSV]);
    // None of the production pages surface VERSIONS.
    for (const segment of [
      "breakdown",
      "budget",
      "schedule",
      "locations",
    ] as const) {
      expect(
        resolveContextActions(segment, new Set()).map((a) => a.id),
      ).not.toContain(ContextActionIds.VERSIONS);
    }
  });

  it("returns [] for logline (no standalone page) and unknown segments", () => {
    expect(resolveContextActions("logline", new Set())).toEqual([]);
    expect(resolveContextActions("nope", new Set())).toEqual([]);
  });

  it("sorts strictly by the order key, never registry insertion order", () => {
    const ordered = resolveContextActions("soggetto", new Set()).map(
      (a) => a.order,
    );
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  });

  it("never returns the registry's own array reference (no mutation leak)", () => {
    const result = resolveContextActions("synopsis", new Set());
    expect(result).not.toBe(CONTEXT_ACTIONS["synopsis"]);
  });
});
