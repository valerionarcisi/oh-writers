import { db } from "../client";
import {
  users,
  accounts,
  projects,
  documents,
  screenplays,
  screenplayVersions,
  teams,
  teamMembers,
} from "../schema/index";
import {
  NON_FA_RIDERE_FOUNTAIN,
  NON_FA_RIDERE_LOGLINE,
  NON_FA_RIDERE_SYNOPSIS,
} from "./fixtures/non-fa-ridere.fountain";
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

  console.log("  -> Documents created");

  // 4. Screenplay — full Fountain text.
  // Use upsert so that re-running the seed after E2E test runs always restores
  // the clean Fountain content and wipes the pm_doc column (which accumulates
  // garbage from tests that type markers / DIFF text into the editor).
  await db
    .insert(screenplays)
    .values({
      id: TEST_SCREENPLAY_ID,
      projectId: TEST_PROJECT_ID,
      title: "Non fa ridere",
      content: NON_FA_RIDERE_FOUNTAIN,
      pageCount: 13,
      createdBy: TEST_USER_ID,
    })
    .onConflictDoUpdate({
      target: screenplays.id,
      set: { content: NON_FA_RIDERE_FOUNTAIN, pmDoc: null, pageCount: 13 },
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

  console.log("  -> Team project + documents created");

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
