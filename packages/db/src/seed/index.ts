import { db } from "../client";
import {
  users,
  accounts,
  projects,
  documents,
  documentVersions,
  screenplays,
  screenplayVersions,
  teams,
  teamMembers,
} from "../schema/index";
import { and, eq } from "drizzle-orm";
import {
  NON_FA_RIDERE_FOUNTAIN,
  NON_FA_RIDERE_LOGLINE,
  NON_FA_RIDERE_SYNOPSIS,
} from "./fixtures/non-fa-ridere.fountain";
import { buildPmDocFromFountain } from "./build-pm-doc";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { randomBytes, bytesToHex } from "@noble/hashes/utils.js";

// Matches Better Auth's hashPassword format: "salt:scrypt_hex"
// Config: N=16384, r=16, p=1, dkLen=64
async function hashPassword(password: string): Promise<string> {
  const salt = bytesToHex(randomBytes(16));
  const key = await scryptAsync(password.normalize("NFKC"), salt, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${bytesToHex(key)}`;
}

const TEST_USER_ID = "00000000-0000-4000-a000-000000000001";
const TEST_VIEWER_ID = "00000000-0000-4000-a000-000000000002";
const TEST_PROJECT_ID = "00000000-0000-4000-a000-000000000010";
const TEST_TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";
const TEST_SCREENPLAY_ID = "00000000-0000-4000-a000-000000000020";
const TEST_TEAM_ID = "00000000-0000-4000-a000-000000000030";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";
const TEST_NAME = "Test User";

const TEST_VIEWER_EMAIL = "viewer@ohwriters.dev";
const TEST_VIEWER_PASSWORD = "viewerpassword123";
const TEST_VIEWER_NAME = "Viewer User";

const TEST_TEAM_PROJECT_TITLE = "Team Thriller";

// ─── Valerio's personal dev account ───────────────────────────────────────
// Fixed UUIDs so re-running the seed is idempotent. Credentials are seed-only;
// never use outside local development.
const VALERIO_USER_ID = "00000000-0000-4000-a000-000000000003";
const VALERIO_VIEWER_ID = "00000000-0000-4000-a000-000000000004";
const VALERIO_PERSONAL_PROJECT_ID = "00000000-0000-4000-a000-000000000012";
const VALERIO_TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000013";
const VALERIO_SCREENPLAY_ID = "00000000-0000-4000-a000-000000000021";
const VALERIO_TEAM_ID = "00000000-0000-4000-a000-000000000031";

const VALERIO_EMAIL = "valerio@ohwriters.dev";
const VALERIO_PASSWORD = "valerio123";
const VALERIO_NAME = "Valerio";

const VALERIO_VIEWER_EMAIL = "collab@ohwriters.dev";
const VALERIO_VIEWER_PASSWORD = "collab123";
const VALERIO_VIEWER_NAME = "Collaboratore";

// Snapshot each seeded narrative document with non-empty content into a
// "Versione 1" row so the Versions popover is never empty on first open.
// Mirrors the screenplayVersions seed block below.
async function seedFirstDocumentVersions(projectId: string, userId: string) {
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId));
  for (const doc of docs) {
    if (doc.currentVersionId) continue;
    if (!doc.content || doc.content.length === 0) continue;
    const [version] = await db
      .insert(documentVersions)
      .values({
        documentId: doc.id,
        number: 1,
        label: "Versione 1",
        content: doc.content,
        createdBy: userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!version) continue;
    await db
      .update(documents)
      .set({ currentVersionId: version.id })
      .where(and(eq(documents.id, doc.id)));
  }
}

export async function seed() {
  console.log("Seeding database...");

  // 1. Test user
  const hashedPassword = await hashPassword(TEST_PASSWORD);

  await db
    .insert(users)
    .values({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      name: TEST_NAME,
      emailVerified: true,
    })
    .onConflictDoNothing();

  await db
    .insert(accounts)
    .values({
      id: `credential:${TEST_USER_ID}`,
      userId: TEST_USER_ID,
      accountId: TEST_USER_ID,
      providerId: "credential",
      password: hashedPassword,
    })
    .onConflictDoNothing();

  console.log("  -> Test user created");

  // 2. Project — "Non fa ridere"
  await db
    .insert(projects)
    .values({
      id: TEST_PROJECT_ID,
      title: "Non fa ridere",
      slug: "non-fa-ridere",
      genre: "comedy",
      format: "short",
      ownerId: TEST_USER_ID,
    })
    .onConflictDoNothing();

  console.log("  -> Project created");

  // 3. Documents — all four narrative docs
  await db
    .insert(documents)
    .values([
      {
        projectId: TEST_PROJECT_ID,
        type: "logline" as const,
        title: "Logline",
        content: NON_FA_RIDERE_LOGLINE,
        createdBy: TEST_USER_ID,
      },
      {
        projectId: TEST_PROJECT_ID,
        type: "synopsis" as const,
        title: "Synopsis",
        content: NON_FA_RIDERE_SYNOPSIS,
        createdBy: TEST_USER_ID,
      },
      {
        projectId: TEST_PROJECT_ID,
        type: "outline" as const,
        title: "Outline",
        content: "",
        createdBy: TEST_USER_ID,
      },
      {
        projectId: TEST_PROJECT_ID,
        type: "treatment" as const,
        title: "Treatment",
        content: "",
        createdBy: TEST_USER_ID,
      },
    ])
    .onConflictDoNothing();

  await seedFirstDocumentVersions(TEST_PROJECT_ID, TEST_USER_ID);

  console.log("  -> Documents created");

  // 4. Screenplay — full Fountain text.
  // Use upsert so that re-running the seed after E2E test runs always restores
  // the clean Fountain content and refreshes the pm_doc column with a freshly
  // numbered doc (scene_number: "1", "2", … scene_number_locked: false) so
  // the left-gutter scene-number buttons are visible on first load.
  const nonFaRiderePmDoc = buildPmDocFromFountain(NON_FA_RIDERE_FOUNTAIN);
  await db
    .insert(screenplays)
    .values({
      id: TEST_SCREENPLAY_ID,
      projectId: TEST_PROJECT_ID,
      title: "Non fa ridere",
      content: NON_FA_RIDERE_FOUNTAIN,
      pmDoc: nonFaRiderePmDoc,
      pageCount: 13,
      createdBy: TEST_USER_ID,
    })
    .onConflictDoUpdate({
      target: screenplays.id,
      set: {
        content: NON_FA_RIDERE_FOUNTAIN,
        pmDoc: nonFaRiderePmDoc,
        pageCount: 13,
      },
    });

  console.log("  -> Screenplay created");

  // 5. One manual version — "v13 — 2025-11-11"
  await db
    .insert(screenplayVersions)
    .values({
      screenplayId: TEST_SCREENPLAY_ID,
      label: "v13 — 2025-11-11",
      content: NON_FA_RIDERE_FOUNTAIN,
      pageCount: 13,
      number: 1,
      createdBy: TEST_USER_ID,
    })
    .onConflictDoNothing();

  console.log("  -> Manual version created");

  // 6. Viewer user — for E2E role-guard tests (Spec 04, block 2)
  const hashedViewerPassword = await hashPassword(TEST_VIEWER_PASSWORD);

  await db
    .insert(users)
    .values({
      id: TEST_VIEWER_ID,
      email: TEST_VIEWER_EMAIL,
      name: TEST_VIEWER_NAME,
      emailVerified: true,
    })
    .onConflictDoNothing();

  await db
    .insert(accounts)
    .values({
      id: `credential:${TEST_VIEWER_ID}`,
      userId: TEST_VIEWER_ID,
      accountId: TEST_VIEWER_ID,
      providerId: "credential",
      password: hashedViewerPassword,
    })
    .onConflictDoNothing();

  console.log("  -> Viewer user created");

  // 7. Team — test user (owner) + viewer user (viewer)
  await db
    .insert(teams)
    .values({
      id: TEST_TEAM_ID,
      name: "Test Team",
      slug: "test-team",
      createdBy: TEST_USER_ID,
    })
    .onConflictDoNothing();

  await db
    .insert(teamMembers)
    .values([
      {
        teamId: TEST_TEAM_ID,
        userId: TEST_USER_ID,
        role: "owner" as const,
      },
      {
        teamId: TEST_TEAM_ID,
        userId: TEST_VIEWER_ID,
        role: "viewer" as const,
      },
    ])
    .onConflictDoNothing();

  console.log("  -> Team + memberships created");

  // 8. Team project (teamId set, ownerId null) + narrative docs
  await db
    .insert(projects)
    .values({
      id: TEST_TEAM_PROJECT_ID,
      title: TEST_TEAM_PROJECT_TITLE,
      slug: "team-thriller",
      genre: "thriller",
      format: "feature",
      teamId: TEST_TEAM_ID,
    })
    .onConflictDoNothing();

  await db
    .insert(documents)
    .values([
      {
        projectId: TEST_TEAM_PROJECT_ID,
        type: "logline" as const,
        title: "Logline",
        content: "A detective chases a killer through a silent city.",
        createdBy: TEST_USER_ID,
      },
      {
        projectId: TEST_TEAM_PROJECT_ID,
        type: "synopsis" as const,
        title: "Synopsis",
        content: "",
        createdBy: TEST_USER_ID,
      },
      {
        projectId: TEST_TEAM_PROJECT_ID,
        type: "outline" as const,
        title: "Outline",
        content: "",
        createdBy: TEST_USER_ID,
      },
      {
        projectId: TEST_TEAM_PROJECT_ID,
        type: "treatment" as const,
        title: "Treatment",
        content: "",
        createdBy: TEST_USER_ID,
      },
    ])
    .onConflictDoNothing();

  await seedFirstDocumentVersions(TEST_TEAM_PROJECT_ID, TEST_USER_ID);

  console.log("  -> Team project + documents created");

  // ─── 9. Valerio's personal dev account ─────────────────────────────────
  const valerioHash = await hashPassword(VALERIO_PASSWORD);
  const valerioViewerHash = await hashPassword(VALERIO_VIEWER_PASSWORD);

  await db
    .insert(users)
    .values([
      {
        id: VALERIO_USER_ID,
        email: VALERIO_EMAIL,
        name: VALERIO_NAME,
        emailVerified: true,
      },
      {
        id: VALERIO_VIEWER_ID,
        email: VALERIO_VIEWER_EMAIL,
        name: VALERIO_VIEWER_NAME,
        emailVerified: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(accounts)
    .values([
      {
        id: `credential:${VALERIO_USER_ID}`,
        userId: VALERIO_USER_ID,
        accountId: VALERIO_USER_ID,
        providerId: "credential",
        password: valerioHash,
      },
      {
        id: `credential:${VALERIO_VIEWER_ID}`,
        userId: VALERIO_VIEWER_ID,
        accountId: VALERIO_VIEWER_ID,
        providerId: "credential",
        password: valerioViewerHash,
      },
    ])
    .onConflictDoNothing();

  console.log("  -> Valerio + collaborator users created");

  // Personal project (solo-owned) with full narrative docs + title page.
  await db
    .insert(projects)
    .values({
      id: VALERIO_PERSONAL_PROJECT_ID,
      title: "Non fa ridere",
      slug: "valerio-non-fa-ridere",
      genre: "comedy",
      format: "short",
      ownerId: VALERIO_USER_ID,
      titlePageAuthor: "Valerio Narcisi",
      titlePageContact: "valerio@ohwriters.dev",
      titlePageDraftColor: "white",
      titlePageNotes: "First draft — demo project for feature tour.",
    })
    .onConflictDoNothing();

  await db
    .insert(documents)
    .values([
      {
        projectId: VALERIO_PERSONAL_PROJECT_ID,
        type: "logline" as const,
        title: "Logline",
        content: NON_FA_RIDERE_LOGLINE,
        createdBy: VALERIO_USER_ID,
      },
      {
        projectId: VALERIO_PERSONAL_PROJECT_ID,
        type: "synopsis" as const,
        title: "Synopsis",
        content: NON_FA_RIDERE_SYNOPSIS,
        createdBy: VALERIO_USER_ID,
      },
      {
        projectId: VALERIO_PERSONAL_PROJECT_ID,
        type: "outline" as const,
        title: "Outline",
        content:
          "ATTO I\n- Filippo prepara l'Open Grezzo di nascosto.\n- Giulio ignora tutto; Tea sospetta.\n\nATTO II\n- La serata va fuori controllo.\n- Il nonno morto appare.\n\nATTO III\n- Filippo sale sul palco e si libera.\n- Giulio lo colpisce; il nonno ride.",
        createdBy: VALERIO_USER_ID,
      },
      {
        projectId: VALERIO_PERSONAL_PROJECT_ID,
        type: "treatment" as const,
        title: "Treatment",
        content:
          "Filippo ha quarant'anni e cammina tra i tavoli della pizzeria del suocero come se fosse una condanna. Stasera, però, ha un piano: ha trasformato la sala in un open mic comedy senza dirlo a nessuno, l'Open Grezzo...",
        createdBy: VALERIO_USER_ID,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(screenplays)
    .values({
      id: VALERIO_SCREENPLAY_ID,
      projectId: VALERIO_PERSONAL_PROJECT_ID,
      title: "Non fa ridere",
      content: NON_FA_RIDERE_FOUNTAIN,
      pmDoc: nonFaRiderePmDoc,
      pageCount: 13,
      createdBy: VALERIO_USER_ID,
    })
    .onConflictDoUpdate({
      target: screenplays.id,
      set: {
        content: NON_FA_RIDERE_FOUNTAIN,
        pmDoc: nonFaRiderePmDoc,
        pageCount: 13,
      },
    });

  await db
    .insert(screenplayVersions)
    .values({
      screenplayId: VALERIO_SCREENPLAY_ID,
      label: "First draft — 2026-04-17",
      content: NON_FA_RIDERE_FOUNTAIN,
      pageCount: 13,
      number: 1,
      createdBy: VALERIO_USER_ID,
    })
    .onConflictDoNothing();

  await seedFirstDocumentVersions(VALERIO_PERSONAL_PROJECT_ID, VALERIO_USER_ID);

  console.log("  -> Valerio personal project + screenplay + version created");

  // Team project: Valerio = owner, collaborator = viewer. Lets you see
  // role-guard behaviour (viewer is read-only on every mutation).
  await db
    .insert(teams)
    .values({
      id: VALERIO_TEAM_ID,
      name: "Valerio's Crew",
      slug: "valerio-crew",
      createdBy: VALERIO_USER_ID,
    })
    .onConflictDoNothing();

  await db
    .insert(teamMembers)
    .values([
      {
        teamId: VALERIO_TEAM_ID,
        userId: VALERIO_USER_ID,
        role: "owner" as const,
      },
      {
        teamId: VALERIO_TEAM_ID,
        userId: VALERIO_VIEWER_ID,
        role: "viewer" as const,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(projects)
    .values({
      id: VALERIO_TEAM_PROJECT_ID,
      title: "La città silenziosa",
      slug: "valerio-team-thriller",
      genre: "thriller",
      format: "feature",
      teamId: VALERIO_TEAM_ID,
      titlePageAuthor: "Valerio Narcisi & Collaboratore",
      titlePageContact: "valerio@ohwriters.dev",
      titlePageDraftColor: "blue",
    })
    .onConflictDoNothing();

  await db
    .insert(documents)
    .values([
      {
        projectId: VALERIO_TEAM_PROJECT_ID,
        type: "logline" as const,
        title: "Logline",
        content:
          "Una detective insonne insegue un killer seriale in una città dove il suono è stato bandito.",
        createdBy: VALERIO_USER_ID,
      },
      {
        projectId: VALERIO_TEAM_PROJECT_ID,
        type: "synopsis" as const,
        title: "Synopsis",
        content:
          "In una metropoli governata dal silenzio, Alma Ricci è l'unica poliziotta che ancora parla.",
        createdBy: VALERIO_USER_ID,
      },
      {
        projectId: VALERIO_TEAM_PROJECT_ID,
        type: "outline" as const,
        title: "Outline",
        content: "",
        createdBy: VALERIO_USER_ID,
      },
      {
        projectId: VALERIO_TEAM_PROJECT_ID,
        type: "treatment" as const,
        title: "Treatment",
        content: "",
        createdBy: VALERIO_USER_ID,
      },
    ])
    .onConflictDoNothing();

  await seedFirstDocumentVersions(VALERIO_TEAM_PROJECT_ID, VALERIO_USER_ID);

  console.log("  -> Valerio team project created");

  console.log("Seed complete.");
  console.log("");
  console.log("  Login: valerio@ohwriters.dev / valerio123");
  console.log("  Viewer: collab@ohwriters.dev / collab123");
  console.log("");
}

// Only auto-run when this file is the entrypoint (tsx src/seed/index.ts).
// reset.ts imports { seed } from here and invokes it explicitly — running it
// twice concurrently trips the screenplays.project_id unique constraint.
const isDirectEntry =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectEntry) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
