import { describe, it, expectTypeOf } from "vitest";
import type { GlobalContext, LocalContext } from "./index.js";

// [OHW-039d] — context/index.ts re-export contract tests

describe("context/index re-exports", () => {
  it("re-exports GlobalContext with expected shape", () => {
    expectTypeOf<GlobalContext>().toHaveProperty("projectTitle");
    expectTypeOf<GlobalContext>().toHaveProperty("genre");
    expectTypeOf<GlobalContext>().toHaveProperty("format");
    expectTypeOf<GlobalContext>().toHaveProperty("bible");
  });

  it("re-exports LocalContext with expected shape", () => {
    expectTypeOf<LocalContext>().toHaveProperty("scenes");
    expectTypeOf<LocalContext>().toHaveProperty("currentScene");
    expectTypeOf<LocalContext>().toHaveProperty("sceneWindow");
    expectTypeOf<LocalContext>().toHaveProperty("characters");
    expectTypeOf<LocalContext>().toHaveProperty("activeDocument");
  });

  it("GlobalContext projectTitle is a string", () => {
    expectTypeOf<GlobalContext["projectTitle"]>().toEqualTypeOf<string>();
  });

  it("LocalContext scenes is an array", () => {
    expectTypeOf<LocalContext["scenes"]>().toBeArray();
  });

  it("LocalContext characters is a string array", () => {
    expectTypeOf<LocalContext["characters"]>().toEqualTypeOf<string[]>();
  });
});
