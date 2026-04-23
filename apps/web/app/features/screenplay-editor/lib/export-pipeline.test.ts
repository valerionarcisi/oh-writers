import { describe, it, expect } from "vitest";
import { buildExportPipeline } from "./export-pipeline.js";

const FOUNTAIN = `Title: Test\n\nINT. UNO - GIORNO\n\nx\n\nEXT. DUE - SERA\n\ny\n\nINT. TRE - NOTTE\n\nz\n`;

describe("buildExportPipeline", () => {
  it("standard returns the input fountain unchanged + scene numbers on both sides", () => {
    const r = buildExportPipeline("standard", { fountain: FOUNTAIN });
    expect(r.fountain).toBe(FOUNTAIN);
    expect(r.invocation.cliSettings).toContain("scenes_numbers=both");
    expect(r.invocation.profileOverrides).toEqual({});
  });

  it("sides slices the fountain to the chosen scenes", () => {
    const r = buildExportPipeline("sides", {
      fountain: FOUNTAIN,
      sceneSelection: ["2"],
    });
    expect(r.fountain).toContain("EXT. DUE");
    expect(r.fountain).not.toContain("INT. UNO");
    expect(r.fountain).not.toContain("INT. TRE");
    expect(r.invocation.cliSettings).toContain("scenes_numbers=both");
  });

  it("sides with empty selection produces empty fountain", () => {
    const r = buildExportPipeline("sides", {
      fountain: FOUNTAIN,
      sceneSelection: [],
    });
    expect(r.fountain).toBe("");
  });

  it("ad_copy shrinks token-type max widths to free a wide right gutter", () => {
    const r = buildExportPipeline("ad_copy", { fountain: FOUNTAIN });
    expect(r.fountain).toBe(FOUNTAIN);
    const a4 = r.invocation.profileOverrides.a4;
    expect(a4).toBeDefined();
    // Default action.max on A4 is 58 — AD copy must wrap notably earlier.
    const action = a4?.action as { max: number } | undefined;
    expect(action?.max).toBeLessThanOrEqual(40);
    const dialogue = a4?.dialogue as { max: number } | undefined;
    expect(dialogue?.max).toBeLessThanOrEqual(30);
    expect(r.invocation.cliSettings).toContain("scenes_numbers=both");
  });

  it("reading_copy doubles line_spacing and scales lines_per_page", () => {
    const r = buildExportPipeline("reading_copy", { fountain: FOUNTAIN });
    expect(r.invocation.profileOverrides.a4?.line_spacing).toBe(2);
    expect(r.invocation.profileOverrides.a4?.lines_per_page).toBeLessThan(57);
    expect(r.invocation.cliSettings).toContain("scenes_numbers=none");
  });

  it("one_scene_per_page enables the native afterwriting setting", () => {
    const r = buildExportPipeline("one_scene_per_page", { fountain: FOUNTAIN });
    expect(r.invocation.cliSettings).toContain("each_scene_on_new_page=true");
    expect(r.invocation.profileOverrides).toEqual({});
  });
});
