import { db } from "../client";
import {
  users,
  accounts,
  projects,
  documents,
  screenplays,
  screenplayVersions,
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
const TEST_PROJECT_ID = "00000000-0000-4000-a000-000000000010";
const TEST_SCREENPLAY_ID = "00000000-0000-4000-a000-000000000020";

const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";
const TEST_NAME = "Test User";

export async function seed() {
  process.stdout.write("Seeding database...\n");

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

  process.stdout.write("  -> Test user created\n");

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

  process.stdout.write("  -> Project created\n");

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

  process.stdout.write("  -> Documents created\n");

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

  process.stdout.write("  -> Screenplay created\n");

  // 5. One manual version — "v13 — 2025-11-11"
  await db
    .insert(screenplayVersions)
    .values({
      screenplayId: TEST_SCREENPLAY_ID,
      label: "v13 — 2025-11-11",
      content: NON_FA_RIDERE_FOUNTAIN,
      pageCount: 13,
      createdBy: TEST_USER_ID,
    })
    .onConflictDoNothing();

  process.stdout.write("  -> Manual version created\n");
  process.stdout.write("Seed complete.\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
