import { describe, it, expect } from "vitest";
import {
  TitlePageSchema,
  DraftColors,
  DRAFT_COLOR_VALUES,
  EMPTY_TITLE_PAGE,
} from "./title-page.schema";

describe("TitlePageSchema", () => {
  it("accepts a fully populated title page", () => {
    const parsed = TitlePageSchema.parse({
      author: "Jane Doe",
      basedOn: "A novel by X",
      contact: "jane@agent.com\n+1 555 0100",
      draftDate: "2026-04-17",
      draftColor: DraftColors.BLUE,
      wgaRegistration: "WGA-12345",
      notes: "FIRST DRAFT",
    });
    expect(parsed.author).toBe("Jane Doe");
    expect(parsed.draftColor).toBe("blue");
  });

  it("fills nulls when fields are missing", () => {
    const parsed = TitlePageSchema.parse({});
    expect(parsed).toEqual(EMPTY_TITLE_PAGE);
  });

  it("rejects non-YYYY-MM-DD dates", () => {
    expect(() => TitlePageSchema.parse({ draftDate: "17/04/2026" })).toThrow();
  });

  it("rejects colors outside the industry-standard set", () => {
    expect(() => TitlePageSchema.parse({ draftColor: "orange" })).toThrow();
  });

  it("exposes all 10 industry-standard colors", () => {
    expect(DRAFT_COLOR_VALUES).toHaveLength(10);
    expect(DRAFT_COLOR_VALUES).toEqual(
      expect.arrayContaining([
        "white",
        "blue",
        "pink",
        "yellow",
        "green",
        "goldenrod",
        "buff",
        "salmon",
        "cherry",
        "tan",
      ]),
    );
  });

  it("caps author at 200 chars", () => {
    expect(() => TitlePageSchema.parse({ author: "x".repeat(201) })).toThrow();
  });

  it("caps notes at 200 chars", () => {
    expect(() => TitlePageSchema.parse({ notes: "x".repeat(201) })).toThrow();
  });
});
