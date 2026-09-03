import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // The ai@6 bundle imports from "zod/v4" (a zod v4 subpath). The project
    // uses zod v3, which does not export that subpath. Redirect it to the
    // main zod entrypoint so the import resolves without error during tests.
    // Remove once the project upgrades to zod v4.
    alias: {
      "zod/v4": "zod",
    },
  },
  test: {
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "../../packages/domain/src/**/*.test.ts",
      "../../packages/ui/src/**/*.test.ts",
      "../../packages/utils/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
