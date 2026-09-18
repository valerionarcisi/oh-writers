#!/usr/bin/env node
/**
 * Thin wrapper around afterwriting's `awc.js` that lets us monkey-patch
 * the print-profile object BEFORE the renderer reads it. afterwriting's
 * stock CLI exposes `--config` / `--setting` overrides only for top-level
 * Settings keys; properties inside a `print_profile` (like `right_margin`,
 * `line_spacing`, `lines_per_page`) cannot be overridden that way.
 *
 * Spec 05k formats AD copy and Reading copy need exactly those nested
 * overrides. We accept them via the `OHW_PROFILE_OVERRIDES` env var, which
 * is a JSON object shaped like:
 *
 *   { "a4": { "right_margin": 2.5 }, "usletter": { "line_spacing": 2 } }
 *
 * Then we boot afterwriting the same way `awc.js` does. Apart from the
 * patching step this file mirrors `node_modules/afterwriting/awc.js`.
 *
 * CommonJS on purpose: afterwriting itself is CJS / AMD-bundled and the
 * `require.config({...})` shim only works in CJS context.
 */

global.window = undefined;

const path = require("path");
// Node's real `Module` class, captured before `require` itself is
// reassigned to afterwriting's AMD shim below — needed later to reach into
// its module cache the same way awrequire.js does internally (see the
// utils/liner patch further down).
const NodeModule = require("module");
const afterwritingDir = path.dirname(
  require.resolve("afterwriting/package.json"),
);

require = require(path.join(afterwritingDir, "js/client/awrequire.js"));
require.config({
  map: { modernizr: {} },
  use_node_require: [
    "jquery",
    "fs",
    "d3",
    "pdfkit",
    "aw-parser",
    "protoplast",
    "lodash",
  ],
});

// --- Apply profile-level overrides BEFORE Bootstrap reads them ---
// Allow-list keeps the env-var contract narrow: only fields that Spec 05k
// actually needs can be patched, even if a future caller passes more.
//
// Two shapes are supported:
//   1. Scalar profile keys (line_spacing, lines_per_page, etc.) — assigned
//      directly onto the print-profile object.
//   2. Per-token-type configs (action, dialogue, character, …) — shallow-
//      merged into the existing nested object so we keep `feed`/`italic`
//      defaults while overriding `max` (which actually drives wrap width;
//      `right_margin` only affects centered/divider rendering).
const ALLOWED_PROFILE_KEYS = new Set([
  "right_margin",
  "left_margin",
  "top_margin",
  "line_spacing",
  "lines_per_page",
  "font_size",
]);

const ALLOWED_TYPE_KEYS = new Set([
  "scene_heading",
  "action",
  "shot",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
  "synopsis",
  "section",
]);

try {
  const overridesJson = process.env.OHW_PROFILE_OVERRIDES;
  if (overridesJson && overridesJson.length > 0) {
    const overrides = JSON.parse(overridesJson);
    const printProfiles = require("utils/print-profiles");
    for (const profileName of Object.keys(overrides)) {
      const target = printProfiles[profileName];
      if (!target) continue;
      const patch = overrides[profileName];
      for (const key of Object.keys(patch)) {
        const value = patch[key];
        if (
          ALLOWED_TYPE_KEYS.has(key) &&
          value &&
          typeof value === "object" &&
          target[key] &&
          typeof target[key] === "object"
        ) {
          // Replace with a fresh merged object so the override never mutates
          // the shared in-process default — keeps the runner safe to call
          // twice in the same Node process if it's ever loaded as a library.
          target[key] = { ...target[key], ...value };
          continue;
        }
        if (ALLOWED_PROFILE_KEYS.has(key)) {
          target[key] = value;
        }
      }
    }
  }
} catch (e) {
  console.error("[awc-runner] failed to apply OHW_PROFILE_OVERRIDES:", e);
  process.exit(1);
}

