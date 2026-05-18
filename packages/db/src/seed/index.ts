import "../load-env";
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
  scenes,
  breakdownElements,
  breakdownOccurrences,
  projectRateCard,
  locationRequirements,
  locationCandidates,
  budgets,
  budgetLines,
  budgetCast,
  budgetCrew,
  schedules,
  shootingDays,
  strips,
  productionRates,
} from "../schema/index";
import { and, eq } from "drizzle-orm";
import {
  TEAM_PROJECT_BREAKDOWN_SCENES,
  TEST_BREAKDOWN_ELEMENT_ID,
  TEST_BREAKDOWN_OCCURRENCE_ID,
  SEEDED_BREAKDOWN_ELEMENT_NAME,
  SEEDED_BREAKDOWN_ELEMENT_CATEGORY,
  SEEDED_PENDING_ELEMENT_CATEGORY,
  SEEDED_PENDING_GHOSTS,
  SEEDED_PENDING_GHOSTS_SCENE2,
  TEST_BREAKDOWN_SCENE_2_ID,
} from "./fixtures/breakdown-fixtures";
import {
  NON_FA_RIDERE_FOUNTAIN,
  NON_FA_RIDERE_LOGLINE,
  NON_FA_RIDERE_SYNOPSIS,
  NON_FA_RIDERE_TITLE_PAGE_DOC,
} from "./fixtures/non-fa-ridere.fountain";
import { buildPmDocFromFountain } from "./build-pm-doc";
import { seedFundraisingSources } from "./fundraising-sources";

// Mirror of `SOGGETTO_INITIAL_TEMPLATE` from `@oh-writers/domain`
// (packages/domain/src/subject/template.ts). Inlined here to keep the db
// package's `rootDir: src` contract intact — importing across package
// sources would drag the entire domain tree into tsc.
const SOGGETTO_INITIAL_TEMPLATE =
  "Milano, fine anni Novanta. Marta, trentacinque anni, traduttrice freelance, vive sola in un bilocale che le sta troppo stretto. Ha smesso da tempo di credere di poter cambiare qualcosa: lavora, paga l'affitto, evita di pensare a suo padre — un uomo che non vede da quindici anni e di cui ha appena ricevuto la notizia della morte.\n\nTornata al paese per il funerale, Marta scopre che il padre le ha lasciato in eredità una vecchia libreria. Decide di venderla in fretta e ripartire. Ma il giorno prima della firma, tra gli scatoloni, trova un manoscritto inedito firmato da sua madre — morta quando lei aveva sette anni.\n\nLeggendolo, Marta capisce che la storia di sua madre era ben diversa da quella che le era stata raccontata. Decide di restare un altro giorno. Poi un altro. Riapre la libreria, cerca chi ha conosciuto sua madre, ricostruisce un'identità che non sapeva di aver perso. La firma del rogito le scivola di mano: la libreria non si vende più.\n\nCancella questo testo e scrivi il tuo soggetto. Puoi usare i titoli (H1) per dividere atti o capitoli, oppure scrivere tutto di seguito — il formato è libero.\n";
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
const TEST_TEAM_SCREENPLAY_ID = "00000000-0000-4000-a000-000000000022";
const TEST_TEAM_SCREENPLAY_VERSION_ID = "00000000-0000-4000-a000-000000000023";

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

// ─── Locations seed IDs ────────────────────────────────────────────────────
export const SEEDED_LOCATION_REQ_1_ID = "00000000-0000-4000-a000-000000000040";
export const SEEDED_LOCATION_REQ_2_ID = "00000000-0000-4000-a000-000000000041";
export const SEEDED_LOCATION_CANDIDATE_1_ID =
  "00000000-0000-4000-a000-000000000050";
export const SEEDED_LOCATION_CANDIDATE_2_ID =
  "00000000-0000-4000-a000-000000000051";
// Breakdown element for the "sync from breakdown" test scenario
export const SEEDED_LOCATION_BREAKDOWN_ELEMENT_ID =
  "00000000-0000-4000-a000-000000000060";
