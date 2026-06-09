// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SavePill } from "./SavePill";
import { computeSaveStatus, SaveStatusValues } from "./save-status";

afterEach(cleanup);

describe("SavePill (Spec 63 F3/F4)", () => {
  it("renders a distinct label for each of the five states", () => {
    const cases: Array<[Parameters<typeof SavePill>[0]["state"], string]> = [
      ["saved", "Salvato"],
      ["dirty", "Non salvato"],
      ["saving", "Salvando…"],
      ["error", "Errore salvataggio"],
      ["offline", "Offline"],
    ];
    for (const [state, label] of cases) {
      cleanup();
      render(<SavePill state={state} />);
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("saved with secondsAgo appends a relative time", () => {
    render(<SavePill state="saved" secondsAgo={12} />);
    expect(screen.getByText(/Salvato 12s fa/)).toBeTruthy();
  });
});

describe("computeSaveStatus (Spec 63 F4)", () => {
  const base = {
    isDirty: false,
    isSaving: false,
    isError: false,
    isOffline: false,
  };

  it("precedence: offline > error > saving > dirty > saved", () => {
    expect(computeSaveStatus({ ...base, isOffline: true, isError: true })).toBe(
      SaveStatusValues.OFFLINE,
    );
    expect(computeSaveStatus({ ...base, isError: true, isSaving: true })).toBe(
      SaveStatusValues.ERROR,
    );
    expect(computeSaveStatus({ ...base, isSaving: true, isDirty: true })).toBe(
      SaveStatusValues.SAVING,
    );
    expect(computeSaveStatus({ ...base, isDirty: true })).toBe(
      SaveStatusValues.DIRTY,
    );
    expect(computeSaveStatus(base)).toBe(SaveStatusValues.SAVED);
  });

  it("dirty and saving are distinct states (the P3 bug)", () => {
    expect(computeSaveStatus({ ...base, isDirty: true })).not.toBe(
      computeSaveStatus({ ...base, isSaving: true }),
    );
  });
});
