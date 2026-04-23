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

/**
 * Value accepted under each profile key. Either a scalar override
 * (e.g. `line_spacing: 2`) or a nested per-token-type config that the runner
 * shallow-merges into the existing object (e.g. `action: { max: 40 }` keeps
 * the default `feed`/`color`/etc. while overriding only `max`).
 */
export type ProfileOverrideValue =
  | number
  | boolean
  | string
  | Readonly<Record<string, number | boolean | string>>;

export interface AwcInvocation {
  /** `key=value` pairs passed to afterwriting via `--setting`. */
  readonly cliSettings: readonly string[];
  /**
   * Patched into the relevant `print_profile` object in-process by the
   * runner BEFORE Bootstrap.init. Keys are profile names (`a4`/`usletter`),
   * values are partial print-profile fields (scalar or per-type-config).
   */
  readonly profileOverrides: Readonly<
    Record<string, Readonly<Record<string, ProfileOverrideValue>>>
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

/**
 * Standard production format. Industry default = scene numbers visible on
 * BOTH sides of every slugline (afterwriting's built-in default is "none").
 */
const STANDARD_INVOCATION: AwcInvocation = {
  cliSettings: ["scenes_numbers=both"],
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

/**
 * AD copy = traditional "1st AD" working copy with a wide right margin for
 * handwritten timing notes. afterwriting's `right_margin` is only used for
 * centered/divider rendering, NOT for action/dialogue wrap — so we instead
 * shrink each token-type's `max` (character count) to push body text to the
 * left and free ~1.5" of right gutter on A4. The shallow-merge in the
 * runner preserves the default `feed`/`italic`/etc.
 */
const AD_COPY_INVOCATION: AwcInvocation = {
  cliSettings: ["scenes_numbers=both"],
  profileOverrides: {
    a4: {
      scene_heading: { max: 36 },
      action: { max: 36 },
      shot: { max: 36 },
      character: { max: 24 },
      dialogue: { max: 26 },
      parenthetical: { max: 20 },
      transition: { max: 36 },
      synopsis: { max: 36 },
      section: { max: 36 },
      centered: { max: 36 },
    },
    usletter: {
      scene_heading: { max: 38 },
      action: { max: 38 },
      shot: { max: 38 },
      character: { max: 24 },
      dialogue: { max: 26 },
      parenthetical: { max: 20 },
      transition: { max: 38 },
      synopsis: { max: 38 },
      section: { max: 38 },
      centered: { max: 38 },
    },
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
      return { fountain: input.fountain, invocation: STANDARD_INVOCATION };
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
