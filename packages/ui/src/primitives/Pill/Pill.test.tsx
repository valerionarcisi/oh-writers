import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Pill } from "./Pill";

describe("Pill", () => {
  it("renders children", () => {
    const { getByText } = render(<Pill tone="neutral">CONFERMATO</Pill>);
    expect(getByText("CONFERMATO")).toBeTruthy();
  });

  it("applies clay tone class", () => {
    const { container } = render(<Pill tone="clay">Save</Pill>);
    expect(container.firstChild).not.toBeNull();
  });

  it("applies leaf tone class", () => {
    const { container } = render(<Pill tone="leaf">Salvato</Pill>);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders count when provided", () => {
    const { getByText } = render(<Pill tone="leaf" count={3}>Cesare</Pill>);
    expect(getByText("3")).toBeTruthy();
  });

  it("does not render count when zero", () => {
    const { queryByText } = render(<Pill tone="leaf" count={0}>Cesare</Pill>);
    expect(queryByText("0")).toBeNull();
  });
});