// --- Patch liner.js: scene 1 never gets a printed scene number ---
// Verified against afterwriting@1.17.3 (pinned exactly in apps/web/package.json,
// no caret range — a version bump is always a deliberate, reviewed dependency
// change, never a silent `pnpm install` side effect). If this stops backfilling
// after a future afterwriting bump, pdf-screenplay-scene-numbering.test.ts's
// "clean, canonical scene 1" case is the tripwire — nothing else will catch it.
//
// Upstream bug: js/utils/liner.js only copies a scene heading's number onto
// its first rendered line when `lines.length` (already-accumulated output) is
// non-zero — `if (token.is("scene_heading") && lines.length) {...}`. Since
// scene 1 is virtually always the document's first line, `lines` is empty
// right then, so scene 1 never gets a printed number in ANY export, even
// though aw-parser assigns `token.number = 1` to it like any other scene.
// Full narrative (this + the two other stacked export bugs it was found
// alongside): normalize-fountain.ts's uppercaseWysiwygElements doc comment.
// No maintained fork exists to patch upstream instead.
//
// Patch mechanics: the module's export is the `Liner` CONSTRUCTOR itself —
// script-model.js does `new fliner(helpers)`, and `.line` is assigned onto a
// fresh closure-local object INSIDE the constructor on every call, not a
// shared prototype — so this can't patch one instance's `.line`; it has to
// replace what `require("utils/liner")` itself returns, for every future
// caller. awrequire.js resolves that name through Node's own module cache
// (`Module._cache[resolvedPath].exports`), so mutating this require's result
// in place IS the same object every other `require("utils/liner")` call
// (including script-model.js's) gets back.
try {
  const OriginalLiner = require("utils/liner");
  const PatchedLiner = function (...args) {
    const instance =
      new.target ? Reflect.construct(OriginalLiner, args, new.target)
      : OriginalLiner.apply(this, args) || this;
    const originalLine = instance.line;
    instance.line = function patchedLine(tokens, cfg) {
      const lines = originalLine(tokens, cfg);
      // Backfill from the SOURCE tokens' own `.number` (already assigned by
      // aw-parser, including any explicit `#N#`/locked value) — never
      // reinvent a counter, which could disagree with a non-sequential
      // locked number. Scene-heading tokens and their first rendered line
      // appear in the same relative order in `tokens` and `lines`, so a
      // single forward pointer over `tokens` keeps them paired.
      let tokenIndex = 0;
      let prevWasSceneHeadingLine = false;
      for (const line of lines) {
        const isFirstLineOfHeading =
          line.local_index === 0 &&
          line.type === "scene_heading" &&
          !prevWasSceneHeadingLine;
        if (isFirstLineOfHeading) {
          while (
            tokenIndex < tokens.length &&
            !(tokens[tokenIndex].is && tokens[tokenIndex].is("scene_heading"))
          ) {
            tokenIndex++;
          }
          const sourceToken = tokens[tokenIndex];
          if (!line.number && sourceToken) line.number = sourceToken.number;
          tokenIndex++;
        }
        prevWasSceneHeadingLine = line.type === "scene_heading";
      }
      return lines;
    };
    return instance;
  };
  // Replace the cached module export in place, via Node's REAL module
  // cache (awrequire.js resolves "utils/liner" to this same absolute path
  // and looks it up through Module._cache too) — see comment above for why
  // this reaches every other `require("utils/liner")` call site too.
  const linerAbsolutePath = path.join(
    afterwritingDir,
    "js/utils/liner.js",
  );
  if (!NodeModule._cache[linerAbsolutePath]) {
    throw new Error(`utils/liner not yet in the module cache: ${linerAbsolutePath}`);
  }
  NodeModule._cache[linerAbsolutePath].exports = PatchedLiner;
} catch (e) {
  console.error("[awc-runner] failed to patch utils/liner scene numbering:", e);
  process.exit(1);
}

const Bootstrap = require("bootstrap");
const ClientConfig = require("client/client-config");
ClientConfig.awrequire = require;
Bootstrap.init(ClientConfig);
