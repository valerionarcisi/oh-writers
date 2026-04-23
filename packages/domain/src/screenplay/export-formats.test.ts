import { describe, it, expect } from "vitest";
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_META,
  ExportFormatSchema,
} from "./export-formats.js";

describe("EXPORT_FORMATS", () => {
  it("has an entry in EXPORT_FORMAT_META for every format id", () => {
    for (const id of EXPORT_FORMATS) {
      expect(EXPORT_FORMAT_META[id]).toBeDefined();
      expect(EXPORT_FORMAT_META[id].id).toBe(id);
    }
  });

  it("requires scene selection only for 'sides'", () => {
    for (const id of EXPORT_FORMATS) {
      const requires = EXPORT_FORMAT_META[id].requiresSceneSelection;
      expect(requires).toBe(id === "sides");
    }
  });

  it("provides distinct filename slugs (or empty for standard)", () => {
    const slugs = EXPORT_FORMATS.map(
      (id) => EXPORT_FORMAT_META[id].filenameSlug,
    );
    expect(slugs).toContain("");
    const nonEmpty = slugs.filter((s) => s.length > 0);
    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
  });

  it("Zod schema accepts every known format", () => {
    for (const id of EXPORT_FORMATS) {
      expect(ExportFormatSchema.parse(id)).toBe(id);
    }
  });

  it("Zod schema rejects unknown formats", () => {
    expect(() => ExportFormatSchema.parse("shooting_script")).toThrow();
  });
});
