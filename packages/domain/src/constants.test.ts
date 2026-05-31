import { describe, it, expect } from "vitest";
import {
  DocumentTypes,
  DOCUMENT_TYPE_LABELS_IT,
  TeamRoles,
  TEAM_ROLE_LABELS_IT,
} from "./constants.js";

describe("DOCUMENT_TYPE_LABELS_IT", () => {
  it("has an Italian label for every document type", () => {
    for (const type of Object.values(DocumentTypes)) {
      expect(DOCUMENT_TYPE_LABELS_IT[type]).toBeTruthy();
    }
  });

  it("maps each document type to its Italian screenwriting term", () => {
    expect(DOCUMENT_TYPE_LABELS_IT.synopsis).toBe("Sinossi");
    expect(DOCUMENT_TYPE_LABELS_IT.outline).toBe("Scaletta");
    expect(DOCUMENT_TYPE_LABELS_IT.treatment).toBe("Trattamento");
    expect(DOCUMENT_TYPE_LABELS_IT.soggetto).toBe("Soggetto");
  });

  it("never exposes the raw English type name", () => {
    const leaked = ["Synopsis", "Outline", "Treatment"];
    for (const label of Object.values(DOCUMENT_TYPE_LABELS_IT)) {
      expect(leaked).not.toContain(label);
    }
  });
});

describe("TEAM_ROLE_LABELS_IT", () => {
  it("has an Italian label for every team role", () => {
    for (const role of Object.values(TeamRoles)) {
      expect(TEAM_ROLE_LABELS_IT[role]).toBeTruthy();
    }
  });

  it("maps owner and viewer to Italian (the audited leaks)", () => {
    expect(TEAM_ROLE_LABELS_IT.owner).toBe("Proprietario");
    expect(TEAM_ROLE_LABELS_IT.viewer).toBe("Visualizzatore");
  });

  it("never exposes the raw English enum values", () => {
    const leaked = ["Owner", "Viewer", "owner", "viewer"];
    for (const label of Object.values(TEAM_ROLE_LABELS_IT)) {
      expect(leaked).not.toContain(label);
    }
  });
});
