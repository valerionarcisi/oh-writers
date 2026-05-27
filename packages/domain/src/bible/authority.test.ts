import { describe, it, expect } from "vitest";
import { resolveFact, DOC_AUTHORITY } from "./authority.js";
import type { SourcedFact } from "./authority.js";

describe("[OHW-038c] resolveFact", () => {
  it("returns contested with empty candidates array when given empty input", () => {
    const result = resolveFact([]);
    expect(result.status).toBe("contested");
    if (result.status === "contested") {
      expect(result.candidates).toHaveLength(0);
    }
  });

  it("resolves a single fact immediately", () => {
    const facts: SourcedFact[] = [
      { value: "Marche region", source: "soggetto" },
    ];
    const result = resolveFact(facts);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.value).toBe("Marche region");
      expect(result.source).toBe("soggetto");
    }
  });

  it("picks the highest-authority source when all agree", () => {
    const facts: SourcedFact[] = [
      { value: "comedy", source: "logline" },
      { value: "comedy", source: "synopsis" },
      { value: "comedy", source: "treatment" },
    ];
    const result = resolveFact(facts);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.source).toBe("treatment");
    }
  });

  it("marks as contested when top-authority sources disagree", () => {
    const facts: SourcedFact[] = [
      { value: "Rome", source: "treatment" },
      { value: "Marche", source: "treatment" },
    ];
    const result = resolveFact(facts);
    expect(result.status).toBe("contested");
    if (result.status === "contested") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("prefers treatment over soggetto when they conflict", () => {
    const facts: SourcedFact[] = [
      { value: "drama", source: "soggetto" },
      { value: "comedy", source: "treatment" },
    ];
    const result = resolveFact(facts);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.value).toBe("comedy");
      expect(result.source).toBe("treatment");
    }
  });

  it("authority order: treatment > outline > synopsis > soggetto > logline", () => {
    expect(DOC_AUTHORITY.indexOf("treatment")).toBeGreaterThan(
      DOC_AUTHORITY.indexOf("outline"),
    );
    expect(DOC_AUTHORITY.indexOf("outline")).toBeGreaterThan(
      DOC_AUTHORITY.indexOf("synopsis"),
    );
    expect(DOC_AUTHORITY.indexOf("synopsis")).toBeGreaterThan(
      DOC_AUTHORITY.indexOf("soggetto"),
    );
    expect(DOC_AUTHORITY.indexOf("soggetto")).toBeGreaterThan(
      DOC_AUTHORITY.indexOf("logline"),
    );
  });
});
