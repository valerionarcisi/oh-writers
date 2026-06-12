import { describe, it, expect } from "vitest";
import {
  buildTitlePageFields,
  prependTitlePageToFountain,
  type LegacyTitlePageColumns,
} from "./title-page-prepend";
import type { TitlePageDocFields } from "~/features/projects/title-page-pm/export-fields";

const BODY = "INT. CASA - GIORNO\n\nMario entra.";

const emptyLegacy: LegacyTitlePageColumns = {
  title: "Progetto",
  author: null,
  basedOn: null,
  contact: null,
  notes: null,
  draftDate: null,
};

const docFields = (
  overrides: Partial<TitlePageDocFields> = {},
): TitlePageDocFields => ({
  title: "",
  centerLines: [],
  footerLeftLines: [],
  footerCenterLines: [],
  footerRightLines: [],
  ...overrides,
});

describe("buildTitlePageFields", () => {
  it("prefers the frontespizio doc per region", () => {
    const fields = buildTitlePageFields(
      {
        title: "Progetto",
        author: "Legacy Author",
        basedOn: "dal romanzo X",
        contact: "legacy@contact.it",
        notes: "LEGACY NOTE",
        draftDate: "2026-01-01",
      },
      docFields({
        title: "NON FA RIDERE",
        centerLines: ["Written by", "Valerio Narcisi"],
        footerLeftLines: ["12 giugno 2026"],
        footerCenterLines: ["PRIMA STESURA"],
        footerRightLines: ["valerio@example.com"],
      }),
    );
    expect(fields.title).toBe("NON FA RIDERE");
    expect(fields.authorLines).toEqual(["Written by", "Valerio Narcisi"]);
    expect(fields.creditLine).toBeNull();
    expect(fields.draftDateLines).toEqual(["12 giugno 2026"]);
    expect(fields.notesLines).toEqual(["PRIMA STESURA"]);
    expect(fields.contactLines).toEqual(["valerio@example.com"]);
    // The doc has no source region — legacy basedOn still flows through.
    expect(fields.sourceLines).toEqual(["dal romanzo X"]);
  });

  it("falls back to legacy columns when the doc is null", () => {
    const fields = buildTitlePageFields(
      {
        title: "Progetto",
        author: "Mario Rossi",
        basedOn: null,
        contact: "mario@rossi.it\n+39 333 1234567",
        notes: null,
        draftDate: "2026-06-12",
      },
      null,
    );
    expect(fields.title).toBe("Progetto");
    expect(fields.authorLines).toEqual(["Mario Rossi"]);
    expect(fields.creditLine).toBe("di");
    expect(fields.contactLines).toEqual(["mario@rossi.it", "+39 333 1234567"]);
    expect(fields.draftDateLines).toEqual(["2026-06-12"]);
  });

  it("falls back per-region when the doc exists but a region is empty", () => {
    const fields = buildTitlePageFields(
      { ...emptyLegacy, contact: "fallback@contact.it" },
      docFields({ centerLines: ["di Anna Bianchi"] }),
    );
    expect(fields.title).toBe("Progetto");
    expect(fields.authorLines).toEqual(["di Anna Bianchi"]);
    expect(fields.contactLines).toEqual(["fallback@contact.it"]);
  });

  it("never injects a credit over a doc-authored center block", () => {
    const fields = buildTitlePageFields(
      emptyLegacy,
      docFields({ centerLines: ["Valerio Narcisi"] }),
    );
    expect(fields.creditLine).toBeNull();
  });

  it("skips the credit when the legacy author already carries one", () => {
    expect(
      buildTitlePageFields({ ...emptyLegacy, author: "di Mario Rossi" }, null)
        .creditLine,
    ).toBeNull();
    expect(
      buildTitlePageFields(
        { ...emptyLegacy, author: "Scritto da Mario Rossi" },
        null,
      ).creditLine,
    ).toBeNull();
  });

  it("empty author → no author lines and no credit (sad path)", () => {
    const fields = buildTitlePageFields(emptyLegacy, docFields());
    expect(fields.authorLines).toEqual([]);
    expect(fields.creditLine).toBeNull();
  });
});

describe("prependTitlePageToFountain", () => {
  it("emits the full industry-standard block: title, author, contact", () => {
    const out = prependTitlePageToFountain(
      BODY,
      buildTitlePageFields(
        { ...emptyLegacy, author: "Mario Rossi", contact: "mario@rossi.it" },
        null,
      ),
    );
    expect(out).toBe(
      [
        "Title: Progetto",
        "Credit: di",
        "Author: Mario Rossi",
        "Contact: mario@rossi.it",
        "",
        BODY,
      ].join("\n"),
    );
  });

  it("emits multi-line values as indented continuation lines", () => {
    const out = prependTitlePageToFountain(
      BODY,
      buildTitlePageFields(
        emptyLegacy,
        docFields({
          centerLines: ["Written by", "Valerio Narcisi"],
          footerRightLines: ["valerio@example.com", "+39 333 0000000"],
        }),
      ),
    );
    expect(out).toContain("Author: Written by\n   Valerio Narcisi");
    expect(out).toContain("Contact: valerio@example.com\n   +39 333 0000000");
  });

  it("never emits a blank line inside the block (a blank ends the title page)", () => {
    const out = prependTitlePageToFountain(
      BODY,
      buildTitlePageFields(
        {
          title: "T",
          author: "A",
          basedOn: "B",
          contact: "C",
          notes: "N",
          draftDate: "2026-06-12",
        },
        null,
      ),
    );
    const block = out.split("\n\n")[0] ?? "";
    expect(block.split("\n").every((line) => line.trim().length > 0)).toBe(
      true,
    );
    expect(block).toContain("Source: B");
    expect(block).toContain("Draft date: 2026-06-12");
    expect(block).toContain("Notes: N");
  });

  it("title-only fields produce the same minimal block as before (sad path)", () => {
    const out = prependTitlePageToFountain(
      BODY,
      buildTitlePageFields(emptyLegacy, null),
    );
    expect(out).toBe(`Title: Progetto\n\n${BODY}`);
  });

  it("strips leading whitespace from the body before joining", () => {
    const out = prependTitlePageToFountain(
      `\n\n${BODY}`,
      buildTitlePageFields(emptyLegacy, null),
    );
    expect(out).toBe(`Title: Progetto\n\n${BODY}`);
  });
});
