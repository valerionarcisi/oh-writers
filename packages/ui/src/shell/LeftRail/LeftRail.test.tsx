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
});
