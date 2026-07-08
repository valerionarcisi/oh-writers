/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EditorialAdvice } from "@oh-writers/domain";
import { LocaleProvider } from "~/features/i18n";
import { EditorialAdviceStack } from "./EditorialAdviceStack";

function renderStack(advice: readonly EditorialAdvice[]) {
  return render(
    <LocaleProvider locale="it">
      <EditorialAdviceStack advice={advice} fallbackArea="screenplay" />
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

  it("keeps optional notes visible but still marks the area as approved", () => {
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

    expect(screen.getByText("Stato editoriale")).toBeTruthy();
    expect(screen.getByText("Fine tuning opzionale")).toBeTruthy();
    expect(screen.getByText("Dialogo da stringere appena")).toBeTruthy();
  });
});
