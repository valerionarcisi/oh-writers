// packages/ui/src/shell/LeftRail/LeftRail.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { LeftRail } from "./LeftRail";
import type { RailSection, CesareSessionItem } from "./LeftRail";

afterEach(cleanup);

const SECTIONS: ReadonlyArray<RailSection> = [
  {
    label: "Sviluppo",
    items: [
      { id: "soggetto", label: "Soggetto", icon: "file-text", href: "/s" },
      {
        id: "screenplay",
        label: "Sceneggiatura",
        icon: "file-text",
        href: "/sp",
        isActive: true,
      },
    ],
  },
  {
    label: "Produzione",
    items: [
      { id: "breakdown", label: "Breakdown", icon: "clipboard", href: "/bd" },
    ],
  },
];

const SESSIONS: ReadonlyArray<CesareSessionItem> = [
  { id: "s1", title: "Breakdown Sc.2", lastAt: "ora", active: true },
  { id: "s2", title: "Riscrivi Atto II", lastAt: "2h" },
];

describe("LeftRail", () => {
  it("renders brand and project header", () => {
    const { getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        project={{ title: "Non fa ridere" }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByText("Oh Writers")).toBeTruthy();
    expect(getByText("Non fa ridere")).toBeTruthy();
  });

  it("renders every section item and marks the active one", () => {
    const { getByText, getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByText("Soggetto")).toBeTruthy();
    expect(getByText("Sceneggiatura")).toBeTruthy();
    expect(getByText("Breakdown")).toBeTruthy();
    expect(getByRole("button", { name: "Sceneggiatura" })).toHaveProperty(
      "ariaCurrent",
      "page",
    );
  });

  it("invokes onNavigate when a nav item is activated", () => {
    const onNavigate = vi.fn();
    const { getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(getByRole("button", { name: "Breakdown" }));
    expect(onNavigate).toHaveBeenCalledWith("/bd");
  });

  it("renders Cesare sessions when provided", () => {
    const { getByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByText("Sessioni Cesare")).toBeTruthy();
    expect(getByText("Breakdown Sc.2")).toBeTruthy();
  });

  it("fires onSessionSelect when a session row is clicked", () => {
    const onSessionSelect = vi.fn();
    const { getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={onSessionSelect}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByRole("button", { name: /Riscrivi Atto II/ }));
    expect(onSessionSelect).toHaveBeenCalledWith("s2");
  });

  it("renders tool buttons and fires their handlers", () => {
    const onSearch = vi.fn();
    const { getByTitle } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        tools={[
          { id: "search", label: "Cerca", icon: "search", onPress: onSearch },
        ]}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByTitle("Cerca"));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not render the sessions section when sessions is empty", () => {
    const { queryByText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={[]}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByText("Sessioni Cesare")).toBeNull();
  });

  it("renders the + Nuova affordance only when onSessionNew is supplied", () => {
    const { queryByLabelText, rerender } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByLabelText("Nuova sessione Cesare")).toBeNull();
    rerender(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onSessionNew={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByLabelText("Nuova sessione Cesare")).toBeTruthy();
  });

  it("invokes onSessionNew when the + Nuova affordance is clicked", () => {
    const onSessionNew = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onSessionNew={onSessionNew}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByLabelText("Nuova sessione Cesare"));
    expect(onSessionNew).toHaveBeenCalledTimes(1);
  });

  it("marks the active session with aria-current=page", () => {
    const { getByRole } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        sessions={SESSIONS}
        onSessionSelect={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );
    expect(
      getByRole("button", { name: /Sessione Cesare: Breakdown Sc.2/ }),
    ).toHaveProperty("ariaCurrent", "page");
  });

  it("invokes brand.onPress when the brand button is clicked", () => {
    const onBrand = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: onBrand }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByLabelText("Oh Writers"));
    expect(onBrand).toHaveBeenCalledTimes(1);
  });

  it("invokes project.onPress when supplied", () => {
    const onProject = vi.fn();
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        project={{ title: "Non fa ridere", onPress: onProject }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    fireEvent.click(getByLabelText(/Progetto: Non fa ridere/));
    expect(onProject).toHaveBeenCalledTimes(1);
  });

  it("uses the ariaLabel override on the rail landmark", () => {
    const { getByLabelText } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        ariaLabel="Nav Custom"
      />,
    );
    expect(getByLabelText("Nav Custom")).toBeTruthy();
  });

  it("renders the rail with a data-testid hook", () => {
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(getByTestId("left-rail")).toBeTruthy();
  });

  it("does NOT render the overlay controls when overlay prop is omitted", () => {
    const { queryByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
      />,
    );
    expect(queryByTestId("rail-close")).toBeNull();
    expect(queryByTestId("rail-lock-open")).toBeNull();
  });

  it("renders the close button when overlay prop is supplied", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        overlay={{ isOpen: true, onDismiss }}
      />,
    );
    fireEvent.click(getByTestId("rail-close"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the lock-open button only when onLockOpen is supplied", () => {
    const onLockOpen = vi.fn();
    const { getByTestId, queryByTestId, rerender } = render(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        overlay={{ isOpen: true, onDismiss: vi.fn() }}
      />,
    );
    expect(queryByTestId("rail-lock-open")).toBeNull();
    rerender(
      <LeftRail
        brand={{ label: "Oh Writers", onPress: vi.fn() }}
        sections={SECTIONS}
        onNavigate={vi.fn()}
        overlay={{ isOpen: true, onDismiss: vi.fn(), onLockOpen }}
      />,
    );
    fireEvent.click(getByTestId("rail-lock-open"));
    expect(onLockOpen).toHaveBeenCalledTimes(1);
  });
});
