import { defineConfig } from "drizzle-kit";

// drizzle-kit runs with CWD=packages/db, so the relative path resolves correctly.
// No-op if the file doesn't exist (CI injects DATABASE_URL via environment).
try {
  process.loadEnvFile("../../apps/web/.env");
} catch {
  // intentional
}

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"],
  },
  verbose: true,
  strict: true,
});
