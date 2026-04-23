import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "../../packages/domain/src/**/*.test.ts",
      "../../packages/ui/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
