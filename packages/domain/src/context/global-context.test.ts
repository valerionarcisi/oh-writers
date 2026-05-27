import { describe, it, expectTypeOf } from "vitest";
import type { GlobalContext } from "./global-context.js";
import type { FilmBible } from "../bible/schema.js";

// [OHW-039a] — GlobalContext type contract tests

const VALID_BIBLE: FilmBible = {
  schemaVersion: "1",
  settingSummary: "Roma, anni ottanta.",
  genreAndTone: "Dramma, ritmo lento.",
  centralConflict: "Un regista affronta il suo passato.",
  productionConstraints: ["Esterni notturni"],
  recurringLocations: [],
  keyCharacters: [],
  sourceDocumentSnapshot: "soggetto-snapshot",
};

describe("GlobalContext", () => {
  it("accepts a GlobalContext with a non-null bible", () => {
    const ctx: GlobalContext = {
      projectTitle: "Il Grande Silenzio",
      genre: "drama",
      format: "feature",
      bible: VALID_BIBLE,
    };
    expectTypeOf(ctx.bible).toEqualTypeOf<FilmBible | null>();
  });

  it("accepts a GlobalContext with bible null", () => {
    const ctx: GlobalContext = {
      projectTitle: "Progetto Senza Bible",
      genre: null,
      format: "short",
      bible: null,
    };
    expectTypeOf(ctx.bible).toEqualTypeOf<FilmBible | null>();
  });

  it("requires all fields to be present", () => {
    expectTypeOf<GlobalContext>().toHaveProperty("projectTitle");
    expectTypeOf<GlobalContext>().toHaveProperty("genre");
    expectTypeOf<GlobalContext>().toHaveProperty("format");
    expectTypeOf<GlobalContext>().toHaveProperty("bible");
  });

  it("allows genre to be null", () => {
    expectTypeOf<GlobalContext["genre"]>().toEqualTypeOf<string | null>();
  });

  it("requires format to always be a string", () => {
    expectTypeOf<GlobalContext["format"]>().toEqualTypeOf<string>();
  });
});
