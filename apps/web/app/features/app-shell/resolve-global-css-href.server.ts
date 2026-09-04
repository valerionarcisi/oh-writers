import { createServerFn } from "@tanstack/start";

// ponytail: works around @tanstack/start (legacy) never linking the client
// entry's own CSS — HeadContent only emits rel="modulepreload" for anything
// in a route's `preloads`, with no .css special-case, so the compiled
// `<link rel="stylesheet">` this app needs (global.css -> tokens.css) is
// simply never produced anywhere in the framework. Reading the hashed
// filename straight from the Vite manifest that ships next to the server
// bundle and returning it as a root-route `head().links` entry is the only
// place in this stack that reliably renders as a real stylesheet link.
// Upgrade path: @tanstack/react-start, whose Vite plugin wires this up.
//
// Must be a createServerFn (not a plain server-only import) for the same
// reason resolveLocale is one: the route code-splitter doesn't strip
// node:fs/node:path from the client chunk on a bare import, only on an RPC
// call. See resolve-locale.server.ts.

type ViteManifest = Record<
  string,
  { isEntry?: boolean; css?: string[]; imports?: string[] }
>;

export const findGlobalCssHref = (
  manifest: ViteManifest,
): string | undefined => {
  const entryChunk = Object.values(manifest).find((c) => c.isEntry);
  const cssFile = [
    ...(entryChunk?.css ?? []),
    ...(entryChunk?.imports ?? []).flatMap((k) => manifest[k]?.css ?? []),
  ][0];
  return cssFile ? `/_build/${cssFile}` : undefined;
};

let cache: { href: string | undefined } | undefined;

const resolveGlobalCssHrefImpl = async (): Promise<string | undefined> => {
  if (import.meta.env.DEV) return undefined;
  if (cache) return cache.href;

  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  // Where the manifest sits relative to a known anchor differs by how the
  // server was launched: docker/Dockerfile.web copies .output's CONTENTS
  // straight into /app (no .output prefix survives there), while a local
  // `vinxi build` + `node .output/server/index.mjs` keeps the .output
  // wrapper — so a single hardcoded relative path can't cover both. Nitro
  // also rewrites every chunk's `import.meta.url` to read a single
  // `globalThis._importMeta_.url` set once in server/index.mjs to ITS OWN
  // url (confirmed by reading the compiled output) rather than leaving
  // each chunk's real location, so "here" always resolves to server/ no
  // matter which chunk this code lands in after bundling. Try every
  // layout this could be; the first real file wins.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "public", "_build", ".vite", "manifest.json"),
    join(here, "..", "..", "public", "_build", ".vite", "manifest.json"),
    join(
      process.cwd(),
      ".output",
      "public",
      "_build",
      ".vite",
      "manifest.json",
    ),
    join(process.cwd(), "public", "_build", ".vite", "manifest.json"),
  ];

  let lastError: unknown;
  for (const manifestPath of candidates) {
    try {
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as ViteManifest;
      cache = { href: findGlobalCssHref(manifest) };
      return cache.href;
    } catch (error) {
      lastError = error;
    }
  }

  const { logger } = await import("~/server/logger");
  logger.error(
    { cause: String(lastError) },
    "app_shell.global_css_href_resolve_failed",
  );
  cache = { href: undefined };
  return cache.href;
};

export const resolveGlobalCssHref = createServerFn({ method: "GET" }).handler(
  resolveGlobalCssHrefImpl,
);
