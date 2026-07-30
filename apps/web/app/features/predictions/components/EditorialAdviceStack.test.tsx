/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  editorialAdviceMemoryKey,
  type EditorialAdvice,
  type EditorialAdviceStatus,
} from "@oh-writers/domain";
import { LocaleProvider } from "~/features/i18n";
import { EditorialAdviceStack } from "./EditorialAdviceStack";

function renderStack(
  advice: readonly EditorialAdvice[],
  rememberedStatuses?: Record<string, EditorialAdviceStatus>,
) {
  return render(
    <LocaleProvider locale="it">
      <EditorialAdviceStack
        advice={advice}
        fallbackArea="screenplay"
        rememberedStatuses={rememberedStatuses}
      />
    </LocaleProvider>,
  );
}

describe("EditorialAdviceStack", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows an editorial approval card when no actionable advice remains", () => {
    renderStack([]);

    expect(screen.getByText("Stato editoriale")).toBeTruthy();
    expect(screen.getAllByText("OK editoriale").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Questa area funziona. Non emergono problemi narrativi rilevanti. Procederei solo con rifiniture leggere.",
      ),
    ).toBeTruthy();
  });

  // #99 — the approval card used to be synthesised whenever nothing was high or
  // medium, so a reading that produced real low/optional notes was still crowned
  // "OK editoriale" and the writer stopped at the verdict. Optional notes ARE
  // something to say, so the area is not approved.
  it("shows optional notes on their own, without crowning the area approved", () => {
    renderStack([
      {
        id: "opt-1",
        area: "dialogue",
        title: "Dialogo da stringere appena",
        body: "Il dialogo regge, ma se due battute dicono quasi la stessa cosa puoi tagliarne una senza perdere tensione.",
        type: "optional",
        severity: "low",
      },
    ]);

    expect(screen.getByText("Fine tuning opzionale")).toBeTruthy();
    expect(screen.getByText("Dialogo da stringere appena")).toBeTruthy();
    expect(screen.queryByText("OK editoriale")).toBeNull();
  });

  it("shows every low note rather than one approval card over them", () => {
    renderStack(
      Array.from({ length: 6 }, (_, i) => ({
        id: `low-${i}`,
        area: "structure" as const,
        title: `Rilievo ${i}`,
        body: "Un rilievo reale, non bloccante.",
        type: "optional" as const,
        severity: "low" as const,
      })),
    );

    for (let i = 0; i < 6; i += 1) {
      expect(screen.getByText(`Rilievo ${i}`)).toBeTruthy();
    }
    expect(screen.queryByText("OK editoriale")).toBeNull();
  });

  it("hides an item whose editorialAdviceMemoryKey is remembered as decided", () => {
    const advice: EditorialAdvice = {
      id: "risk-1",
      area: "structure",
      title: "Snodo poco leggibile",
      body: "Il passaggio perde il punto di vista.",
      type: "risk",
      severity: "high",
      snippet: "verso il pentimento",
    };
    renderStack([advice], {
      [editorialAdviceMemoryKey(advice)]: "authorial_choice",
    });

    expect(screen.queryByText("Snodo poco leggibile")).toBeNull();
    expect(screen.getAllByText("OK editoriale").length).toBeGreaterThan(0);
  });
});