export const SEEDED_LOCATION_BREAKDOWN_ELEMENT_NAME = "Libreria del padre";

// ─── Scene heading parser (seed-only) ─────────────────────────────────────
// Mirrors the live editor's heading detection just enough to materialise the
// `scenes` rows the /breakdown route reads from. Not exhaustive — covers
// every heading present in the bundled Fountain fixtures.
const SCENE_HEAD_RE =
  /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?\/EST\.?|EST\.?\/INT\.?|I\/E|INT\.?|EXT\.?|EST\.?)\s+(.*)$/;

function parseSceneHeading(raw: string): {
  intExt: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string | null;
} | null {
  const m = SCENE_HEAD_RE.exec(raw.trim());
  if (!m) return null;
  const prefix = m[1]!.replace(/\./g, "");
  const rest = m[2]!.trim();
  const intExt =
    prefix === "INT" ? "INT" : prefix === "EXT" ? "EXT" : "INT/EXT";
  const parts = rest.split(/\s+-\s+/);
  let timeOfDay: string | null = null;
  let location = rest;
  if (parts.length >= 2) {
    timeOfDay = parts[parts.length - 1]!.trim();
    location = parts.slice(0, -1).join(" - ").trim();
  }
  return { intExt, location, timeOfDay };
}

async function seedScenesFromFountain(
  screenplayId: string,
  fountainText: string,
): Promise<number> {
  const lines = fountainText.split("\n");
  // Two-pass so each scene gets the body that lives between its heading and
  // the next heading. Auto-spoglio (Spec 10e) reads `scene.notes` as the
  // scene text — without the body it can only extract the location from the
  // slugline, which is exactly the "vedo solo location" symptom users hit.
  const headingIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!/^(INT|EXT|EST|I\/E)/.test(trimmed)) continue;
    if (!parseSceneHeading(trimmed)) continue;
    headingIndices.push(i);
  }
  for (let n = 0; n < headingIndices.length; n++) {
    const start = headingIndices[n]!;
    const end = headingIndices[n + 1] ?? lines.length;
    const heading = lines[start]!.trim();
    const parsed = parseSceneHeading(heading)!;
    const body = lines
      .slice(start + 1, end)
      .join("\n")
      .trim();
    await db
      .insert(scenes)
      .values({
        screenplayId,
        number: n + 1,
        heading,
        intExt: parsed.intExt,
        location: parsed.location,
        timeOfDay: parsed.timeOfDay,
        notes: body.length > 0 ? body : null,
      })
      .onConflictDoUpdate({
        target: [scenes.screenplayId, scenes.number],
        set: { notes: body.length > 0 ? body : null },
      });
  }
  return headingIndices.length;
}

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
      titlePageAuthor: "Valerio Narcisi & Stefano Teodori",
      titlePageDoc: NON_FA_RIDERE_TITLE_PAGE_DOC,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        titlePageAuthor: "Valerio Narcisi & Stefano Teodori",
        titlePageDoc: NON_FA_RIDERE_TITLE_PAGE_DOC,
      },
    });

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
        type: "soggetto" as const,
        title: "Soggetto",
        content: SOGGETTO_INITIAL_TEMPLATE,
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

  process.stdout.write("  -> Documents created\n");

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

  process.stdout.write("  -> Screenplay created\n");

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

  const testScreenplayVersion = await db.query.screenplayVersions.findFirst({
    where: (v, { and: a, eq: e }) =>
      a(e(v.screenplayId, TEST_SCREENPLAY_ID), e(v.number, 1)),
  });
  if (testScreenplayVersion) {
    await db
      .update(screenplays)
      .set({ currentVersionId: testScreenplayVersion.id })
      .where(eq(screenplays.id, TEST_SCREENPLAY_ID));
  }

  const testScenesCount = await seedScenesFromFountain(
    TEST_SCREENPLAY_ID,
    NON_FA_RIDERE_FOUNTAIN,
  );

  console.log(`  -> Manual version + ${testScenesCount} scenes created`);

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
        type: "soggetto" as const,
        title: "Soggetto",
        content: SOGGETTO_INITIAL_TEMPLATE,
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

  await seedTeamProjectBreakdownFixtures();

  await seedLocations();

  // Rate card defaults for the seeded project so Cast/Troupe in Per-categoria
  // show populated values right after a fresh seed. Real rates come from the
  // future spec 24 cascading pre-fill (auto-derive from format×genre×country).
  await seedDefaultRateCard(TEST_PROJECT_ID);
  await seedDefaultProductionRates(TEST_PROJECT_ID);
  await seedDefaultProductionRates(TEST_TEAM_PROJECT_ID);

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
      titlePageDoc: NON_FA_RIDERE_TITLE_PAGE_DOC,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        titlePageAuthor: "Valerio Narcisi",
        titlePageContact: "valerio@ohwriters.dev",
        titlePageDraftColor: "white",
        titlePageNotes: "First draft — demo project for feature tour.",
        titlePageDoc: NON_FA_RIDERE_TITLE_PAGE_DOC,
      },
    });

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
        type: "soggetto" as const,
        title: "Soggetto",
        content: SOGGETTO_INITIAL_TEMPLATE,
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

  const valerioScreenplayVersion = await db.query.screenplayVersions.findFirst({
    where: (v, { and: a, eq: e }) =>
      a(e(v.screenplayId, VALERIO_SCREENPLAY_ID), e(v.number, 1)),
  });
  if (valerioScreenplayVersion) {
    await db
      .update(screenplays)
      .set({ currentVersionId: valerioScreenplayVersion.id })
      .where(eq(screenplays.id, VALERIO_SCREENPLAY_ID));
  }

  const valerioScenesCount = await seedScenesFromFountain(
    VALERIO_SCREENPLAY_ID,
    NON_FA_RIDERE_FOUNTAIN,
  );

  await seedFirstDocumentVersions(VALERIO_PERSONAL_PROJECT_ID, VALERIO_USER_ID);
  await seedValerioBudget(VALERIO_PERSONAL_PROJECT_ID);
  await seedValerioSchedule(VALERIO_SCREENPLAY_ID, VALERIO_PERSONAL_PROJECT_ID);
  await seedDefaultProductionRates(VALERIO_PERSONAL_PROJECT_ID);

  console.log(
    `  -> Valerio personal project + screenplay + version + ${valerioScenesCount} scenes created`,
  );

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
        type: "soggetto" as const,
        title: "Soggetto",
        content: SOGGETTO_INITIAL_TEMPLATE,
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
  await seedDefaultProductionRates(VALERIO_TEAM_PROJECT_ID);

  console.log("  -> Valerio team project created");

  await seedFundraisingSources();

  console.log("Seed complete.");
  console.log("");
  console.log("  Login: valerio@ohwriters.dev / valerio123");
  console.log("  Viewer: collab@ohwriters.dev / collab123");
  console.log("");
}

