// packages/ui/src/composites/CollapsibleNote/CollapsibleNote.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { CollapsibleNote } from "./CollapsibleNote";

afterEach(cleanup);

describe("CollapsibleNote", () => {
  it("renders the title and default Cesare eyebrow", () => {
    render(
      <CollapsibleNote
        kind="cesare"
        title="Terzo atto incompiuto"
        body="Manca chiusura."
      />,
    );
    expect(screen.getByText("Terzo atto incompiuto")).toBeTruthy();
    expect(screen.getByText("Cesare")).toBeTruthy();
  });

  it("uses a custom eyebrow when provided", () => {
    render(
      <CollapsibleNote
        kind="cesare"
        title="Struttura"
        eyebrow="Cesare · Struttura"
        body="Nota."
      />,
    );
    expect(screen.getByText("Cesare · Struttura")).toBeTruthy();
  });

  it("starts collapsed by default and exposes aria-expanded=false", () => {
    render(
      <CollapsibleNote kind="cesare" title="Nota" body="Corpo segreto." />,
    );
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Corpo segreto.")).toBeNull();
  });

  it("starts open when defaultOpen is true and reveals the body", () => {
    render(
      <CollapsibleNote
        kind="user"
        title="Nota"
        body="Corpo visibile."
        defaultOpen
      />,
    );
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Corpo visibile.")).toBeTruthy();
  });

  it("toggles open/closed on header click and updates aria-expanded", () => {
    render(<CollapsibleNote kind="cesare" title="Nota" body="Dettagli." />);
    const header = screen.getByRole("button");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Dettagli.")).toBeTruthy();
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Dettagli.")).toBeNull();
  });

  it("renders as one-line when no body or actions are provided", () => {
    render(<CollapsibleNote kind="user" title="Tea va sviluppata di più" />);
    const header = screen.getByRole("button");
    // No body to disclose → button is inert from a11y POV.
    expect(header.getAttribute("aria-expanded")).toBeNull();
    expect((header as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the actions row alongside the body when open", () => {
    render(
      <CollapsibleNote
        kind="cesare"
        title="Step"
        body="Body"
        actions={<button type="button">Mostra modifiche</button>}
        defaultOpen
      />,
    );
    expect(screen.getByText("Mostra modifiche")).toBeTruthy();
  });

  it("applies the testId attribute when supplied", () => {
    render(
      <CollapsibleNote
        kind="cesare"
        title="Nota"
        body="Corpo"
        testId="collapsible-note-1"
      />,
    );
    expect(
      document.querySelector('[data-testid="collapsible-note-1"]'),
    ).toBeTruthy();
  });
});
