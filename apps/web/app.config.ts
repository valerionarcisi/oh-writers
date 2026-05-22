import path from "node:path";
import { defineConfig } from "@tanstack/start/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    // @ts-expect-error port is supported at runtime by vinxi but missing from TanStack Start types
    port: parseInt(process.env["PORT"] ?? "3000"),
  },
  vite: {
    plugins: [
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
    ],
    // Prevent Node.js-only packages (DB drivers) from being bundled into the
    // client bundle. createServerFn handlers are server-only but static analysis
    // can still include transitive server imports in the client chunk.
    optimizeDeps: {
      exclude: ["postgres", "@oh-writers/db", "pdfkit", "pdf-parse"],
    },
    ssr: {
      external: ["postgres", "@oh-writers/db", "pdfkit", "pdf-parse"],
    },
    // Expose the MOCK_AI build-env flag to the client bundle so the UI
    // can opt out of side effects that race the test harness (e.g. the
    // breakdown page's auto-spoglio mutation, see BreakdownPage.tsx).
    define: {
      "import.meta.env.MOCK_AI": JSON.stringify(
        process.env["MOCK_AI"] === "true",
      ),
    },
  },
  routers: {
    // Provide a browser no-op shim for node:async_hooks so that server-side
    // TanStack Start packages (h3 adapter) that import AsyncLocalStorage at
    // module level don't crash when their code is inadvertently included in
    // the client bundle.
    client: {
      vite: {
        resolve: {
          // Vite walks aliases as an array in order and prefix-matches. Keep
          // `node:stream/web` before `node:stream` so the longer key wins.
          alias: [
            {
              find: "node:async_hooks",
              replacement: path.resolve("./src/shims/async-hooks.js"),
            },
            // Postgres driver pulls in `perf_hooks`/`net`/`tls` which Vite
            // externalises in browser mode and then fails at Rollup time
            // because the resulting stub does not export `performance`. The
            // real driver never runs client-side: every DB call goes through
            // a server function. Stub the package so Rollup can short-circuit.
            {
              find: /^postgres$/,
              replacement: path.resolve("./src/shims/postgres.js"),
            },
            // `node:stream/web` and `node:stream` are imported at module level
            // by @tanstack/start-server-core for SSR rendering. Browser bundle
            // never invokes that code path, but the import must resolve so
            // Rollup completes the build. Order matters: longest prefix first.
            {
              find: "node:stream/web",
              replacement: path.resolve("./src/shims/node-stream-web.js"),
            },
            {
              find: /^node:stream$/,
              replacement: path.resolve("./src/shims/node-stream.js"),
            },
          ],
        },
      },
    },
    api: {
      vite: {
        plugins: [
          tsConfigPaths({
            projects: ["./tsconfig.json"],
          }),
        ],
      },
    },
  },
});
