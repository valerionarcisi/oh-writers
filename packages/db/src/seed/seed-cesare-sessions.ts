// packages/db/src/seed/seed-cesare-sessions.ts
//
// Test-only helper: seeds N Cesare sessions for a given project/user, with
// the first `pinnedCount` marked pinned. Invoked from Playwright specs (via
// `execSync`, mirroring `reset.ts`) so E2E tests can exercise the LeftRail
// 5-row cap and "Vedi tutte" affordance without clicking "+ Nuova" N times
// through a real chat turn (session rows are otherwise only created on the
// first message send).
//
// Usage: tsx src/seed/seed-cesare-sessions.ts <projectId> <userId> <count> <pinnedCount>
import "../load-env";
import { db } from "../client";
import { cesareSessions } from "../schema/cesare-sessions";
import { and, eq } from "drizzle-orm";

const [projectIdArg, userIdArg, countArg, pinnedCountArg] =
  process.argv.slice(2);

if (!projectIdArg || !userIdArg || !countArg) {
  throw new Error(
    "Usage: seed-cesare-sessions.ts <projectId> <userId> <count> [pinnedCount]",
  );
}

async function main(
  projectId: string,
  userId: string,
  count: number,
  pinnedCount: number,
) {
  const now = Date.now();
  // Oldest first (lowest index = least recent) so the most recently
  // "created" session — and therefore the most recently active one once the
  // rail sorts by lastMessageAt — is the highest index, matching how a real
  // user's session list would grow over time.
  const rows = Array.from({ length: count }, (_, i) => {
    const lastMessageAt = new Date(now - (count - i) * 60_000);
    return {
      projectId,
      userId,
      title: `Sessione seed ${i + 1}`,
      lastMessageAt,
      createdAt: lastMessageAt,
      pinnedAt:
        i < pinnedCount ? new Date(now - (pinnedCount - i) * 1_000) : null,
    };
  });
  // Wipe-first so the seed is deterministic regardless of spec ordering:
  // `listSessions` lazily creates a "Default" session on first empty read, so
  // any earlier spec that merely VISITED the project leaves one extra row —
  // "Vedi tutte (7)" became "(8)" only in full-block runs (review finding).
  await db
    .delete(cesareSessions)
    .where(
      and(
        eq(cesareSessions.projectId, projectId),
        eq(cesareSessions.userId, userId),
      ),
    );
  await db.insert(cesareSessions).values(rows);
  console.log(`Seeded ${count} Cesare sessions (${pinnedCount} pinned).`);
  process.exit(0);
}

void main(
  projectIdArg,
  userIdArg,
  Number(countArg),
  Number(pinnedCountArg ?? 0),
);
