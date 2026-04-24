import { describe, it, expect } from "vitest";
import {
  buildSubjectSectionPrompt,
  buildLoglineFromSubjectPrompt,
  sectionLabel,
  type SubjectPromptProject,
} from "./subject-prompt";

const project: SubjectPromptProject = {
  title: "L'ultima estate a Marzano",
  genre: "drama",
  format: "feature",
  logline: null,
};

describe("buildSubjectSectionPrompt", () => {
  it("includes the italian section label and project title in user message", () => {
    const payload = buildSubjectSectionPrompt({
      section: "premise",
      project,
      currentSoggetto: null,
    });
    expect(payload.user).toContain("Premessa");
    expect(payload.user).toContain("L'ultima estate a Marzano");
    expect(payload.user).toContain("(ancora nessuna)");
  });

  it("uses the 'Arco narrativo' label for section arc", () => {
    const payload = buildSubjectSectionPrompt({
      section: "arc",
      project,
      currentSoggetto: "Premessa: Milano, oggi.",
    });
    expect(payload.user).toContain("Arco narrativo");
    expect(payload.user).toContain("Milano, oggi");
  });

  it("system prompt mentions Cesare and italiano", () => {
    const payload = buildSubjectSectionPrompt({
      section: "premise",
      project,
      currentSoggetto: null,
    });
    expect(payload.system.length).toBeGreaterThan(0);
    expect(payload.system).toContain("Cesare");
    expect(payload.system.toLowerCase()).toContain("italiano");
  });

  it("provides exactly 2 few-shot pairs (4 messages)", () => {
    const payload = buildSubjectSectionPrompt({
      section: "premise",
      project,
      currentSoggetto: null,
    });
    expect(payload.fewShot).toHaveLength(4);
    expect(payload.fewShot[0]?.role).toBe("user");
    expect(payload.fewShot[1]?.role).toBe("assistant");
    expect(payload.fewShot[2]?.role).toBe("user");
    expect(payload.fewShot[3]?.role).toBe("assistant");
  });

  it("is deterministic for the same input", () => {
    const input = {
      section: "world" as const,
      project,
      currentSoggetto: "Qualcosa",
    };
    expect(buildSubjectSectionPrompt(input)).toEqual(
      buildSubjectSectionPrompt(input),
    );
  });

  it("does not leak unreplaced placeholders", () => {
    const payload = buildSubjectSectionPrompt({
      section: "ending",
      project,
      currentSoggetto: null,
    });
    const full = payload.system + payload.user;
    expect(full).not.toContain("TODO");
    expect(full).not.toMatch(/\{[a-zA-Z_][a-zA-Z0-9_?.]*\}/);
  });
});

describe("buildLoglineFromSubjectPrompt", () => {
  it("system prompt mentions the 500 character limit", () => {
    const payload = buildLoglineFromSubjectPrompt({
      project,
      soggetto: "Un soggetto qualsiasi.",
    });
    expect(payload.system).toMatch(/500|cinquecento/i);
  });

  it("includes the soggetto and title in user message", () => {
    const soggetto = "Marta torna a Marzano per vendere la casa.";
    const payload = buildLoglineFromSubjectPrompt({ project, soggetto });
    expect(payload.user).toContain(soggetto);
    expect(payload.user).toContain("L'ultima estate a Marzano");
  });

  it("is deterministic for the same input", () => {
    const input = { project, soggetto: "Testo." };
    expect(buildLoglineFromSubjectPrompt(input)).toEqual(
      buildLoglineFromSubjectPrompt(input),
    );
  });
});

describe("sectionLabel", () => {
  it("maps all sections to italian labels", () => {
    expect(sectionLabel("premise")).toBe("Premessa");
    expect(sectionLabel("protagonist")).toBe("Protagonista & antagonista");
    expect(sectionLabel("arc")).toBe("Arco narrativo");
    expect(sectionLabel("world")).toBe("Mondo");
    expect(sectionLabel("ending")).toBe("Finale");
  });
});
