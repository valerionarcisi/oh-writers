import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: "esm",
  platform: "node",
  sourcemap: true,
  clean: true,
  // @oh-writers/domain and @oh-writers/utils ship raw TS source (no dist) —
  // bundle them in rather than externalizing, so the compiled output is
  // plain JS Node can run without a transpile-on-run step.
  noExternal: ["@oh-writers/domain", "@oh-writers/utils"],
});
