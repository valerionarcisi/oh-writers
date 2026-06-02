import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The CI unit lane runs `pnpm test:unit` with no `@oh-writers/db` build step and
// no DATABASE_URL, so the package's `exports` (which point at `dist/`) cannot be
// resolved by Vite. Alias the package to its TypeScript source so the test files
// resolve without a build; the DB-touching suites then mock `@oh-writers/db`
// (persistence.test) or skip without DATABASE_URL (ws-integration.test), so
// `client.ts`'s import-time `DATABASE_URL is required` throw never executes.
const dbSrc = (path: string): string =>
  fileURLToPath(new URL(`../../packages/db/src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@oh-writers/db/schema": dbSrc("schema/index.ts"),
      "@oh-writers/db": dbSrc("index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
