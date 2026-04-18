import { describe, it, expect } from "vitest";
import {
  TitlePageStateSchema,
  EMPTY_TITLE_PAGE_STATE,
  UpdateTitlePageStateInput,
} from "./title-page-state.schema";
import { emptyDoc } from "./title-page-pm/empty-doc";

describe("TitlePageStateSchema", () => {
  it("accepts a state with a PM doc + date + color", () => {
    const doc = emptyDoc("My Movie").toJSON();
    const parsed = TitlePageStateSchema.parse({
      doc,
      draftDate: "2026-04-18",
      draftColor: "blue",
    });
    expect(parsed.draftColor).toBe("blue");
    expect(parsed.doc).toEqual(doc);
  });

  it("accepts an empty state (all nulls)", () => {
    expect(TitlePageStateSchema.parse({})).toEqual(EMPTY_TITLE_PAGE_STATE);
  });

  it("rejects malformed dates", () => {
    expect(() =>
      TitlePageStateSchema.parse({ draftDate: "18/04/2026" }),
    ).toThrow();
  });

  it("rejects unknown draft colors", () => {
    expect(() =>
      TitlePageStateSchema.parse({ draftColor: "magenta" }),
    ).toThrow();
  });

  it("accepts arbitrary jsonb-shaped doc (server cannot strictly validate PM doc shape)", () => {
    const parsed = TitlePageStateSchema.parse({
      doc: { type: "doc", content: [] },
    });
    expect(parsed.doc).toEqual({ type: "doc", content: [] });
  });
});

describe("UpdateTitlePageStateInput", () => {
  it("requires projectId uuid + state", () => {
    const valid = UpdateTitlePageStateInput.parse({
      projectId: "00000000-0000-0000-0000-000000000001",
      state: { doc: null, draftDate: null, draftColor: null },
    });
    expect(valid.projectId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("rejects non-uuid projectId", () => {
    expect(() =>
      UpdateTitlePageStateInput.parse({
        projectId: "not-a-uuid",
        state: {},
      }),
    ).toThrow();
  });
});
