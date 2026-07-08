import { describe, expect, it } from "vitest";
import {
  adviceFingerprint,
  createEditorialApprovalAdvice,
  dedupeEditorialAdvice,
  EditorialAdviceListSchema,
  sortEditorialAdvice,
} from "./schema";

describe("EditorialAdviceListSchema", () => {
  it("parses the shared editorial advice payload", () => {
    const parsed = EditorialAdviceListSchema.parse({
      suggestions: [
        {
          id: "a1",
          area: "structure",
          title: "Snodo poco leggibile",
          body: "Il passaggio tra due scene perde il punto di vista.",
          type: "risk",
          severity: "medium",
        },
      ],
    });
    expect(parsed.suggestions).toHaveLength(1);
  });
});

describe("dedupeEditorialAdvice", () => {
  it("removes duplicate advice with cosmetic text differences", () => {
    const deduped = dedupeEditorialAdvice([
      {
        id: "a1",
        area: "structure",
        title: "Prologo enigmatico",
        body: "Funziona, ma chiariscilo solo se vuoi più linearità.",
        type: "authorial_choice",
        severity: "optional",
      },
      {
        id: "a2",
        area: "structure",
        title: "Prologo enigmatico ",
        body: "Funziona, ma chiariscilo solo se vuoi più linearità",
        type: "authorial_choice",
        severity: "optional",
      },
    ]);
    expect(deduped).toHaveLength(1);
  });
});

describe("sortEditorialAdvice", () => {
  it("keeps high severity items before optional notes", () => {
    const sorted = sortEditorialAdvice([
      {
        id: "optional",
        area: "tone",
        title: "Micro limatura",
        body: "Puoi stringere una riga.",
        type: "optional",
        severity: "optional",
      },
      {
        id: "risk",
        area: "clarity",
        title: "Azione poco leggibile",
        body: "Non si capisce chi compie il gesto.",
        type: "risk",
        severity: "high",
      },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["risk", "optional"]);
  });
});

describe("adviceFingerprint", () => {
  it("uses area, type, title and body as the anti-loop signature", () => {
    expect(
      adviceFingerprint({
        id: "a1",
        area: "theme",
        title: "Tema leggibile",
        body: "Non lo espliciterei oltre.",
        type: "approved",
        severity: "optional",
      }),
    ).toContain("theme|approved|tema leggibile");
  });
});

describe("createEditorialApprovalAdvice", () => {
  it("creates the canonical positive editorial card", () => {
    const advice = createEditorialApprovalAdvice("screenplay");
    expect(advice.type).toBe("approved");
    expect(advice.status).toBe("approved");
    expect(advice.title).toBe("OK editoriale");
  });
});
