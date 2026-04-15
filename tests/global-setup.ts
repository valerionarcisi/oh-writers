/**
 * Playwright global setup — runs once before all tests.
 *
 * Truncates all tables and reseeds the test database so every test run starts
 * from a known-clean state. This prevents garbage from prior runs (e.g.
 * projects created by screenplay-authoring tests) from poisoning the next run.
 *
 * Targets oh-writers_test, never the dev database.
 */
import { execSync } from "child_process";
import path from "path";

const root = path.resolve(__dirname, "..");

const TEST_DB_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test";

export default async function globalSetup() {
  execSync("pnpm --filter @oh-writers/db seed:reset", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DB_URL,
    },
  });
}
