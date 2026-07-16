import { describe, it, expect } from "vitest";
import { buildScreenplayFilename } from "./pdf-screenplay";

describe("buildScreenplayFilename", () => {
  it("slugifies project and version into {serial}-{project}-{version}.pdf", () => {
    const filename = buildScreenplayFilename("Walkie Talkie", "Versione 1");
    expect(filename).toMatch(/^\d{8}-\d{4}-walkie-talkie-versione-1\.pdf$/);
  });

  it("appends the format slug when given", () => {
    const filename = buildScreenplayFilename(
      "Walkie Talkie",
      "Versione 1",
      "a4",
    );
    expect(filename).toMatch(/^\d{8}-\d{4}-walkie-talkie-versione-1-a4\.pdf$/);
  });

  it("omits the format segment when the slug is empty", () => {
    const filename = buildScreenplayFilename("Walkie Talkie", "Versione 1", "");
    expect(filename.endsWith("-a4.pdf")).toBe(false);
    expect(filename.endsWith("-versione-1.pdf")).toBe(true);
  });
});
