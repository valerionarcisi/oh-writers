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

  it("defaults the eyebrow to 'Tu' when kind=user", () => {
    render(<CollapsibleNote kind="user" title="Nota" body="Corpo" />);
    expect(screen.getByText("Tu")).toBeTruthy();
  });

  it("emits data-kind reflecting the kind prop for CSS targeting", () => {
    const { container } = render(
      <CollapsibleNote kind="cesare" title="Nota" body="Corpo" />,
    );
    expect(container.querySelector('[data-kind="cesare"]')).toBeTruthy();
  });

  it("emits data-open when opened", () => {
    const { container } = render(
      <CollapsibleNote kind="cesare" title="Nota" body="Corpo" defaultOpen />,
    );
    expect(container.querySelector('[data-open="true"]')).toBeTruthy();
  });

  it("renders actions even when no body is provided (only when defaultOpen)", () => {
    render(
      <CollapsibleNote
        kind="cesare"
        title="Step"
        actions={<button type="button">Mostra modifiche</button>}
        defaultOpen
      />,
    );
    expect(screen.getByText("Mostra modifiche")).toBeTruthy();
  });

  it("does NOT show the chevron when one-line (no body, no actions)", () => {
    const { container } = render(
      <CollapsibleNote kind="cesare" title="Senza corpo" />,
    );
    // No chev character ▾ should be present
    expect(container.querySelector('[class*="chev"]')).toBeNull();
  });

  it("toggles closed when defaultOpen=true and the user clicks the header", () => {
    render(
      <CollapsibleNote
        kind="cesare"
        title="Nota"
        body="Corpo"
        defaultOpen
      />,
    );
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("merges a user-supplied className into the root", () => {
    const { container } = render(
      <CollapsibleNote
        kind="cesare"
        title="Nota"
        body="Corpo"
        className="custom-classname-x"
      />,
    );
    expect(container.querySelector(".custom-classname-x")).toBeTruthy();
  });
});
