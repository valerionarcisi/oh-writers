// packages/ui/src/shell/TopBar/TopBar.test.tsx
//
// The slim TopBar only owns per-page concerns now (breadcrumb crumb,
// scope chip slot, version slot, save state slot, search). Project
// switching and section navigation moved to the LeftRail, so those
// behaviors are covered by the LeftRail tests instead. Legacy props are
// still accepted for compatibility but no longer render UI.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { TopBar } from "./TopBar";

afterEach(cleanup);

const defaults = {
  sectionName: "Budget",
};

describe("TopBar (slim)", () => {
  it("renders the section crumb", () => {
    const { getByText } = render(<TopBar {...defaults} />);
    expect(getByText("Budget")).toBeTruthy();
  });

  it("calls onSearch when the search affordance is clicked", () => {
    const onSearch = vi.fn();
    const { getByLabelText } = render(
      <TopBar {...defaults} onSearch={onSearch} />,
    );
    fireEvent.click(getByLabelText(/Cerca/));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("renders the scope chip slot when provided", () => {
    const { getByTestId } = render(
      <TopBar
        {...defaults}
        scopeChip={<span data-testid="chip">SOTTOLINEA · 3</span>}
      />,
    );
    expect(getByTestId("chip")).toBeTruthy();
  });

  it("renders the element legend row when provided", () => {
    const { getByTestId } = render(
      <TopBar
        {...defaults}
        elementLegend={<span data-testid="legend-content">SCENE · ACTION</span>}
      />,
    );
    expect(getByTestId("topstrip-legend")).toBeTruthy();
    expect(getByTestId("legend-content")).toBeTruthy();
  });

  it("does not render the legend row when no slot is provided", () => {
    const { queryByTestId } = render(<TopBar {...defaults} />);
    expect(queryByTestId("topstrip-legend")).toBeNull();
  });
});
