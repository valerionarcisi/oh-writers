import { describe, it, expect } from "vitest";
import {
  resolveContextActions,
  CONTEXT_ACTIONS,
  ContextActionIds,
} from "./context-actions.js";
import { Features } from "../features/flags.js";

describe("resolveContextActions", () => {
  it("returns soggetto actions ordered, gating SIAE on the feature", () => {
    const withSiae = resolveContextActions(
      "soggetto",
      new Set([Features.SIAE_EXPORT]),
    );
    expect(withSiae.map((a) => a.id)).toEqual([
      ContextActionIds.EXPORT_DOCX,
      ContextActionIds.EXPORT_SIAE,
      ContextActionIds.VERSIONS,
    ]);

    const withoutSiae = resolveContextActions("soggetto", new Set());
    expect(withoutSiae.map((a) => a.id)).toEqual([
      ContextActionIds.EXPORT_DOCX,
      ContextActionIds.VERSIONS,
    ]);
  });

  it("returns export + versions for every other narrative segment", () => {
    for (const segment of ["synopsis", "outline", "treatment"] as const) {
      expect(
        resolveContextActions(segment, new Set()).map((a) => a.id),
      ).toEqual([ContextActionIds.EXPORT_PDF, ContextActionIds.VERSIONS]);
    }
  });

  it("returns screenplay export/import/versions ordered (Spec 55a, no gate)", () => {
    expect(
      resolveContextActions("screenplay", new Set()).map((a) => a.id),
    ).toEqual([
      ContextActionIds.EXPORT_PDF,
      ContextActionIds.EXPORT_FOUNTAIN,
      ContextActionIds.IMPORT_PDF,
      ContextActionIds.IMPORT_FOUNTAIN,
      ContextActionIds.VERSIONS,
    ]);
  });

  it("returns [] for an unknown segment", () => {
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
