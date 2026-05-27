import { describe, it, expectTypeOf } from "vitest";
import type {
  LocalContext,
  SceneMetaRow,
  SceneBodyRow,
  ActiveDocumentRow,
} from "./local-context.js";

// [OHW-039b] — LocalContext type contract tests

describe("LocalContext", () => {
  it("accepts a minimal LocalContext with all nullable fields set to null", () => {
    const ctx: LocalContext = {
      projectTitle: "Film Vuoto",
      scenes: [],
      currentScene: null,
      sceneWindow: [],
      characters: [],
      activeDocument: null,
      currentRequirement: null,
      activeShootingDay: null,
    };
    expectTypeOf(ctx).toMatchTypeOf<LocalContext>();
  });

  it("accepts an empty sceneWindow array", () => {
    const window: SceneBodyRow[] = [];
    expectTypeOf(window).toMatchTypeOf<SceneBodyRow[]>();
  });

  it("requires activeDocument to have isActive: true when non-null", () => {
    const doc: ActiveDocumentRow = {
      id: "doc-1",
      type: "synopsis",
      content: "Una storia di vendetta.",
      isActive: true,
    };
    expectTypeOf(doc.isActive).toEqualTypeOf<true>();
  });

  it("allows currentRequirement to be null", () => {
    expectTypeOf<LocalContext["currentRequirement"]>().toEqualTypeOf<
      unknown | null
    >();
  });

  it("scenes array contains only metadata rows without a body field", () => {
    const scene: SceneMetaRow = {
      id: "scene-1",
      number: 1,
      heading: "INT. UFFICIO - GIORNO",
    };
    // SceneMetaRow must not have a body field
    expectTypeOf(scene).not.toHaveProperty("body");
    expectTypeOf<LocalContext["scenes"]>().toEqualTypeOf<SceneMetaRow[]>();
  });
});
