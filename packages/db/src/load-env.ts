// Side-effect import: loads env vars from apps/web/.env so scripts running
// in this package (seed, etc.) have DATABASE_URL available.
// Drizzle config does the equivalent for migrations.
try {
  process.loadEnvFile("../../apps/web/.env");
} catch {
  // intentional — CI injects DATABASE_URL directly
}
