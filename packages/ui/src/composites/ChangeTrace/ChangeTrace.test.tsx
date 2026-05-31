// packages/ui/src/composites/ChangeTrace/ChangeTrace.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { ChangeTrace, type ChangeUpdate } from "./ChangeTrace";

afterEach(cleanup);

const SAMPLE_UPDATES: ChangeUpdate[] = [
  { id: "u1", kind: "scene", label: "Sc.2 — INT. CUCINA" },
  { id: "u2", kind: "scene", label: "Sc.3 — INT. SALA" },
];

describe("ChangeTrace", () => {
  it("renders the summary title", () => {
    render(
      <ChangeTrace
        title="Aggiornata Sceneggiatura · 3 scene rinominate"
        stepCount={3}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
      />,
    );
    expect(
      screen.getByText("Aggiornata Sceneggiatura · 3 scene rinominate"),
    ).toBeTruthy();
  });

  it("pluralises step count correctly for 1 step", () => {
    render(
      <ChangeTrace
        title="Modifica applicata"
        stepCount={1}
        updates={[]}
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.getByText("1 passaggio")).toBeTruthy();
  });

  it("pluralises step count correctly for many steps", () => {
    render(
      <ChangeTrace
        title="Modifiche applicate"
        stepCount={4}
        updates={[]}
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.getByText("4 passaggi")).toBeTruthy();
  });

  it("starts with the steps collapsed by default", () => {
    render(
      <ChangeTrace
        title="Aggiornata Sceneggiatura"
        stepCount={2}
        thoughts={["Pensa"]}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.queryByText("Pensa")).toBeNull();
    expect(screen.queryByText("Sc.2 — INT. CUCINA")).toBeNull();
  });

  it("opens the steps body when defaultStepsOpen is true", () => {
    render(
      <ChangeTrace
        title="Aggiornata Sceneggiatura"
        stepCount={2}
        thoughts={["Pensa"]}
        updates={SAMPLE_UPDATES}
        defaultStepsOpen
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.getByText("Pensa")).toBeTruthy();
    expect(screen.getByText("Sc.2 — INT. CUCINA")).toBeTruthy();
  });

  it("toggles the steps body on header click", () => {
    render(
      <ChangeTrace
        title="Aggiornata Sceneggiatura"
        stepCount={2}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
      />,
    );
    const stepsBtn = screen.getByText("2 passaggi");
    fireEvent.click(stepsBtn);
    expect(screen.getByText("Sc.2 — INT. CUCINA")).toBeTruthy();
    fireEvent.click(stepsBtn);
    expect(screen.queryByText("Sc.2 — INT. CUCINA")).toBeNull();
  });

  it("calls onShowChanges when 'Mostra modifiche' is clicked", () => {
    const onShowChanges = vi.fn();
    render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={onShowChanges}
      />,
    );
    fireEvent.click(screen.getByText("Mostra modifiche"));
    expect(onShowChanges).toHaveBeenCalledTimes(1);
  });

  it("toggles the show/hide label and calls onHideChanges on the second click", () => {
    const onShowChanges = vi.fn();
    const onHideChanges = vi.fn();
    render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={onShowChanges}
        onHideChanges={onHideChanges}
      />,
    );
    fireEvent.click(screen.getByText("Mostra modifiche"));
    expect(onShowChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Nascondi modifiche")).toBeTruthy();
    fireEvent.click(screen.getByText("Nascondi modifiche"));
    expect(onHideChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Mostra modifiche")).toBeTruthy();
  });

  it("respects controlled isShowingChanges flag", () => {
    const { rerender } = render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
        isShowingChanges={false}
      />,
    );
    expect(screen.getByText("Mostra modifiche")).toBeTruthy();
    rerender(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
        isShowingChanges
      />,
    );
    expect(screen.getByText("Nascondi modifiche")).toBeTruthy();
  });

  // Spec 47e — the inline "Annulla" affordance was removed: the edit is always
  // applied and the toggle is a transient flash, not a revert. True rollback
  // lives in the Versions SplitDrawer.
  it("never renders an 'Annulla' button", () => {
    render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
        onHideChanges={() => undefined}
      />,
    );
    expect(screen.queryByText("Annulla")).toBeNull();
  });

  it("sets aria-pressed on the show/hide button to reflect state", () => {
    render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
        isShowingChanges
      />,
    );
    const btn = screen.getByText("Nascondi modifiche");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders provided thoughts when the steps are expanded", () => {
    render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={2}
        thoughts={["Lettura soggetto", "Identificazione Atto II"]}
        updates={SAMPLE_UPDATES}
        defaultStepsOpen
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.getByText("Lettura soggetto")).toBeTruthy();
    expect(screen.getByText("Identificazione Atto II")).toBeTruthy();
  });

  it("applies the testId attribute when supplied", () => {
    render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
        testId="change-trace-1"
      />,
    );
    expect(
      document.querySelector('[data-testid="change-trace-1"]'),
    ).toBeTruthy();
  });

  it("merges a user-supplied className into the root", () => {
    const { container } = render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
        className="custom-x"
      />,
    );
    expect(container.querySelector(".custom-x")).toBeTruthy();
  });

  it("pluralises the updates label", () => {
    const { rerender } = render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={[{ kind: "scene", label: "Sc.1" }]}
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.getByText("1 modifica")).toBeTruthy();
    rerender(
      <ChangeTrace
        title="Aggiornata"
        stepCount={1}
        updates={SAMPLE_UPDATES}
        onShowChanges={() => undefined}
      />,
    );
    expect(screen.getByText("2 modifiche")).toBeTruthy();
  });

  it("emits the data-kind attribute on each update row for CSS targeting", () => {
    const { container } = render(
      <ChangeTrace
        title="Aggiornata"
        stepCount={2}
        updates={[
          { kind: "scene", label: "Sc.1" },
          { kind: "budget", label: "Linea X" },
        ]}
        defaultStepsOpen
        onShowChanges={() => undefined}
      />,
    );
    expect(container.querySelector('[data-kind="scene"]')).toBeTruthy();
    expect(container.querySelector('[data-kind="budget"]')).toBeTruthy();
  });
});
