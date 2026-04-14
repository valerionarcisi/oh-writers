import { sql } from "drizzle-orm";
import { db } from "../client";

const TABLES_IN_DELETE_ORDER = [
  "ai_predictions",
  "characters",
  "scenes",
  "screenplay_branches",
  "screenplay_versions",
  "screenplays",
  "documents",
  "projects",
  "team_invitations",
  "team_members",
  "teams",
  "sessions",
  "accounts",
  "verifications",
  "users",
];

async function reset() {
  console.log("Resetting database...");

  for (const table of TABLES_IN_DELETE_ORDER) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
    console.log(`  -> Truncated ${table}`);
  }

  console.log("Tables truncated. Running seed...\n");

  const { seed } = await import("./index");
  await seed();
}

reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  });
