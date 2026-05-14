// packages/ui/src/shell/TopBar/TopBar.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { TopBar } from "./TopBar";

afterEach(cleanup);

const defaults = {
  projectName: "Il Grande Lebowski",
  sectionName: "Budget",
  userInitials: "VN",
};

describe("TopBar", () => {
  it("renders project name", () => {
    const { getByText } = render(<TopBar {...defaults} />);
    expect(getByText("Il Grande Lebowski")).toBeTruthy();
  });

  it("renders section name", () => {
    const { getByText } = render(<TopBar {...defaults} />);
    expect(getByText("Budget")).toBeTruthy();
  });

  it("calls onProjectClick when project button clicked", () => {
    const onProjectClick = vi.fn();
    const { getByLabelText } = render(
      <TopBar {...defaults} onProjectClick={onProjectClick} />
    );
    fireEvent.click(getByLabelText(/Progetto:/));
    expect(onProjectClick).toHaveBeenCalledTimes(1);
  });

  it("calls onSearch when search button clicked", () => {
    const onSearch = vi.fn();
    const { getByLabelText } = render(
      <TopBar {...defaults} onSearch={onSearch} />
    );
    fireEvent.click(getByLabelText(/Cerca/));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("calls onAskCesare when ask button clicked", () => {
    const onAskCesare = vi.fn();
    const { getByLabelText } = render(
      <TopBar {...defaults} onAskCesare={onAskCesare} />
    );
    fireEvent.click(getByLabelText(/Chiedi a Cesare/));
    expect(onAskCesare).toHaveBeenCalledTimes(1);
  });

  it("renders user initials in avatar", () => {
    const { getByLabelText } = render(<TopBar {...defaults} userInitials="VN" />);
    expect(getByLabelText(/Account utente/).textContent).toBe("VN");
  });
});
