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
const ALLOWED_PROFILE_KEYS = new Set([
  "right_margin",
  "line_spacing",
  "lines_per_page",
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
        if (!ALLOWED_PROFILE_KEYS.has(key)) continue;
        target[key] = patch[key];
      }
    }
  }
} catch (e) {
  console.error("[awc-runner] failed to apply OHW_PROFILE_OVERRIDES:", e);
  process.exit(1);
}

const Bootstrap = require("bootstrap");
const ClientConfig = require("client/client-config");
ClientConfig.awrequire = require;
Bootstrap.init(ClientConfig);
