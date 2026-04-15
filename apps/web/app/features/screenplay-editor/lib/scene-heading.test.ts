import { describe, it, expect } from "vitest";
import {
  splitLegacyHeading,
  joinHeading,
  rankByFrequency,
  filterSuggestions,
  migratePmDoc,
} from "@oh-writers/domain";

describe("splitLegacyHeading", () => {
  it("splits a plain INT. heading", () => {
    expect(splitLegacyHeading("INT. RISTORANTE - NOTTE")).toEqual({
      prefix: "INT.",
      title: "RISTORANTE - NOTTE",
    });
  });

  it("splits INT/EXT. prefix with slash and dot", () => {
    expect(splitLegacyHeading("INT/EXT. CAR - DAY")).toEqual({
      prefix: "INT/EXT.",
      title: "CAR - DAY",
    });
  });

  it("splits EST. prefix", () => {
    expect(splitLegacyHeading("EST. CITY SKYLINE - NIGHT")).toEqual({
      prefix: "EST.",
      title: "CITY SKYLINE - NIGHT",
    });
  });

  it("keeps entire line as title when no recognisable prefix", () => {
    expect(splitLegacyHeading("EST CITY SKYLINE")).toEqual({
      prefix: "",
      title: "EST CITY SKYLINE",
    });
  });

  it("handles empty input", () => {
    expect(splitLegacyHeading("")).toEqual({ prefix: "", title: "" });
    expect(splitLegacyHeading("   ")).toEqual({ prefix: "", title: "" });
  });

  it("trims surrounding whitespace", () => {
    expect(splitLegacyHeading("  INT. FOO  ")).toEqual({
      prefix: "INT.",
      title: "FOO",
    });
  });
});

describe("joinHeading", () => {
  it("joins prefix + title with a single space", () => {
    expect(joinHeading({ prefix: "INT.", title: "FOO - NIGHT" })).toBe(
      "INT. FOO - NIGHT",
    );
  });

  it("returns only title when prefix is empty", () => {
    expect(joinHeading({ prefix: "", title: "FOO" })).toBe("FOO");
  });

  it("returns only prefix when title is empty", () => {
    expect(joinHeading({ prefix: "INT.", title: "" })).toBe("INT.");
  });

  it("returns empty string when both empty", () => {
    expect(joinHeading({ prefix: "", title: "" })).toBe("");
  });

  it("round-trips through splitLegacyHeading", () => {
    const cases = ["INT. FOO", "EXT. BAR - DAY", "INT/EXT. CAR"];
    for (const c of cases) {
      expect(joinHeading(splitLegacyHeading(c))).toBe(c);
    }
  });
});

describe("rankByFrequency", () => {
  it("orders by count desc, tie-break alphabetical", () => {
    expect(rankByFrequency(["INT.", "EXT.", "INT.", "I/E", "INT."])).toEqual([
      "INT.",
      "EXT.",
      "I/E",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(rankByFrequency([])).toEqual([]);
  });

  it("skips empty strings", () => {
    expect(rankByFrequency(["INT.", "", "EXT.", ""])).toEqual(["EXT.", "INT."]);
  });

  it("deduplicates", () => {
    expect(rankByFrequency(["INT.", "INT.", "INT."])).toEqual(["INT."]);
  });
});

describe("filterSuggestions", () => {
  it("returns full list when typed is empty", () => {
    expect(filterSuggestions(["INT.", "EXT."], "")).toEqual(["INT.", "EXT."]);
  });

  it("filters by case-insensitive prefix", () => {
    expect(filterSuggestions(["INT.", "EXT.", "I/E"], "i")).toEqual([
      "INT.",
      "I/E",
    ]);
  });

  it("hides exact match (nothing to suggest)", () => {
    expect(filterSuggestions(["INT.", "INT/EXT."], "INT.")).toEqual([
      "INT/EXT.",
    ]);
  });

  it("returns empty when nothing matches", () => {
    expect(filterSuggestions(["INT.", "EXT."], "xyz")).toEqual([]);
  });

  it("matches titles with arbitrary chars", () => {
    expect(
      filterSuggestions(
        ["RISTORANTE - NOTTE", "RISTORANTE - GIORNO", "CUCINA - NOTTE"],
        "ris",
      ),
    ).toEqual(["RISTORANTE - NOTTE", "RISTORANTE - GIORNO"]);
  });
});

describe("migratePmDoc", () => {
  const legacyDoc = {
    type: "doc",
    content: [
      {
        type: "scene",
        content: [
          {
            type: "heading",
            attrs: { scene_number: "1" },
            content: [{ type: "text", text: "INT. KITCHEN - DAY" }],
          },
          {
            type: "action",
            content: [{ type: "text", text: "She pours coffee." }],
          },
        ],
      },
    ],
  };

  it("splits legacy heading into prefix + title", () => {
    const migrated = migratePmDoc(legacyDoc) as typeof legacyDoc;
    const heading = migrated.content[0]!.content![0]!;
    expect(heading.type).toBe("heading");
    expect(heading.content).toEqual([
      { type: "prefix", content: [{ type: "text", text: "INT." }] },
      { type: "title", content: [{ type: "text", text: "KITCHEN - DAY" }] },
    ]);
  });

  it("preserves scene_number attr during migration", () => {
    const migrated = migratePmDoc(legacyDoc) as typeof legacyDoc;
    const heading = migrated.content[0]!.content![0]!;
    expect(heading.attrs).toEqual({ scene_number: "1" });
  });

  it("is idempotent on already-migrated docs", () => {
    const migrated = migratePmDoc(legacyDoc);
    const twice = migratePmDoc(migrated);
    expect(twice).toEqual(migrated);
  });

  it("leaves non-heading nodes untouched", () => {
    const migrated = migratePmDoc(legacyDoc) as typeof legacyDoc;
    const action = migrated.content[0]!.content![1]!;
    expect(action).toEqual({
      type: "action",
      content: [{ type: "text", text: "She pours coffee." }],
    });
  });

  it("handles empty heading content", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "scene",
          content: [
            { type: "heading", attrs: { scene_number: "" }, content: [] },
          ],
        },
      ],
    };
    const migrated = migratePmDoc(doc) as typeof doc;
    const heading = migrated.content[0]!.content![0]!;
    expect(heading.content).toEqual([
      { type: "prefix", content: [] },
      { type: "title", content: [] },
    ]);
  });
});
