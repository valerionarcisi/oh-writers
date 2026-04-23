/**
 * Spec 05k — fountain pre-processing + afterwriting config per export format.
 *
 * Each `ExportFormat` resolves to two things:
 *   1. A pure fountain → fountain transformer (e.g. Sides slices the
 *      document down to the chosen scenes).
 *   2. An `AwcInvocation` describing how to drive `awc-runner.cjs`:
 *      - `cliSettings`: top-level Settings overrides passed via `--setting`.
 *      - `profileOverrides`: nested `print_profile` patches applied in-process
 *        by the runner (afterwriting can't override these via CLI alone).
 *
 * Pure module: no I/O, deterministic. Tested separately so the server file
 * stays small.
 */

import {
  type ExportFormat,
  extractScenesFromFountain,
} from "@oh-writers/domain";

export interface AwcInvocation {
  /** `key=value` pairs passed to afterwriting via `--setting`. */
  readonly cliSettings: readonly string[];
  /**
   * Patched into the relevant `print_profile` object in-process by the
   * runner BEFORE Bootstrap.init. Keys are profile names (`a4`/`usletter`),
   * values are partial print-profile fields.
   */
  readonly profileOverrides: Readonly<
    Record<string, Readonly<Record<string, number | boolean | string>>>
  >;
}

export interface PipelineInput {
  readonly fountain: string;
  readonly sceneSelection?: readonly string[];
}

export interface PipelineResult {
  readonly fountain: string;
  readonly invocation: AwcInvocation;
}

const NO_PATCH: AwcInvocation = {
  cliSettings: [],
  profileOverrides: {},
};

/**
 * For Reading copy we double the line spacing AND scale the
 * `lines_per_page` count proportionally, otherwise afterwriting still
 * thinks 57 lines fit on a page and overflow ruins pagination.
 */
const READING_COPY_INVOCATION: AwcInvocation = {
  cliSettings: ["scenes_numbers=none"],
  profileOverrides: {
    a4: { line_spacing: 2, lines_per_page: 28 },
    usletter: { line_spacing: 2, lines_per_page: 30 },
  },
};

const AD_COPY_INVOCATION: AwcInvocation = {
  cliSettings: ["scenes_numbers=both"],
  profileOverrides: {
    // ~2.5 inch right margin (default is 1) — the dialogue column stays
    // put because dialogue feed is anchored to the left margin.
    a4: { right_margin: 2.5 },
    usletter: { right_margin: 2.5 },
  },
};

const ONE_SCENE_PER_PAGE_INVOCATION: AwcInvocation = {
  cliSettings: ["each_scene_on_new_page=true", "scenes_numbers=both"],
  profileOverrides: {},
};

const SIDES_INVOCATION: AwcInvocation = {
  // Sides need numbers visible on both sides; cover page is suppressed via
  // the modal's `includeCoverPage=false` default.
  cliSettings: ["scenes_numbers=both"],
  profileOverrides: {},
};

export const buildExportPipeline = (
  format: ExportFormat,
  input: PipelineInput,
): PipelineResult => {
  switch (format) {
    case "standard":
      return { fountain: input.fountain, invocation: NO_PATCH };
    case "sides": {
      const selection = input.sceneSelection ?? [];
      const sliced = extractScenesFromFountain(input.fountain, selection);
      return { fountain: sliced, invocation: SIDES_INVOCATION };
    }
    case "ad_copy":
      return { fountain: input.fountain, invocation: AD_COPY_INVOCATION };
    case "reading_copy":
      return {
        fountain: input.fountain,
        invocation: READING_COPY_INVOCATION,
      };
    case "one_scene_per_page":
      return {
        fountain: input.fountain,
        invocation: ONE_SCENE_PER_PAGE_INVOCATION,
      };
  }
};
