#!/usr/bin/env node
// ponytail: post-build patch, not a real fix. `import "h3"` (TanStack
// Start's server HTTP framework) leaks into client route chunks —
// createServerFn's client/server split doesn't run inside the router
// plugin's own code-splitter, so neither `ssr.external` nor
// `resolve.alias` in app.config.ts ever sees these imports (verified:
// `postgres`/`node:crypto` aliases DO work for chunks that go through
// Vite's normal resolver; this one doesn't, because the route
// code-splitter uses its own Rollup pass).
//
// Two import shapes show up: a bare side-effect statement
// (`import"h3";`, in ~50 lazy route chunks) and a named import with
// bindings (`import{H3Event as OR,...}from"h3";`, in the always-loaded
// core client bundle). h3 is never invoked client-side either way —
// every real call goes through fetch to the server function endpoint —
// so the side-effect form is deleted outright, and the named form is
// replaced with local `const` bindings assigned to `undefined`
// (referencing them would throw, but nothing client-side ever does).
// Upgrade path: migrate to @tanstack/react-start with its Vite plugin,
// which ships "Import Protection" and strips this at the source instead
// of patching the output.
//
// Nitro precomputes each static asset's size/etag into its own server
// bundle (chunks/nitro/nitro.mjs) at build time — patching the file on
// disk without also patching that embedded manifest leaves Nitro serving
// a stale Content-Length, which makes browsers abort the fetch
// (net::ERR_CONTENT_LENGTH_MISMATCH) before the corrected — smaller —
// file ever reaches the client. Both must be patched together, and the
// manifest entry is located by finding its enclosing `{ ... }` object
// (brace-matched, not string-delimited) so a stray substring match in one
// entry can never bleed into its neighbor.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Same algorithm as the `etag` package (already a transitive dep of the
// server bundle, but not resolvable from this script's own module graph):
// weak-tag-free entity tag = "<byte-length-hex>-<sha1-base64, 27 chars>".
const computeEtag = (buffer) => {
  const hash = createHash("sha1")
    .update(buffer)
    .digest("base64")
    .slice(0, 27);
  return `"${buffer.length.toString(16)}-${hash}"`;
};

// Given the index of a `{` in `source`, return the index just past its
// matching `}` (simple depth counter — the manifest values here are plain
// JSON-ish objects/strings/arrays, no template literals or regex that
// could contain unbalanced braces).
const findMatchingBraceEnd = (source, openIdx) => {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      // skip over string literal, honoring backslash escapes
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("Unbalanced braces while scanning nitro.mjs manifest");
};

const WEB_ROOT = join(import.meta.dirname, "..");
const ASSETS_DIR = join(WEB_ROOT, ".output", "public", "_build", "assets");
const NITRO_CHUNK = join(
  WEB_ROOT,
  ".output",
  "server",
  "chunks",
  "nitro",
  "nitro.mjs",
);

// `import{H3Event as OR,getRequestURL as loe,...}from"h3";` — capture the
// binding list so each local alias can be redeclared as `undefined`.
const NAMED_IMPORT_RE = /import\{([^}]*)\}from"h3";/g;

const stubNamedImport = (_match, bindingList) => {
  const locals = bindingList.split(",").map((binding) => {
    const asIdx = binding.indexOf(" as ");
    return asIdx === -1 ? binding.trim() : binding.slice(asIdx + 4).trim();
  });
  return locals.map((local) => `const ${local}=void 0;`).join("");
};

let patched = 0;
const patchedFiles = [];
for (const file of readdirSync(ASSETS_DIR)) {
  if (!file.endsWith(".js")) continue;
  const filePath = join(ASSETS_DIR, file);
  const content = readFileSync(filePath, "utf8");
  const hasSideEffectImport = content.includes('import"h3";');
  const hasNamedImport = NAMED_IMPORT_RE.test(content);
  NAMED_IMPORT_RE.lastIndex = 0; // .test() with /g advances lastIndex
  if (!hasSideEffectImport && !hasNamedImport) continue;
  const patchedContent = content
    .replaceAll('import"h3";', "")
    .replace(NAMED_IMPORT_RE, stubNamedImport);
  writeFileSync(filePath, patchedContent);
  patched++;
  patchedFiles.push(file);
}

let manifestPatched = 0;
if (patched > 0) {
  let nitroSource = readFileSync(NITRO_CHUNK, "utf8");
  for (const file of patchedFiles) {
    const filePath = join(ASSETS_DIR, file);
    const buffer = readFileSync(filePath);
    const newSize = buffer.length;
    const newEtag = computeEtag(buffer).replaceAll('"', '\\"');
    const newMtime = statSync(filePath).mtime.toISOString();

    const key = `"/_build/assets/${file}": {`;
    const keyIdx = nitroSource.indexOf(key);
    if (keyIdx === -1) continue;
    const blockStart = keyIdx + key.length - 1; // index of the `{`
    const blockEnd = findMatchingBraceEnd(nitroSource, blockStart);
    const block = nitroSource.slice(blockStart, blockEnd);
    const patchedBlock = block
      .replace(/"etag": "(?:[^"\\]|\\.)*"/, `"etag": "${newEtag}"`)
      .replace(/"mtime": "[^"]*"/, `"mtime": "${newMtime}"`)
      .replace(/"size": \d+/, `"size": ${newSize}`);
    nitroSource =
      nitroSource.slice(0, blockStart) +
      patchedBlock +
      nitroSource.slice(blockEnd);
    manifestPatched++;
  }
  writeFileSync(NITRO_CHUNK, nitroSource);
}

console.log(
  `strip-h3-from-client: patched ${patched} asset file(s), ${manifestPatched} manifest entr${manifestPatched === 1 ? "y" : "ies"}`,
);