// ─── Spec 10 — Breakdown fixtures for the team project ─────────────────────
// Seeds: a screenplay row + initial version + 2 scene rows + one accepted
// breakdown element/occurrence so the /breakdown route renders meaningful
// data on first load. Idempotent.
async function seedTeamProjectBreakdownFixtures() {
  const nonFaRiderePmDoc = buildPmDocFromFountain(NON_FA_RIDERE_FOUNTAIN);
  await db
    .insert(screenplays)
    .values({
      id: TEST_TEAM_SCREENPLAY_ID,
      projectId: TEST_TEAM_PROJECT_ID,
      title: "Team Thriller",
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

  await db
    .insert(screenplayVersions)
    .values({
      id: TEST_TEAM_SCREENPLAY_VERSION_ID,
      screenplayId: TEST_TEAM_SCREENPLAY_ID,
      label: "v1",
      number: 1,
      content: NON_FA_RIDERE_FOUNTAIN,
      pageCount: 13,
      createdBy: TEST_USER_ID,
    })
    .onConflictDoUpdate({
      target: screenplayVersions.id,
      set: {
        content: NON_FA_RIDERE_FOUNTAIN,
        pageCount: 13,
      },
    });

  await db
    .update(screenplays)
    .set({ currentVersionId: TEST_TEAM_SCREENPLAY_VERSION_ID })
    .where(eq(screenplays.id, TEST_TEAM_SCREENPLAY_ID));

  // Hardcoded scenes 1-5 (preserve stable IDs for helpers), then pad with
  // fountain-parsed scenes so `scenesRef.length` in ScriptReader matches the
  // PM doc heading count. Without this the scroll-driven TOC tracking falls
  // off the end of the array past the last hardcoded scene.
  // Use onConflictDoUpdate so re-seeding refreshes notes content (Cesare RAG).
  for (const s of TEAM_PROJECT_BREAKDOWN_SCENES) {
    await db
      .insert(scenes)
      .values({
        id: s.id,
        screenplayId: TEST_TEAM_SCREENPLAY_ID,
        number: s.number,
        heading: s.heading,
        intExt: s.intExt,
        location: s.location,
        timeOfDay: s.timeOfDay,
        notes: s.notes,
      })
      .onConflictDoUpdate({
        target: [scenes.id],
        set: { notes: s.notes, heading: s.heading },
      });
  }

  const fountainHeadings: {
    heading: string;
    parsed: ReturnType<typeof parseSceneHeading>;
  }[] = [];
  for (const raw of NON_FA_RIDERE_FOUNTAIN.split("\n")) {
    const trimmed = raw.trim();
    if (!/^(INT|EXT|EST|I\/E)/.test(trimmed)) continue;
    const parsed = parseSceneHeading(trimmed);
    if (!parsed) continue;
    fountainHeadings.push({ heading: trimmed, parsed });
  }
  let sceneNumber = TEAM_PROJECT_BREAKDOWN_SCENES.length;
  for (
    let i = TEAM_PROJECT_BREAKDOWN_SCENES.length;
    i < fountainHeadings.length;
    i++
  ) {
    sceneNumber += 1;
    const h = fountainHeadings[i]!;
    await db
      .insert(scenes)
      .values({
        screenplayId: TEST_TEAM_SCREENPLAY_ID,
        number: sceneNumber,
        heading: h.heading,
        intExt: h.parsed!.intExt,
        location: h.parsed!.location,
        timeOfDay: h.parsed!.timeOfDay,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(breakdownElements)
    .values({
      id: TEST_BREAKDOWN_ELEMENT_ID,
      projectId: TEST_TEAM_PROJECT_ID,
      category: SEEDED_BREAKDOWN_ELEMENT_CATEGORY,
      name: SEEDED_BREAKDOWN_ELEMENT_NAME,
      description: null,
    })
    .onConflictDoNothing();

  await db
    .insert(breakdownOccurrences)
    .values({
      id: TEST_BREAKDOWN_OCCURRENCE_ID,
      elementId: TEST_BREAKDOWN_ELEMENT_ID,
      sceneId: TEAM_PROJECT_BREAKDOWN_SCENES[0]!.id,
      screenplayVersionId: TEST_TEAM_SCREENPLAY_VERSION_ID,
      quantity: 1,
      cesareStatus: "accepted" as const,
      isStale: false,
    })
    .onConflictDoNothing();

  // Scene-1 ghosts: consumed by breakdown-ignore spec (which runs first
  // alphabetically). Also consumed individually by OHW-285/286 when
  // running inline-tagging in isolation.
  for (const { occurrenceId, elementId, name } of SEEDED_PENDING_GHOSTS) {
    await db
      .insert(breakdownElements)
      .values({
        id: elementId,
        projectId: TEST_TEAM_PROJECT_ID,
        category: SEEDED_PENDING_ELEMENT_CATEGORY,
        name,
        description: null,
      })
      .onConflictDoNothing();

    await db
      .insert(breakdownOccurrences)
      .values({
        id: occurrenceId,
        elementId,
        sceneId: TEAM_PROJECT_BREAKDOWN_SCENES[0]!.id,
        screenplayVersionId: TEST_TEAM_SCREENPLAY_VERSION_ID,
        quantity: 1,
        cesareStatus: "pending" as const,
        isStale: false,
      })
      .onConflictDoNothing();
  }

  // Scene-2 ghosts: reserved for OHW-284/285/286 in the full suite run.
  // breakdown-ignore only clears scene-1, so these survive to serve those tests.
  for (const {
    occurrenceId,
    elementId,
    name,
  } of SEEDED_PENDING_GHOSTS_SCENE2) {
    await db
      .insert(breakdownElements)
      .values({
        id: elementId,
        projectId: TEST_TEAM_PROJECT_ID,
        category: SEEDED_PENDING_ELEMENT_CATEGORY,
        name,
        description: null,
      })
      .onConflictDoNothing();

    await db
      .insert(breakdownOccurrences)
      .values({
        id: occurrenceId,
        elementId,
        sceneId: TEST_BREAKDOWN_SCENE_2_ID,
        screenplayVersionId: TEST_TEAM_SCREENPLAY_VERSION_ID,
        quantity: 1,
        cesareStatus: "pending" as const,
        isStale: false,
      })
      .onConflictDoNothing();
  }

  console.log("  -> Team project breakdown fixtures seeded");
}

async function seedLocations() {
  // Breakdown element with category "locations" — the sync-from-breakdown
  // test will call syncRequirementsFromBreakdown and expect this to appear
  // as a new requirement (its name doesn't match any seeded requirement).
  await db
    .insert(breakdownElements)
    .values({
      id: SEEDED_LOCATION_BREAKDOWN_ELEMENT_ID,
      projectId: TEST_TEAM_PROJECT_ID,
      category: "locations",
      name: SEEDED_LOCATION_BREAKDOWN_ELEMENT_NAME,
      description: null,
    })
    .onConflictDoNothing();

  await db
    .insert(locationRequirements)
    .values([
      {
        id: SEEDED_LOCATION_REQ_1_ID,
        projectId: TEST_TEAM_PROJECT_ID,
        name: "Appartamento Marta",
        intExt: "INT",
        timeOfDay: ["GIORNO"],
        status: "scouting",
      },
      {
        id: SEEDED_LOCATION_REQ_2_ID,
        projectId: TEST_TEAM_PROJECT_ID,
        name: "Strada del paese",
        intExt: "EXT",
        timeOfDay: ["NOTTE"],
        status: "pending",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(locationCandidates)
    .values([
      {
        id: SEEDED_LOCATION_CANDIDATE_1_ID,
        requirementId: SEEDED_LOCATION_REQ_1_ID,
        name: "Via Tortona 18",
        address: "Via Tortona 18, Milano",
        status: "candidate",
        aiSuggested: false,
      },
      {
        id: SEEDED_LOCATION_CANDIDATE_2_ID,
        requirementId: SEEDED_LOCATION_REQ_1_ID,
        name: "Piazza Wagner 5",
        address: "Piazza Wagner 5, Milano",
        status: "visited",
        aiSuggested: false,
      },
    ])
    .onConflictDoNothing();

  console.log("  -> Location requirements and candidates seeded");
}

/**
 * Seed a sensible default rate-card for the test project so Cast/Troupe in
 * the budget Per-categoria view show populated values right after a fresh
 * seed. Values are baseline daily rates for an Italian indie feature in
 * EUR — they're educational placeholders, not contractual numbers. The real
 * derivation (format × genre × country) is spec 24 cascading pre-fill.
 */
async function seedDefaultRateCard(projectId: string) {
  const entries: Array<{
    name: string;
    role: string;
    rateValue: string;
  }> = [
    // Cast — by archetype
    { name: "Filippo", role: "Protagonista", rateValue: "850" },
    { name: "John", role: "Co-protagonista", rateValue: "700" },
    { name: "Tea", role: "Co-protagonista", rateValue: "700" },
    { name: "Giulio", role: "Caratterista", rateValue: "500" },
    { name: "Nonno", role: "Caratterista", rateValue: "500" },
    { name: "Michele", role: "Caratterista", rateValue: "450" },
    { name: "Luca", role: "Generico", rateValue: "300" },
    { name: "Vecchia 1", role: "Generico", rateValue: "250" },
    { name: "Vecchia 2", role: "Generico", rateValue: "250" },
    { name: "Vecchia 3", role: "Generico", rateValue: "250" },
    { name: "Pubblico", role: "Comparse", rateValue: "120" },
  ];
  await db
    .insert(projectRateCard)
    .values(
      entries.map((e, idx) => ({
        projectId,
        name: e.name,
        role: e.role,
        rateUnit: "giornata" as const,
        rateValue: e.rateValue,
        mealAllowance: "20",
        accommodation: "0",
        fiscalRegime: "piva" as const,
        sortOrder: idx,
      })),
    )
    .onConflictDoNothing();
}

// Default production rates per project, used by estimateSceneCost. Mirrors
// DEFAULT_PRODUCTION_RATES in packages/domain so devs see populated numbers
// after a fresh seed. Editable later via Settings.
async function seedDefaultProductionRates(projectId: string): Promise<void> {
  const entries: Array<{ key: string; value: string; unit: string }> = [
    { key: "castLeadDay",       value: "800",  unit: "day" },
    { key: "castSupportingDay", value: "400",  unit: "day" },
    { key: "crewDopDay",        value: "600",  unit: "day" },
    { key: "crewBaseDay",       value: "200",  unit: "day" },
    { key: "catering",          value: "20",   unit: "meal" },
    { key: "locationSetupExt",  value: "800",  unit: "day" },
    { key: "locationSetupInt",  value: "300",  unit: "day" },
    { key: "equipmentBaseDay",  value: "400",  unit: "day" },
    { key: "sfxBaseDay",        value: "1500", unit: "day" },
    { key: "vfxBasePerShot",    value: "800",  unit: "shot" },
  ];
  await db
    .insert(productionRates)
    .values(entries.map((e) => ({ projectId, ...e })))
    .onConflictDoNothing();
}

// ─── Valerio's project — Budget seed ──────────────────────────────────────────
// Realistic Italian indie short-film budget (13-page comedy, ~3 shooting days).
// Values are educational placeholders in EUR.
const VALERIO_BUDGET_ID = "00000000-0000-4000-a000-000000000070";

async function seedValerioBudget(projectId: string) {
  await db
    .insert(budgets)
    .values({
      id: VALERIO_BUDGET_ID,
      projectId,
      currency: "EUR",
      contingencyPercent: "10",
      shootingDays: 3,
      status: "estimated" as const,
      generatedAt: new Date("2026-04-20T10:00:00Z"),
    })
    .onConflictDoNothing();

  const lines: Array<{
    topSheet: "above_the_line" | "production" | "crew" | "post_production" | "contingency";
    name: string;
    costType: "daily" | "flat" | "weekly" | "unit" | "percentage";
    quantity: string;
    rate: string;
  }> = [
    // Above the line
    { topSheet: "above_the_line", name: "Regia", costType: "daily", quantity: "3", rate: "500" },
    { topSheet: "above_the_line", name: "Sceneggiatura", costType: "flat", quantity: "1", rate: "1500" },
    { topSheet: "above_the_line", name: "Produzione esecutiva", costType: "daily", quantity: "5", rate: "350" },
    // Production
    { topSheet: "production", name: "Location — appartamento", costType: "daily", quantity: "2", rate: "300" },
    { topSheet: "production", name: "Location — pizzeria", costType: "daily", quantity: "1", rate: "450" },
    { topSheet: "production", name: "Trasporti e furgoni", costType: "flat", quantity: "1", rate: "800" },
    { topSheet: "production", name: "Catering (3 gg × 15 persone)", costType: "unit", quantity: "45", rate: "22" },
    { topSheet: "production", name: "Noleggio attrezzatura", costType: "daily", quantity: "3", rate: "650" },
    { topSheet: "production", name: "Noleggio luci", costType: "daily", quantity: "3", rate: "280" },
    { topSheet: "production", name: "Costumi e scenografia", costType: "flat", quantity: "1", rate: "1200" },
    { topSheet: "production", name: "Trucco e acconciature", costType: "daily", quantity: "3", rate: "150" },
    // Crew
    { topSheet: "crew", name: "Direttore della fotografia", costType: "daily", quantity: "3", rate: "400" },
    { topSheet: "crew", name: "Operatore di macchina", costType: "daily", quantity: "3", rate: "280" },
    { topSheet: "crew", name: "Fonico di presa diretta", costType: "daily", quantity: "3", rate: "300" },
    { topSheet: "crew", name: "Microfonista", costType: "daily", quantity: "3", rate: "200" },
    { topSheet: "crew", name: "Elettricista capo", costType: "daily", quantity: "3", rate: "220" },
    { topSheet: "crew", name: "Scenografo", costType: "daily", quantity: "4", rate: "250" },
    { topSheet: "crew", name: "Assistente regia", costType: "daily", quantity: "3", rate: "180" },
    { topSheet: "crew", name: "Segretario di edizione", costType: "daily", quantity: "3", rate: "180" },
    // Post production
    { topSheet: "post_production", name: "Montaggio (settimane)", costType: "weekly", quantity: "2", rate: "1200" },
    { topSheet: "post_production", name: "Color grading", costType: "flat", quantity: "1", rate: "900" },
    { topSheet: "post_production", name: "Mix audio e sound design", costType: "flat", quantity: "1", rate: "1100" },
    { topSheet: "post_production", name: "Musiche originali", costType: "flat", quantity: "1", rate: "800" },
    { topSheet: "post_production", name: "Sottotitoli e DCP", costType: "flat", quantity: "1", rate: "400" },
  ];

  await db
    .insert(budgetLines)
    .values(
      lines.map((l, i) => ({
        budgetId: VALERIO_BUDGET_ID,
        topSheet: l.topSheet,
        name: l.name,
        costType: l.costType,
        quantity: l.quantity,
        rate: l.rate,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing();

  // Cast rows
  const castRows = [
    { name: "Filippo", days: "3", dayRate: "850" },
    { name: "Tea", days: "2", dayRate: "700" },
    { name: "Giulio", days: "1", dayRate: "500" },
    { name: "Nonno (archivio)", days: "1", dayRate: "300" },
    { name: "Michele", days: "1", dayRate: "300" },
    { name: "Luca", days: "1", dayRate: "200" },
  ];
  await db
    .insert(budgetCast)
    .values(
      castRows.map((r, i) => ({
        budgetId: VALERIO_BUDGET_ID,
        name: r.name,
        days: r.days,
        dayRate: r.dayRate,
        rateUnit: "giornata" as const,
        fiscalRegime: "piva" as const,
        mealAllowance: "20",
        accommodation: "0",
        sortOrder: i,
      })),
    )
    .onConflictDoNothing();

  // Crew rows
  const crewRows = [
    { name: "Regia", department: "Regia", days: "3", dayRate: "500" },
    { name: "DOP", department: "Fotografia", days: "3", dayRate: "400" },
    { name: "Operatore A", department: "Fotografia", days: "3", dayRate: "280" },
    { name: "Fonico", department: "Suono", days: "3", dayRate: "300" },
    { name: "Assistente regia", department: "Regia", days: "3", dayRate: "180" },
    { name: "Scenografo", department: "Scenografia", days: "4", dayRate: "250" },
    { name: "Elettricista", department: "Elettrico", days: "3", dayRate: "220" },
  ];
  await db
    .insert(budgetCrew)
    .values(
      crewRows.map((r, i) => ({
        budgetId: VALERIO_BUDGET_ID,
        name: r.name,
        department: r.department,
        days: r.days,
        dayRate: r.dayRate,
        rateUnit: "giornata" as const,
        fiscalRegime: "piva" as const,
        mealAllowance: "20",
        accommodation: "0",
        enabled: true,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing();

  console.log("  -> Valerio budget seeded");
}

// ─── Valerio's project — Schedule seed ────────────────────────────────────────
// 3 shooting days, 9 scenes distributed across them. Starts 2026-06-02.
const VALERIO_SCHEDULE_ID = "00000000-0000-4000-a000-000000000071";
const VALERIO_SHOOTING_DAY_1_ID = "00000000-0000-4000-a000-000000000072";
const VALERIO_SHOOTING_DAY_2_ID = "00000000-0000-4000-a000-000000000073";
const VALERIO_SHOOTING_DAY_3_ID = "00000000-0000-4000-a000-000000000074";

async function seedValerioSchedule(screenplayId: string, projectId: string) {
  await db
    .insert(schedules)
    .values({
      id: VALERIO_SCHEDULE_ID,
      projectId,
      name: "Piano di Lavorazione — Giugno 2026",
      startDate: "2026-06-02",
      countryCode: "IT",
      status: "draft" as const,
    })
    .onConflictDoNothing();

  await db
    .insert(shootingDays)
    .values([
      {
        id: VALERIO_SHOOTING_DAY_1_ID,
        scheduleId: VALERIO_SCHEDULE_ID,
        dayNumber: 1,
        date: "2026-06-02",
        dayType: "shoot" as const,
        crewCallTime: "07:00",
        shootStartTime: "08:00",
        wrapTime: "19:00",
        notes: "Appartamento Filippo — scene INT",
      },
      {
        id: VALERIO_SHOOTING_DAY_2_ID,
        scheduleId: VALERIO_SCHEDULE_ID,
        dayNumber: 2,
        date: "2026-06-03",
        dayType: "shoot" as const,
        crewCallTime: "07:30",
        shootStartTime: "08:30",
        wrapTime: "20:00",
        notes: "Pizzeria — allestimento + scene principali",
      },
      {
        id: VALERIO_SHOOTING_DAY_3_ID,
        scheduleId: VALERIO_SCHEDULE_ID,
        dayNumber: 3,
        date: "2026-06-04",
        dayType: "shoot" as const,
        crewCallTime: "08:00",
        shootStartTime: "09:00",
        wrapTime: "18:00",
        notes: "Pizzeria — finale + esterni",
      },
    ])
    .onConflictDoNothing();

  // Load the scenes for this screenplay in order
  const sceneRows = await db.query.scenes.findMany({
    where: (s, { eq: e }) => e(s.screenplayId, screenplayId),
    orderBy: (s, { asc: a }) => [a(s.number)],
  });

  // Distribute: day 1 → scenes 1-3, day 2 → scenes 4-6, day 3 → scenes 7-9
  const dayAssignments: Array<{ sceneId: string; dayId: string; position: number; hours: number; color: "white" | "yellow" | "blue" | "green" | "red" | "pink" | "grey" }> = [];
  for (let i = 0; i < sceneRows.length; i++) {
    const scene = sceneRows[i]!;
    let dayId: string;
    let color: "white" | "yellow" | "blue" | "green" | "red" | "pink" | "grey";
    if (i < 3) {
      dayId = VALERIO_SHOOTING_DAY_1_ID;
      color = "yellow"; // INT apartment
    } else if (i < 6) {
      dayId = VALERIO_SHOOTING_DAY_2_ID;
      color = "blue"; // pizzeria main
    } else {
      dayId = VALERIO_SHOOTING_DAY_3_ID;
      color = "green"; // finale
    }
    dayAssignments.push({
      sceneId: scene.id,
      dayId,
      position: i % 3,
      hours: 1.5,
      color,
    });
  }

  if (dayAssignments.length > 0) {
    await db
      .insert(strips)
      .values(
        dayAssignments.map((a) => ({
          scheduleId: VALERIO_SCHEDULE_ID,
          shootingDayId: a.dayId,
          sceneId: a.sceneId,
          position: a.position,
          bannerColor: a.color,
          estimatedHours: a.hours,
        })),
      )
      .onConflictDoNothing();
  }

  console.log(`  -> Valerio schedule seeded (${sceneRows.length} strips across 3 days)`);
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
