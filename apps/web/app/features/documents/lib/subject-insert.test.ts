import { describe, it, expect } from "vitest";
import { SOGGETTO_INITIAL_TEMPLATE } from "@oh-writers/domain";
import { insertSectionBody } from "./subject-insert";

describe("insertSectionBody", () => {
  it("inserts a body under the matching IT-labeled heading in the template", () => {
    // Simulate the IT-labeled template (localized in the route).
    const it =
      "## Premessa\n\n## Protagonista & antagonista\n\n## Arco narrativo\n\n## Mondo\n\n## Finale\n";
    const out = insertSectionBody(it, "premise", "Testo X");
    expect(out).toContain("## Premessa");
    expect(out).toContain("Testo X");
    const premiseIdx = out.indexOf("Testo X");
    const protagonistIdx = out.indexOf("## Protagonista");
    expect(premiseIdx).toBeLessThan(protagonistIdx);
  });

  it("replaces the existing body of the section", () => {
    const md =
      "## Premessa\n\nVecchio testo.\n\n## Protagonista & antagonista\n\n";
    const out = insertSectionBody(md, "premise", "Nuovo testo.");
    expect(out).toContain("Nuovo testo.");
    expect(out).not.toContain("Vecchio testo.");
    expect(out).toContain("## Protagonista & antagonista");
  });

  it("returns the original content unchanged when the heading is missing", () => {
    const md = "## Finale\n\nFine.\n";
    const out = insertSectionBody(md, "premise", "Testo.");
    expect(out).toBe(md);
  });

  it("matches the English heading variant when present (template default)", () => {
    const out = insertSectionBody(
      SOGGETTO_INITIAL_TEMPLATE,
      "premise",
      "Generated.",
    );
    expect(out).toContain("## Premise");
    expect(out).toContain("Generated.");
    const generatedIdx = out.indexOf("Generated.");
    const protagonistIdx = out.indexOf("## Protagonist & antagonist");
    expect(generatedIdx).toBeLessThan(protagonistIdx);
  });

  it("trims trailing whitespace from the body before insertion", () => {
    const md = "## Premessa\n\n## Finale\n";
    const out = insertSectionBody(md, "premise", "  Testo.  \n\n\n");
    expect(out).toContain("Testo.");
    expect(out).not.toContain("Testo.  ");
    expect(out).not.toMatch(/Testo\.\n\n\n\n/);
  });
});
