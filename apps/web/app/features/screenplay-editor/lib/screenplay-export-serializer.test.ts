import { describe, expect, it } from "vitest";
import { serializeScreenplayExport } from "./screenplay-export-serializer";

describe("serializeScreenplayExport", () => {
  it("preserves dialogue, frontespizio fields, and heading emphasis", () => {
    const result = serializeScreenplayExport({
      fountain: [
        "INT. AULA - GIORNO",
        "",
        "      MARCO",
        "",
        "      Luca, ascolta. Non interrompermi.",
      ].join("\n"),
      format: "standard",
      includeCoverPage: true,
      legacyTitlePage: {
        title: "Legacy title",
        author: null,
        basedOn: null,
        contact: null,
        notes: null,
        draftDate: null,
      },
      titlePageDoc: {
        type: "doc",
        content: [
          {
            type: "title",
            content: [{ type: "text", text: "SCIENZE NATURALI" }],
          },
          {
            type: "centerBlock",
            content: [
              {
                type: "para",
                content: [{ type: "text", text: "di Federico II" }],
              },
            ],
          },
          { type: "footerLeft", content: [{ type: "para" }] },
          { type: "footerCenter", content: [{ type: "para" }] },
          {
            type: "footerRight",
            content: [
              {
                type: "para",
                content: [{ type: "text", text: "federico@example.com" }],
              },
            ],
          },
        ],
      },
    });

    expect(result.fountain).toContain("Author: di Federico II");
    expect(result.fountain).toContain("Contact: federico@example.com");
    expect(result.fountain).toContain(
      "      MARCO\n          Luca, ascolta. Non interrompermi.",
    );
    expect(result.invocation.cliSettings).toContain(
      "embolden_scene_headers=true",
    );
  });
});
