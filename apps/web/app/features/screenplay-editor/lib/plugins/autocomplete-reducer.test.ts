import { describe, it, expect } from "vitest";
import { reducer, initialState } from "./autocomplete-reducer";
import type { AutocompleteState } from "./autocomplete-reducer";

describe("autocomplete reducer", () => {
  describe("suggestions/compute from hidden", () => {
    it("stays hidden when suggestions is empty", () => {
      const next = reducer(initialState, {
        type: "suggestions/compute",
        suggestions: [],
      });
      expect(next).toEqual({ tag: "hidden" });
    });

    it("becomes visible when suggestions arrive", () => {
      const next = reducer(initialState, {
        type: "suggestions/compute",
        suggestions: ["INT. OFFICE", "INT. KITCHEN"],
      });
      expect(next).toEqual({
        tag: "visible",
        suggestions: ["INT. OFFICE", "INT. KITCHEN"],
        selectedIndex: 0,
      });
    });
  });

  describe("suggestions/compute from visible", () => {
    const visible: AutocompleteState = {
      tag: "visible",
      suggestions: ["JOHN", "JANE"],
      selectedIndex: 1,
    };

    it("resets to hidden when suggestions become empty", () => {
      const next = reducer(visible, {
        type: "suggestions/compute",
        suggestions: [],
      });
      expect(next).toEqual({ tag: "hidden" });
    });

    it("replaces suggestions and resets selectedIndex to 0", () => {
      const next = reducer(visible, {
        type: "suggestions/compute",
        suggestions: ["JAMES"],
      });
      expect(next).toEqual({
        tag: "visible",
        suggestions: ["JAMES"],
        selectedIndex: 0,
      });
    });
  });

  describe("nav/move", () => {
    const visible: AutocompleteState = {
      tag: "visible",
      suggestions: ["A", "B", "C"],
      selectedIndex: 0,
    };

    it("moves forward", () => {
      const next = reducer(visible, { type: "nav/move", delta: 1 });
      expect(next).toMatchObject({ tag: "visible", selectedIndex: 1 });
    });

    it("wraps around at the bottom", () => {
      const atBottom: AutocompleteState = { ...visible, selectedIndex: 2 };
      const next = reducer(atBottom, { type: "nav/move", delta: 1 });
      expect(next).toMatchObject({ tag: "visible", selectedIndex: 0 });
    });

    it("wraps around at the top", () => {
      const next = reducer(visible, { type: "nav/move", delta: -1 });
      expect(next).toMatchObject({ tag: "visible", selectedIndex: 2 });
    });

    it("is a no-op when hidden", () => {
      const next = reducer(initialState, { type: "nav/move", delta: 1 });
      expect(next).toEqual({ tag: "hidden" });
    });
  });

  describe("nav/set", () => {
    const visible: AutocompleteState = {
      tag: "visible",
      suggestions: ["A", "B", "C"],
      selectedIndex: 0,
    };

    it("sets index directly", () => {
      const next = reducer(visible, { type: "nav/set", index: 2 });
      expect(next).toMatchObject({ tag: "visible", selectedIndex: 2 });
    });

    it("clamps to last item if out of bounds", () => {
      const next = reducer(visible, { type: "nav/set", index: 99 });
      expect(next).toMatchObject({ tag: "visible", selectedIndex: 2 });
    });

    it("is a no-op when hidden", () => {
      const next = reducer(initialState, { type: "nav/set", index: 1 });
      expect(next).toEqual({ tag: "hidden" });
    });
  });

  describe("action/dismiss", () => {
    it("hides a visible dropdown", () => {
      const visible: AutocompleteState = {
        tag: "visible",
        suggestions: ["CUT TO:"],
        selectedIndex: 0,
      };
      const next = reducer(visible, { type: "action/dismiss" });
      expect(next).toEqual({ tag: "hidden" });
    });

    it("is a no-op when already hidden", () => {
      const next = reducer(initialState, { type: "action/dismiss" });
      expect(next).toEqual({ tag: "hidden" });
    });
  });
});
