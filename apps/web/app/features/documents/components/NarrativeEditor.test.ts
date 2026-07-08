/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import { layoutForType } from "./NarrativeEditor";

describe("layoutForType", () => {
  it("keeps synopsis on the two-column narrative layout", () => {
    expect(layoutForType(DocumentTypes.SYNOPSIS)).toBe("two");
  });

  it("keeps treatment on the two-column narrative layout", () => {
    expect(layoutForType(DocumentTypes.TREATMENT)).toBe("two");
  });
});
