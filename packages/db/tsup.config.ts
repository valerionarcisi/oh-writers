import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "schema/index": "src/schema/index.ts",
  },
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["postgres", "drizzle-orm"],
});
