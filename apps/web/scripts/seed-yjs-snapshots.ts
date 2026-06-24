// Seed-time CRDT snapshots (Spec 72 / BUG-N53). Runs after the db-package
// seed (chained in the root `db:seed` / `db:seed:reset` scripts): populates
// every NULL CRDT from the seeded human-readable content so no realtime room
// ever depends on the first-client seed race. Idempotent — a non-NULL CRDT
// is never touched.
//
// Lives in apps/web (not packages/db) because building the snapshots needs
// the ProseMirror schemas + y-prosemirror, which are web-app territory.

import { and, eq, isNull, ne, inArray } from "drizzle-orm";
import { documents, screenplayVersions } from "@oh-writers/db/schema";
import { yjsSnapshotFromFountain } from "../app/features/screenplay-editor/server/yjs-seed.server";
import {
  PM_ROOM_DOC_TYPES,
  yjsStateFromNarrativeContent,
} from "../app/features/documents/server/yjs-seed.server";
import type { Db } from "@oh-writers/db";

async function seedScreenplayVersionSnapshots(db: Db): Promise<number> {
  const rows = await db
    .select({ id: screenplayVersions.id, content: screenplayVersions.content })
    .from(screenplayVersions)
    .where(
      and(
        isNull(screenplayVersions.yjsSnapshot),
        ne(screenplayVersions.content, ""),
      ),
    );

  let seeded = 0;
  for (const row of rows) {
    const snapshot = yjsSnapshotFromFountain(row.content);
    if (!snapshot) continue;
    await db
      .update(screenplayVersions)
      .set({ yjsSnapshot: snapshot })
      .where(eq(screenplayVersions.id, row.id));
    seeded += 1;
  }
  return seeded;
}

async function seedNarrativeDocumentStates(db: Db): Promise<number> {
  const rows = await db
    .select({ id: documents.id, content: documents.content })
    .from(documents)
    .where(
      and(
        isNull(documents.yjsState),
        ne(documents.content, ""),
        inArray(documents.type, [...PM_ROOM_DOC_TYPES]),
      ),
    );

  let seeded = 0;
  for (const row of rows) {
    const state = yjsStateFromNarrativeContent(row.content);
    if (!state) continue;
    await db
      .update(documents)
      .set({ yjsState: state })
      .where(eq(documents.id, row.id));
    seeded += 1;
  }
  return seeded;
}

async function main() {
  // The db client throws at import time without DATABASE_URL, so the env must
  // load before the module does. An already-exported DATABASE_URL wins (CI and
  // the test-db setup inject their own, pointing at a different database).
  if (!process.env["DATABASE_URL"]) {
    try {
      process.loadEnvFile(".env");
    } catch {
      // intentional — no .env when the var is injected directly
    }
  }
  const { db } = await import("@oh-writers/db");

  const versions = await seedScreenplayVersionSnapshots(db);
  const docs = await seedNarrativeDocumentStates(db);
  console.log(
    `  -> Yjs snapshots seeded: ${versions} screenplay version(s), ${docs} narrative document(s)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Yjs snapshot seed failed:", err);
    process.exit(1);
  });
