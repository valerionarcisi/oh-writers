// packages/ui/src/composites/HeroKPI/HeroKPI.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HeroKPI } from "./HeroKPI";

afterEach(cleanup);

describe("HeroKPI", () => {
  it("renders eyebrow and value", () => {
    const { getByText } = render(
      <HeroKPI eyebrow="Totale preventivo" value="€ 1.247.000" />
    );
    expect(getByText("Totale preventivo")).toBeTruthy();
    expect(getByText("€ 1.247.000")).toBeTruthy();
  });

  it("renders delta when provided", () => {
    const { getByText } = render(
      <HeroKPI eyebrow="Totale" value="€ 100.000" delta="+4,2%" deltaDirection="positive" />
    );
    expect(getByText("+4,2%")).toBeTruthy();
  });

  it("does not render delta when not provided", () => {
    const { container } = render(
      <HeroKPI eyebrow="Totale" value="€ 100.000" />
    );
    // No delta span
    expect(container.querySelectorAll("[class*='delta']").length).toBe(0);
  });

  it("renders sub text when provided", () => {
    const { getByText } = render(
      <HeroKPI eyebrow="Totale" value="€ 100.000" sub="Media mercato: € 95.000" />
    );
    expect(getByText("Media mercato: € 95.000")).toBeTruthy();
  });
});
