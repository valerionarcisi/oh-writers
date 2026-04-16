import { describe, expect, it } from "vitest";
import {
  SaveStatusValues,
  computeSaveStatus,
  formatRelativeTime,
} from "./save-status";

describe("computeSaveStatus", () => {
  const base = {
    isDirty: false,
    isSaving: false,
    isError: false,
    isOffline: false,
  };

  it("returns SAVED when everything is clean", () => {
    expect(computeSaveStatus(base)).toBe(SaveStatusValues.SAVED);
  });

  it("returns DIRTY when content has unsaved changes", () => {
    expect(computeSaveStatus({ ...base, isDirty: true })).toBe(
      SaveStatusValues.DIRTY,
    );
  });

  it("returns SAVING while a request is in flight", () => {
    expect(computeSaveStatus({ ...base, isDirty: true, isSaving: true })).toBe(
      SaveStatusValues.SAVING,
    );
  });

  it("returns ERROR when last save failed", () => {
    expect(computeSaveStatus({ ...base, isError: true })).toBe(
      SaveStatusValues.ERROR,
    );
  });

  it("OFFLINE wins over DIRTY / ERROR / SAVING", () => {
    expect(
      computeSaveStatus({
        isDirty: true,
        isSaving: true,
        isError: true,
        isOffline: true,
      }),
    ).toBe(SaveStatusValues.OFFLINE);
  });
});

describe("formatRelativeTime", () => {
  const now = 1_700_000_000_000;

  it("says 'adesso' within the first 30s", () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe("adesso");
  });

  it("says 'pochi secondi fa' between 30s and 60s", () => {
    expect(formatRelativeTime(now - 45_000, now)).toBe("pochi secondi fa");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe("1 minuto fa");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 minuti fa");
  });

  it("formats hours", () => {
    expect(formatRelativeTime(now - 60 * 60_000, now)).toBe("1 ora fa");
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe("3 ore fa");
  });
});
