import { describe, it, expect } from "vitest";
import {
  narrativeToVersionView,
  screenplayToVersionView,
} from "./version-view";

describe("narrativeToVersionView", () => {
  it("maps a narrative row, normalising createdAt to ISO and omitting pageCount", () => {
    const created = new Date("2026-06-06T10:00:00.000Z");
    const view = narrativeToVersionView({
      id: "v1",
      number: 3,
      label: "Bozza blu",
      content: "<p>ciao</p>",
      draftColor: "blue",
      draftDate: "2026-06-06",
      createdAt: created,
    });
    expect(view).toEqual({
      id: "v1",
      number: 3,
      label: "Bozza blu",
      createdAt: "2026-06-06T10:00:00.000Z",
      content: "<p>ciao</p>",
      draftColor: "blue",
      draftDate: "2026-06-06",
    });
    expect(view.pageCount).toBeUndefined();
  });

  it("passes through an already-ISO string createdAt and null meta", () => {
    const view = narrativeToVersionView({
      id: "v2",
      number: 1,
      label: null,
      content: "",
      draftColor: null,
      draftDate: null,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    expect(view.createdAt).toBe("2026-06-01T00:00:00.000Z");
    expect(view.draftColor).toBeNull();
    expect(view.draftDate).toBeNull();
  });
});

describe("screenplayToVersionView", () => {
  it("maps a screenplay row, keeping pageCount", () => {
    const view = screenplayToVersionView({
      id: "s1",
      number: 2,
      label: "Draft 2",
      content: "{}",
      draftColor: "pink",
      draftDate: null,
      pageCount: 42,
      createdAt: new Date("2026-06-06T12:00:00.000Z"),
    });
    expect(view.pageCount).toBe(42);
    expect(view.draftColor).toBe("pink");
    expect(view.createdAt).toBe("2026-06-06T12:00:00.000Z");
  });
});
