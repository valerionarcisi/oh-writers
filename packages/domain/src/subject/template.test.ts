import { describe, it, expect } from "vitest";
import { SOGGETTO_INITIAL_TEMPLATE } from "./template.js";

describe("SOGGETTO_INITIAL_TEMPLATE", () => {
  it("is non-empty", () => {
    expect(SOGGETTO_INITIAL_TEMPLATE.trim().length).toBeGreaterThan(0);
  });

  it("ends with a trailing newline", () => {
    expect(SOGGETTO_INITIAL_TEMPLATE.endsWith("\n")).toBe(true);
  });

  it("contains no = CARTELLA markers", () => {
    expect(SOGGETTO_INITIAL_TEMPLATE).not.toMatch(/= CARTELLA/);
  });

  it("contains the dismissal hint for the user", () => {
    expect(SOGGETTO_INITIAL_TEMPLATE).toContain("Cancella questo testo");
  });
});
