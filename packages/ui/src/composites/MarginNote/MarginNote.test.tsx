// packages/ui/src/composites/MarginNote/MarginNote.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MarginNote } from "./MarginNote";

afterEach(cleanup);

describe("MarginNote", () => {
  it("renders kind label and text", () => {
    const { getByText } = render(
      <MarginNote kind="dramaturg" text="Il personaggio perde coerenza qui." />,
    );
    expect(getByText(/Writing/)).toBeTruthy();
    expect(getByText("Il personaggio perde coerenza qui.")).toBeTruthy();
  });

  it("renders producer kind correctly", () => {
    const { getByText } = render(
      <MarginNote kind="producer" text="Reparto trucco +15%." />,
    );
    expect(getByText(/Production/)).toBeTruthy();
  });

  it("calls onAccept when accept button clicked", () => {
    const onAccept = vi.fn();
    const { getByText } = render(
      <MarginNote kind="dramaturg" text="Test." onAccept={onAccept} />,
    );
    fireEvent.click(getByText("Accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("calls onIgnore when ignore button clicked", () => {
    const onIgnore = vi.fn();
    const { getByText } = render(
      <MarginNote kind="dramaturg" text="Test." onIgnore={onIgnore} />,
    );
    fireEvent.click(getByText("Ignore"));
    expect(onIgnore).toHaveBeenCalledTimes(1);
  });

  it("hides actions when no callbacks provided", () => {
    const { queryByText } = render(
      <MarginNote kind="dramaturg" text="Solo nota." />,
    );
    expect(queryByText("Accept")).toBeNull();
    expect(queryByText("Ignore")).toBeNull();
  });
});
