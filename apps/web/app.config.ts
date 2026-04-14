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
      exclude: ["postgres", "@oh-writers/db"],
    },
    ssr: {
      external: ["postgres", "@oh-writers/db"],
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
          alias: {
            "node:async_hooks": path.resolve("./src/shims/async-hooks.js"),
          },
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
