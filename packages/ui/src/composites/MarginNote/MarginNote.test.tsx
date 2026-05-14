// packages/ui/src/composites/MarginNote/MarginNote.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MarginNote } from "./MarginNote";

afterEach(cleanup);

describe("MarginNote", () => {
  it("renders kind label and text", () => {
    const { getByText } = render(
      <MarginNote kind="dramaturg" text="Il personaggio perde coerenza qui." />
    );
    expect(getByText(/Scrittura/)).toBeTruthy();
    expect(getByText("Il personaggio perde coerenza qui.")).toBeTruthy();
  });

  it("renders producer kind correctly", () => {
    const { getByText } = render(
      <MarginNote kind="producer" text="Reparto trucco +15%." />
    );
    expect(getByText(/Produzione/)).toBeTruthy();
  });

  it("calls onAccept when accept button clicked", () => {
    const onAccept = vi.fn();
    const { getByText } = render(
      <MarginNote kind="dramaturg" text="Test." onAccept={onAccept} />
    );
    fireEvent.click(getByText("Accetta"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onIgnore when ignore button clicked", () => {
    const onIgnore = vi.fn();
    const { getByText } = render(
      <MarginNote kind="dramaturg" text="Test." onIgnore={onIgnore} />
    );
    fireEvent.click(getByText("Ignora"));
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it("hides actions when no callbacks provided", () => {
    const { queryByText } = render(
      <MarginNote kind="dramaturg" text="Solo nota." />
    );
    expect(queryByText("Accetta")).toBeNull();
    expect(queryByText("Ignora")).toBeNull();
  });
});
